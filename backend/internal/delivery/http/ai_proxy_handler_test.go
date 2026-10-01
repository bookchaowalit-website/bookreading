package http

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/infrastructure/aiservice"
	"github.com/bookreading/backend/internal/usecase"
)

const aiProxyServiceToken = "fixture-service-token"

type aiUpstreamCall struct {
	method, path, query, auth, cookie, body string
}

type aiUpstream struct {
	mu     sync.Mutex
	calls  []aiUpstreamCall
	status int
}

func (u *aiUpstream) snapshot() []aiUpstreamCall {
	u.mu.Lock()
	defer u.mu.Unlock()
	return append([]aiUpstreamCall(nil), u.calls...)
}

func newAIProxyFixture(t *testing.T) (*AIProxyHandler, *aiUpstream, string) {
	t.Helper()
	p, up, token, _, _ := newAIProxyRoleFixture(t)
	return p, up, token
}

// newAIProxyRoleFixture returns tokens for a regular user and an admin, plus
// the user repository so tests can change roles or simulate outages.
func newAIProxyRoleFixture(t *testing.T) (*AIProxyHandler, *aiUpstream, string, string, *fakeUserRepo) {
	t.Helper()
	up := &aiUpstream{status: http.StatusOK}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		up.mu.Lock()
		up.calls = append(up.calls, aiUpstreamCall{
			method: r.Method, path: r.URL.Path, query: r.URL.RawQuery,
			auth: r.Header.Get("Authorization"), cookie: r.Header.Get("Cookie"), body: string(b),
		})
		status := up.status
		up.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "upstream=1")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"translated_text":"ok"}`))
	}))
	t.Cleanup(srv.Close)

	reader := &domain.User{ID: "user-1", Email: "reader@example.test", Role: domain.RoleUser}
	admin := &domain.User{ID: "admin-1", Email: "admin@example.test", Role: domain.RoleAdmin}
	repo := newFakeUserRepo(reader, admin)
	users := usecase.NewUserUsecase(repo, nil, nil, "fixture-jwt-secret")
	token, err := users.GenerateToken(reader)
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	adminToken, err := users.GenerateToken(admin)
	if err != nil {
		t.Fatalf("GenerateToken: %v", err)
	}
	h := &Handler{userUsecase: users}
	client := aiservice.NewAIServiceClient(srv.URL, aiProxyServiceToken)
	return NewAIProxyHandler(client, h.AuthMiddleware, h.AdminMiddleware), up, token, adminToken, repo
}

func serveAI(p *AIProxyHandler, method, target, body string, mutate func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/", strings.NewReader(body))
	u, err := url.Parse(target)
	if err != nil {
		panic(err)
	}
	req.URL = u
	req.RequestURI = target
	req.ContentLength = int64(len(body))
	if mutate != nil {
		mutate(req)
	}
	w := httptest.NewRecorder()
	p.ServeHTTP(w, req)
	return w
}

func TestAIProxyRejectsUnauthenticatedWithoutUpstreamCall(t *testing.T) {
	p, up, _ := newAIProxyFixture(t)
	for _, auth := range []string{"", "Bearer not-a-jwt", "Bearer " + aiProxyServiceToken} {
		for _, target := range []string{"/api/ai/translate", "/api/ai/scrape", "/api/ai/review/approve"} {
			w := serveAI(p, http.MethodPost, target, `{"text":"x"}`, func(r *http.Request) {
				if auth != "" {
					r.Header.Set("Authorization", auth)
				}
			})
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("%s auth=%q: status %d, want 401", target, auth, w.Code)
			}
		}
	}
	w := serveAI(p, http.MethodGet, "/api/ai/review/pending?limit=100", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("review/pending without session: status %d", w.Code)
	}
	if calls := up.snapshot(); len(calls) != 0 {
		t.Fatalf("upstream called for unauthenticated requests: %+v", calls)
	}
}

func TestAIProxyForwardsServiceTokenNotUserToken(t *testing.T) {
	p, up, token := newAIProxyFixture(t)

	w := serveAI(p, http.MethodPost, "/api/ai/translate", `{"text":"你好","source_lang":"zh"}`, func(r *http.Request) {
		r.Header.Set("Authorization", "Bearer "+token)
	})
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "translated_text") {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Set-Cookie") != "" {
		t.Fatal("upstream Set-Cookie must not be relayed")
	}

	// Browser clients authenticate with the HTTP-only cookie.
	w = serveAI(p, http.MethodGet, "/api/ai/terminology/novel-42?x=1", "", func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: "auth_token", Value: token})
	})
	if w.Code != http.StatusOK {
		t.Fatalf("cookie auth: status %d", w.Code)
	}

	calls := up.snapshot()
	if len(calls) != 2 {
		t.Fatalf("want 2 upstream calls, got %d", len(calls))
	}
	for _, c := range calls {
		if c.auth != "Bearer "+aiProxyServiceToken {
			t.Fatalf("upstream Authorization = %q, want service token", c.auth)
		}
		if strings.Contains(c.auth, token) || c.cookie != "" {
			t.Fatal("user credentials leaked upstream")
		}
	}
	if calls[0].method != http.MethodPost || calls[0].path != "/translate" || calls[0].body != `{"text":"你好","source_lang":"zh"}` {
		t.Fatalf("unexpected translate call: %+v", calls[0])
	}
	if calls[1].method != http.MethodGet || calls[1].path != "/terminology/novel-42" || calls[1].query != "x=1" {
		t.Fatalf("unexpected terminology call: %+v", calls[1])
	}
}

func TestAIProxyRejectsTraversalAndUnlistedPaths(t *testing.T) {
	p, up, token := newAIProxyFixture(t)
	cases := map[string]int{
		"/api/ai/../admin":                 http.StatusBadRequest,
		"/api/ai/terminology/../docs":      http.StatusBadRequest,
		"/api/ai/%2e%2e/openapi.json":      http.StatusBadRequest,
		"/api/ai/terminology/..%2fdocs":    http.StatusBadRequest,
		"/api/ai/terminology/a%2Fb":        http.StatusBadRequest,
		"/api/ai//translate":               http.StatusBadRequest,
		"/api/ai/./translate":              http.StatusBadRequest,
		"/api/ai/docs":                     http.StatusNotFound,
		"/api/ai/openapi.json":             http.StatusNotFound,
		"/api/ai/translate/pipeline":       http.StatusNotFound,
		"/api/ai/review/item-1":            http.StatusNotFound,
		"/api/ai/approved/novel/1":         http.StatusNotFound,
		"/api/ai/terminology/a.b":          http.StatusNotFound,
		"/api/ai/terminology/known/extra":  http.StatusNotFound,
		"/api/ai":                          http.StatusNotFound,
		"/api/aix/translate":               http.StatusNotFound,
		"/api/ai/http://169.254.169.254/x": http.StatusBadRequest,
	}
	for target, want := range cases {
		w := serveAI(p, http.MethodGet, target, "", func(r *http.Request) {
			r.Header.Set("Authorization", "Bearer "+token)
		})
		if w.Code != want {
			t.Errorf("%s: status %d, want %d", target, w.Code, want)
		}
	}
	if calls := up.snapshot(); len(calls) != 0 {
		t.Fatalf("upstream reached for rejected paths: %+v", calls)
	}
}

func TestAIProxyEnforcesMethodAndBodyLimits(t *testing.T) {
	p, up, token := newAIProxyFixture(t)
	auth := func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token) }

	if w := serveAI(p, http.MethodGet, "/api/ai/translate", "", auth); w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET translate: status %d", w.Code)
	}
	if w := serveAI(p, http.MethodDelete, "/api/ai/review/stats", "", auth); w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("DELETE review/stats: status %d", w.Code)
	}
	big := `{"text":"` + strings.Repeat("x", int(aiProxyDefaultMaxBody)) + `"}`
	if w := serveAI(p, http.MethodPost, "/api/ai/translate", big, auth); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized translate: status %d", w.Code)
	}
	// Chunked (unknown length) oversized bodies are cut off too.
	w := serveAI(p, http.MethodPost, "/api/ai/translate", big, func(r *http.Request) {
		auth(r)
		r.ContentLength = -1
	})
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized chunked translate: status %d", w.Code)
	}
	// Manga images get the larger cap.
	if w := serveAI(p, http.MethodPost, "/api/ai/manga/translate", big, auth); w.Code != http.StatusOK {
		t.Fatalf("manga image under image cap: status %d", w.Code)
	}
	if n := len(up.snapshot()); n != 1 {
		t.Fatalf("want only the manga call upstream, got %d", n)
	}
}

func TestAIProxyPublicMetadataAndUpstreamAuthFailure(t *testing.T) {
	p, up, token := newAIProxyFixture(t)

	if w := serveAI(p, http.MethodGet, "/api/ai/manga/supported-sites", "", nil); w.Code != http.StatusOK {
		t.Fatalf("public supported-sites: status %d", w.Code)
	}

	up.mu.Lock()
	up.status = http.StatusUnauthorized
	up.mu.Unlock()
	w := serveAI(p, http.MethodPost, "/api/ai/translate", `{}`, func(r *http.Request) {
		r.Header.Set("Authorization", "Bearer "+token)
	})
	if w.Code != http.StatusBadGateway {
		t.Fatalf("upstream 401 must surface as 502 (not log the user out), got %d", w.Code)
	}
}

func TestAIProxyUpstreamUnavailable(t *testing.T) {
	users := usecase.NewUserUsecase(nil, nil, nil, "fixture-jwt-secret")
	token, _ := users.GenerateToken(&domain.User{ID: "user-1"})
	h := &Handler{userUsecase: users}
	p := NewAIProxyHandler(aiservice.NewAIServiceClient("http://127.0.0.1:1", aiProxyServiceToken), h.AuthMiddleware, h.AdminMiddleware)
	w := serveAI(p, http.MethodPost, "/api/ai/translate", `{}`, func(r *http.Request) {
		r.Header.Set("Authorization", "Bearer "+token)
	})
	if w.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", w.Code)
	}
	if strings.Contains(w.Body.String(), "127.0.0.1") {
		t.Fatal("upstream address leaked in error body")
	}
}

func TestAIProxyReviewModerationRequiresAdmin(t *testing.T) {
	p, up, userToken, adminToken, repo := newAIProxyRoleFixture(t)
	bearer := func(tok string) func(*http.Request) {
		return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) }
	}
	moderation := []string{"/api/ai/review/approve", "/api/ai/review/edit", "/api/ai/review/reject"}

	for _, target := range moderation {
		if w := serveAI(p, http.MethodPost, target, `{"id":"r1"}`, bearer(userToken)); w.Code != http.StatusForbidden {
			t.Fatalf("user %s: status %d, want 403", target, w.Code)
		}
	}
	if calls := up.snapshot(); len(calls) != 0 {
		t.Fatalf("upstream called for forbidden moderation: %+v", calls)
	}

	// Reading the queue stays open to signed-in users.
	if w := serveAI(p, http.MethodGet, "/api/ai/review/pending", "", bearer(userToken)); w.Code != http.StatusOK {
		t.Fatalf("user review/pending: status %d", w.Code)
	}

	for _, target := range moderation {
		if w := serveAI(p, http.MethodPost, target, `{"id":"r1"}`, bearer(adminToken)); w.Code != http.StatusOK {
			t.Fatalf("admin %s: status %d, want 200", target, w.Code)
		}
	}
	if n := len(up.snapshot()); n != 1+len(moderation) {
		t.Fatalf("upstream calls = %d, want %d", n, 1+len(moderation))
	}

	// The role is read from the user record, not the token: a demotion
	// applies to an already-issued admin token.
	repo.users["admin-1"].Role = domain.RoleUser
	if w := serveAI(p, http.MethodPost, "/api/ai/review/approve", `{}`, bearer(adminToken)); w.Code != http.StatusForbidden {
		t.Fatalf("demoted admin: status %d, want 403", w.Code)
	}

	// A user lookup failure is not reported as a permission decision.
	repo.getErr = errors.New("db down")
	if w := serveAI(p, http.MethodPost, "/api/ai/review/approve", `{}`, bearer(adminToken)); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("lookup failure: status %d, want 503", w.Code)
	}
	repo.getErr = nil
	delete(repo.users, "admin-1")
	if w := serveAI(p, http.MethodPost, "/api/ai/review/approve", `{}`, bearer(adminToken)); w.Code != http.StatusUnauthorized {
		t.Fatalf("deleted user: status %d, want 401", w.Code)
	}
}

func TestAIProxyWithoutAdminMiddlewareDeniesModeration(t *testing.T) {
	users := usecase.NewUserUsecase(nil, nil, nil, "fixture-jwt-secret")
	h := &Handler{userUsecase: users}
	p := NewAIProxyHandler(aiservice.NewAIServiceClient("http://127.0.0.1:1", aiProxyServiceToken), h.AuthMiddleware, nil)
	if w := serveAI(p, http.MethodPost, "/api/ai/review/approve", `{}`, nil); w.Code != http.StatusForbidden {
		t.Fatalf("status %d, want 403", w.Code)
	}
}
