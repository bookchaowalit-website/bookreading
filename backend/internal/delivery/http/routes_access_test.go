package http

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/bookreading/backend/internal/domain"
)

// These tests walk the real route table (every pattern NewServerWithDeps
// registers) and pin the access level of each route and method. A route that
// is added without an entry in routeAccess fails, and so does any
// state-changing method an anonymous caller can reach unless it is on the
// short publicWrites allow-list.

type accessLevel string

const (
	notServed   accessLevel = "405"    // method not allowed for anyone
	levelPublic accessLevel = "public" // anonymous callers reach the handler
	levelAuth   accessLevel = "auth"   // AuthMiddleware: any signed-in user
	levelAdmin  accessLevel = "admin"  // AdminMiddleware: admin role
)

var probeMethods = []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete}

func isStateChanging(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

// anyMethod serves every method at one level (handlers that do not switch on
// the method, wrapped whole in a middleware).
func anyMethod(l accessLevel) map[string]accessLevel {
	m := map[string]accessLevel{}
	for _, method := range probeMethods {
		m[method] = l
	}
	return m
}

const aiProxyPattern = AIProxyPrefix + "/"

// routeAccess is the declared access level per route and method. Methods not
// listed must answer 405. "/api/ai/" is checked path by path in
// TestAIProxyRouteAccess.
var routeAccess = map[string]map[string]accessLevel{
	// Auth endpoints: public by design.
	"/api/auth/register": {http.MethodPost: levelPublic},
	"/api/auth/login":    {http.MethodPost: levelPublic},
	"/api/auth/logout":   {http.MethodPost: levelPublic}, // only clears the caller's cookie
	"/api/auth/refresh":  anyMethod(levelAuth),

	"/api/users/me":        anyMethod(levelAuth),
	"/api/users/me/update": anyMethod(levelAuth),
	"/api/users/me/delete": anyMethod(levelAuth),

	"/api/library":     {http.MethodGet: levelAuth, http.MethodPost: levelAuth, http.MethodDelete: levelAuth},
	"/api/terminology": {http.MethodGet: levelAuth, http.MethodPost: levelAuth, http.MethodDelete: levelAuth},

	// Shared catalog: public reads, admin-only writes.
	"/api/novels":             {http.MethodGet: levelPublic, http.MethodPost: levelAdmin},
	"/api/novels/detail":      {http.MethodGet: levelPublic},
	"/api/chapters":           {http.MethodGet: levelPublic},
	"/api/chapters/detail":    {http.MethodGet: levelPublic},
	"/api/chapters/by-number": {http.MethodGet: levelPublic},
	"/api/chapters/update":    {http.MethodPost: levelAdmin, http.MethodPut: levelAdmin},
	// Server-side AI translation: signed in. Saving translated_text needs
	// admin too (TestTranslateSaveIsAdminOnly).
	"/api/chapters/translate":   {http.MethodPost: levelAuth},
	"/api/translations/history": {http.MethodGet: levelPublic},
	"/api/translations/cached":  {http.MethodGet: levelPublic},

	"/api/subscriptions":                {http.MethodGet: levelAuth, http.MethodPost: levelAuth, http.MethodDelete: levelAuth},
	"/api/subscriptions/trigger-update": {http.MethodPost: levelAdmin},
	"/api/subscriptions/history":        anyMethod(levelAuth),
	"/api/reading-progress":             {http.MethodGet: levelAuth, http.MethodPost: levelAuth},
	"/api/reading-progress/novel":       anyMethod(levelAuth),
	"/api/bookmarks":                    {http.MethodGet: levelAuth, http.MethodPost: levelAuth, http.MethodDelete: levelAuth},
	"/api/bookmarks/novel":              anyMethod(levelAuth),
	"/api/feedback":                     {http.MethodGet: levelAuth, http.MethodPost: levelAuth},
	"/api/feedback/chapter":             anyMethod(levelAuth),
	"/api/feedback/quality-score":       anyMethod(levelAuth),
	"/api/settings/api-keys":            {http.MethodGet: levelAuth, http.MethodPost: levelAuth, http.MethodDelete: levelAuth},

	// Stripe calls the webhook; it authenticates by signature, not session.
	"/api/payments/stripe/webhook":        {http.MethodPost: levelPublic},
	"/api/payments/plans":                 anyMethod(levelAuth),
	"/api/payments/stripe/checkout":       anyMethod(levelAuth),
	"/api/payments/stripe/billing-portal": anyMethod(levelAuth),
	"/api/payments/stripe/cancel":         anyMethod(levelAuth),
	"/api/payments/subscription":          anyMethod(levelAuth),

	aiProxyPattern: nil,

	"/api/health":          {http.MethodGet: levelPublic},
	"/api/ready":           {http.MethodGet: levelPublic},
	"/api/health/detailed": {http.MethodGet: levelPublic},
}

// publicWrites are the only state-changing route+methods an anonymous caller
// may reach. Adding to this list needs a security reason in review.
var publicWrites = map[string]bool{
	"POST /api/auth/register":           true,
	"POST /api/auth/login":              true,
	"POST /api/auth/logout":             true,
	"POST /api/payments/stripe/webhook": true,
}

// probeOnce sends one request to a fresh server (so a DELETE /api/users/me
// probe cannot affect the next one). Handlers run against mostly empty
// dependencies; a panic past the middleware still means the request was
// served, which is all the access check needs.
func probeOnce(t *testing.T, token, method, target string) (code int, errMsg string) {
	t.Helper()
	f := newOwnershipFixture(t)
	if token != "" {
		switch token {
		case "alice":
			token = f.aliceToken
		case "admin":
			token = f.adminToken
		}
	}
	defer func() {
		if r := recover(); r != nil {
			code, errMsg = http.StatusOK, "" // reached the handler
		}
	}()
	w, body := f.do(t, token, method, target, "")
	if s, ok := body["error"].(string); ok {
		errMsg = s
	} else {
		errMsg = strings.TrimSpace(w.Body.String())
	}
	return w.Code, errMsg
}

func blockedBySession(code int, msg string) bool {
	return code == http.StatusUnauthorized && msg == "Authorization required"
}

func blockedByAdmin(code int, msg string) bool {
	return code == http.StatusForbidden && msg == "Admin role required"
}

// observeAccess finds the least-privileged caller (anonymous, user, admin)
// that gets past the middleware for method+target.
func observeAccess(t *testing.T, method, target string) accessLevel {
	t.Helper()
	served := func(code int) accessLevel {
		if code == http.StatusMethodNotAllowed {
			return notServed
		}
		return ""
	}
	code, msg := probeOnce(t, "", method, target)
	if !blockedBySession(code, msg) {
		if l := served(code); l != "" {
			return l
		}
		return levelPublic
	}
	code, msg = probeOnce(t, "alice", method, target)
	if blockedBySession(code, msg) {
		t.Fatalf("%s %s: valid user token rejected (%d %q)", method, target, code, msg)
	}
	if !blockedByAdmin(code, msg) {
		if l := served(code); l != "" {
			return l
		}
		return levelAuth
	}
	code, msg = probeOnce(t, "admin", method, target)
	if blockedBySession(code, msg) || blockedByAdmin(code, msg) {
		t.Fatalf("%s %s: admin token rejected (%d %q)", method, target, code, msg)
	}
	if l := served(code); l != "" {
		return l
	}
	return levelAdmin
}

func checkAccess(t *testing.T, pattern, target string, want map[string]accessLevel) {
	t.Helper()
	for _, method := range probeMethods {
		expected, ok := want[method]
		if !ok {
			expected = notServed
		}
		got := observeAccess(t, method, target)
		if got != expected {
			t.Errorf("%s %s: access %q, want %q", method, target, got, expected)
		}
		if got == levelPublic && isStateChanging(method) && !publicWrites[method+" "+pattern] {
			t.Errorf("%s %s: state-changing route is reachable without a session", method, target)
		}
	}
}

func TestEveryRouteHasDeclaredAccess(t *testing.T) {
	routes := newOwnershipFixture(t).routes
	if len(routes) == 0 {
		t.Fatal("route table is empty")
	}
	registered := map[string]bool{}
	for _, p := range routes {
		registered[p] = true
		if _, ok := routeAccess[p]; !ok {
			t.Errorf("route %q has no entry in routeAccess: classify it (public read, auth, admin)", p)
		}
	}
	for p := range routeAccess {
		if !registered[p] {
			t.Errorf("routeAccess lists %q, which the server no longer registers", p)
		}
	}
}

func TestRouteAccessLevels(t *testing.T) {
	routes := append([]string(nil), newOwnershipFixture(t).routes...)
	sort.Strings(routes)
	for _, pattern := range routes {
		want, ok := routeAccess[pattern]
		if !ok || pattern == aiProxyPattern {
			continue // reported by TestEveryRouteHasDeclaredAccess / TestAIProxyRouteAccess
		}
		t.Run(pattern, func(t *testing.T) { checkAccess(t, pattern, pattern, want) })
	}
}

func TestAIProxyRouteAccess(t *testing.T) {
	paths := map[string]aiRoute{"/terminology/n1": {method: http.MethodGet}}
	for p, r := range aiProxyRoutes {
		paths[p] = r
	}
	for p, r := range paths {
		level := levelAuth
		switch {
		case r.public:
			level = levelPublic
		case r.admin:
			level = levelAdmin
		}
		target := AIProxyPrefix + p
		t.Run(p, func(t *testing.T) {
			checkAccess(t, aiProxyPattern, target, map[string]accessLevel{r.method: level})
		})
	}
}

// fakeChapterUC records writes so tests can assert nothing was saved.
type fakeChapterUC struct {
	mu    sync.Mutex
	saved map[string]string
}

func (f *fakeChapterUC) GetChapter(_ context.Context, id string) (*domain.Chapter, error) {
	return &domain.Chapter{ID: id, NovelID: "n1", Content: "original"}, nil
}
func (f *fakeChapterUC) GetChapterByNumber(context.Context, string, int) (*domain.Chapter, error) {
	return nil, nil
}
func (f *fakeChapterUC) ListChapters(context.Context, string, int, int) ([]*domain.Chapter, int, error) {
	return nil, 0, nil
}
func (f *fakeChapterUC) TranslateChapter(_ context.Context, id, _ string, _ bool) (*domain.Chapter, error) {
	return &domain.Chapter{ID: id, Content: "ai", IsTranslated: true}, nil
}
func (f *fakeChapterUC) SaveChapter(context.Context, string, *domain.ScrapedChapter) error {
	return nil
}
func (f *fakeChapterUC) SaveTranslatedContent(_ context.Context, id, text string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved[id] = text
	return nil
}
func (f *fakeChapterUC) UpdateChapter(_ context.Context, c *domain.Chapter) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved[c.ID] = c.Content
	return nil
}

func TestChapterWritesNeedAdmin(t *testing.T) {
	chapters := &fakeChapterUC{saved: map[string]string{}}
	f := newOwnershipFixtureWith(t, func(d *ServerDependencies) { d.ChapterUsecase = chapters })
	save := `{"target_lang":"th","translated_text":"vandal"}`

	cases := []struct {
		name, token, method, target, body string
		want                              int
	}{
		{"anonymous translate save", "", http.MethodPost, "/api/chapters/translate?id=c1", save, http.StatusUnauthorized},
		{"user translate save", f.aliceToken, http.MethodPost, "/api/chapters/translate?id=c1", save, http.StatusForbidden},
		{"anonymous update", "", http.MethodPost, "/api/chapters/update?id=c1", `{"content":"vandal"}`, http.StatusUnauthorized},
		{"user update", f.aliceToken, http.MethodPost, "/api/chapters/update?id=c1", `{"content":"vandal"}`, http.StatusForbidden},
		{"anonymous scrape", "", http.MethodPost, "/api/novels", `{"url":"https://example.test/n"}`, http.StatusUnauthorized},
		{"user scrape", f.aliceToken, http.MethodPost, "/api/novels", `{"url":"https://example.test/n"}`, http.StatusForbidden},
	}
	for _, tc := range cases {
		if w, _ := f.do(t, tc.token, tc.method, tc.target, tc.body); w.Code != tc.want {
			t.Errorf("%s: %d %s, want %d", tc.name, w.Code, w.Body, tc.want)
		}
	}
	if len(chapters.saved) != 0 {
		t.Fatalf("non-admin requests wrote chapters: %v", chapters.saved)
	}

	// A signed-in user may still run the server-side translation.
	if w, _ := f.do(t, f.aliceToken, http.MethodPost, "/api/chapters/translate?id=c1", `{"target_lang":"th"}`); w.Code != http.StatusOK {
		t.Fatalf("user server-side translate: %d %s", w.Code, w.Body)
	}
	// Admins can save and update.
	if w, _ := f.do(t, f.adminToken, http.MethodPost, "/api/chapters/translate?id=c1", save); w.Code != http.StatusOK {
		t.Fatalf("admin translate save: %d %s", w.Code, w.Body)
	}
	if w, _ := f.do(t, f.adminToken, http.MethodPost, "/api/chapters/update?id=c2", `{"content":"fixed"}`); w.Code != http.StatusOK {
		t.Fatalf("admin update: %d %s", w.Code, w.Body)
	}
	if chapters.saved["c1"] != "vandal" || chapters.saved["c2"] != "fixed" {
		t.Fatalf("admin writes not saved: %v", chapters.saved)
	}
}

func TestBearerToken(t *testing.T) {
	for header, want := range map[string]string{
		"":                 "",
		"Bearer abc":       "abc",
		"bearer abc":       "abc",
		"Bearer  abc ":     "abc",
		"Bearer null":      "",
		"Bearer undefined": "",
		"Bearer ":          "",
		"Token abc":        "",
		"abc":              "",
	} {
		if got := bearerToken(header); got != want {
			t.Errorf("bearerToken(%q) = %q, want %q", header, got, want)
		}
	}
}

// "Bearer null" from browser code without a stored token must not mask the
// session cookie.
func TestAuthMiddlewareFallsBackToCookieForPlaceholderHeader(t *testing.T) {
	f := newOwnershipFixture(t)
	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.RemoteAddr = fmt.Sprintf("10.255.%d.1:1234", ownershipIP.Add(1)&255)
	req.Header.Set("Authorization", "Bearer null")
	req.AddCookie(&http.Cookie{Name: "auth_token", Value: f.aliceToken})
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("cookie session with placeholder header: %d %s", w.Code, w.Body)
	}
}
