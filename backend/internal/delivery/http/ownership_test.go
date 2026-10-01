package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/usecase"
)

// These tests drive the real route table (NewServerWithDeps) with in-memory
// repositories and assert that per-user routes act only on the session user,
// whatever user_id / id the request names.

type fakeSubRepo struct {
	mu   sync.Mutex
	subs map[string]*domain.NovelSubscription
	seq  int
}

func (r *fakeSubRepo) Create(s *domain.NovelSubscription) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	s.ID = fmt.Sprintf("sub-%d", r.seq)
	c := *s
	r.subs[s.ID] = &c
	return nil
}
func (r *fakeSubRepo) GetByID(id string) (*domain.NovelSubscription, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s, ok := r.subs[id]; ok {
		c := *s
		return &c, nil
	}
	return nil, nil
}
func (r *fakeSubRepo) GetByNovelID(novelID string) (*domain.NovelSubscription, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range r.subs {
		if s.NovelID == novelID {
			c := *s
			return &c, nil
		}
	}
	return nil, nil
}
func (r *fakeSubRepo) GetByUserID(userID string) ([]domain.NovelSubscription, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.NovelSubscription
	for _, s := range r.subs {
		if s.UserID != nil && *s.UserID == userID {
			out = append(out, *s)
		}
	}
	return out, nil
}
func (r *fakeSubRepo) GetDueForUpdate() ([]domain.NovelSubscription, error) { return nil, nil }
func (r *fakeSubRepo) Update(*domain.NovelSubscription) error               { return nil }
func (r *fakeSubRepo) Delete(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.subs, id)
	return nil
}
func (r *fakeSubRepo) UpdateLastChecked(string, int) error { return nil }

type fakeBookmarkRepo struct {
	mu sync.Mutex
	bm map[string]*domain.Bookmark
}

func (r *fakeBookmarkRepo) Create(_ context.Context, b *domain.Bookmark) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if b.ID == "" {
		b.ID = fmt.Sprintf("bm-%d", len(r.bm)+1)
	}
	c := *b
	r.bm[b.ID] = &c
	return nil
}
func (r *fakeBookmarkRepo) GetByID(_ context.Context, id string) (*domain.Bookmark, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if b, ok := r.bm[id]; ok {
		c := *b
		return &c, nil
	}
	return nil, nil
}
func (r *fakeBookmarkRepo) GetByUserID(_ context.Context, userID string) ([]domain.Bookmark, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.Bookmark
	for _, b := range r.bm {
		if b.UserID == userID {
			out = append(out, *b)
		}
	}
	return out, nil
}
func (r *fakeBookmarkRepo) GetByNovelID(ctx context.Context, userID, novelID string) ([]domain.Bookmark, error) {
	all, _ := r.GetByUserID(ctx, userID)
	var out []domain.Bookmark
	for _, b := range all {
		if b.NovelID == novelID {
			out = append(out, b)
		}
	}
	return out, nil
}
func (r *fakeBookmarkRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.bm, id)
	return nil
}

type fakeProgressRepo struct {
	mu   sync.Mutex
	rows []domain.ReadingProgress
}

func (r *fakeProgressRepo) Create(ctx context.Context, p *domain.ReadingProgress) error {
	return r.Upsert(ctx, p)
}
func (r *fakeProgressRepo) GetByUserID(_ context.Context, userID string) ([]domain.ReadingProgress, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.ReadingProgress
	for _, p := range r.rows {
		if p.UserID == userID {
			out = append(out, p)
		}
	}
	return out, nil
}
func (r *fakeProgressRepo) GetByNovelID(ctx context.Context, userID, novelID string) (*domain.ReadingProgress, error) {
	all, _ := r.GetByUserID(ctx, userID)
	for _, p := range all {
		if p.NovelID == novelID {
			return &p, nil
		}
	}
	return nil, nil
}
func (r *fakeProgressRepo) Update(ctx context.Context, p *domain.ReadingProgress) error {
	return r.Upsert(ctx, p)
}
func (r *fakeProgressRepo) Upsert(_ context.Context, p *domain.ReadingProgress) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows = append(r.rows, *p)
	return nil
}
func (r *fakeProgressRepo) Delete(context.Context, string) error { return nil }

type fakeFeedbackRepo struct {
	mu   sync.Mutex
	rows []domain.TranslationFeedback
}

func (r *fakeFeedbackRepo) Create(_ context.Context, f *domain.TranslationFeedback) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rows = append(r.rows, *f)
	return nil
}
func (r *fakeFeedbackRepo) GetByChapter(context.Context, string, int) ([]domain.TranslationFeedback, error) {
	return nil, nil
}
func (r *fakeFeedbackRepo) GetByUserID(_ context.Context, userID string) ([]domain.TranslationFeedback, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.TranslationFeedback
	for _, f := range r.rows {
		if f.UserID != nil && *f.UserID == userID {
			out = append(out, f)
		}
	}
	return out, nil
}
func (r *fakeFeedbackRepo) GetQualityScore(context.Context, string, int) (*domain.ChapterQualityScore, error) {
	return &domain.ChapterQualityScore{}, nil
}

type fakeTermRepo struct {
	mu    sync.Mutex
	terms map[string]domain.UserTerminology
}

func (r *fakeTermRepo) Create(_ context.Context, t *domain.UserTerminology) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.terms[t.ID] = *t
	return nil
}
func (r *fakeTermRepo) GetByUserID(_ context.Context, userID string) ([]domain.UserTerminology, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.UserTerminology
	for _, t := range r.terms {
		if t.UserID == userID {
			out = append(out, t)
		}
	}
	return out, nil
}
func (r *fakeTermRepo) Update(context.Context, *domain.UserTerminology) error { return nil }
func (r *fakeTermRepo) Delete(_ context.Context, userID, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.terms[id]
	if !ok || t.UserID != userID {
		return domain.ErrNotFound
	}
	delete(r.terms, id)
	return nil
}

type ownershipFixture struct {
	handler              http.Handler
	aliceToken, bobToken string
	adminToken           string
	subs                 *fakeSubRepo
	bookmarks            *fakeBookmarkRepo
	progress             *fakeProgressRepo
	feedback             *fakeFeedbackRepo
	terms                *fakeTermRepo
}

// ownershipIP gives each request its own client IP so the package-level
// rate limiters never interfere with these tests.
var ownershipIP atomic.Int64

func newOwnershipFixture(t *testing.T) *ownershipFixture {
	t.Helper()
	alice := &domain.User{ID: "alice", Email: "alice@example.test", Role: domain.RoleUser}
	bob := &domain.User{ID: "bob", Email: "bob@example.test", Role: domain.RoleUser}
	admin := &domain.User{ID: "root", Email: "root@example.test", Role: domain.RoleAdmin}
	users := newFakeUserRepo(alice, bob, admin)
	f := &ownershipFixture{
		subs:      &fakeSubRepo{subs: map[string]*domain.NovelSubscription{}},
		bookmarks: &fakeBookmarkRepo{bm: map[string]*domain.Bookmark{}},
		progress:  &fakeProgressRepo{},
		feedback:  &fakeFeedbackRepo{},
		terms:     &fakeTermRepo{terms: map[string]domain.UserTerminology{}},
	}
	userUC := usecase.NewUserUsecase(users, nil, f.terms, "fixture-jwt-secret")
	deps := &ServerDependencies{
		UserRepo:                   users,
		UserUsecase:                userUC,
		NovelUpdateUseCase:         usecase.NewNovelUpdateUseCase(f.subs, nil, nil, nil),
		ReadingProgressUseCase:     usecase.NewReadingProgressUseCase(f.progress, f.bookmarks),
		BookmarkUseCase:            usecase.NewBookmarkUseCase(f.bookmarks),
		TranslationFeedbackUseCase: usecase.NewTranslationFeedbackUseCase(f.feedback),
	}
	f.handler = NewServerWithDeps(deps, "0").server.Handler
	for _, p := range []struct {
		u   *domain.User
		dst *string
	}{{alice, &f.aliceToken}, {bob, &f.bobToken}, {admin, &f.adminToken}} {
		tok, err := userUC.GenerateToken(p.u)
		if err != nil {
			t.Fatalf("GenerateToken: %v", err)
		}
		*p.dst = tok
	}
	return f
}

func (f *ownershipFixture) do(t *testing.T, token, method, target, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	n := ownershipIP.Add(1)
	req.RemoteAddr = fmt.Sprintf("10.%d.%d.%d:1234", (n>>16)&255, (n>>8)&255, n&255)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

func dataLen(t *testing.T, body map[string]any) int {
	t.Helper()
	switch d := body["data"].(type) {
	case nil:
		return 0
	case []any:
		return len(d)
	default:
		t.Fatalf("data is %T, want list", d)
		return 0
	}
}

func TestSubscriptionsAreScopedToSessionUser(t *testing.T) {
	f := newOwnershipFixture(t)

	// Alice subscribes; the stored owner is the session user, not a body field.
	w, body := f.do(t, f.aliceToken, http.MethodPost, "/api/subscriptions",
		`{"novel_id":"n1","source_url":"https://example.test/n1","source_type":"novel","user_id":"bob"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("alice subscribe: %d %s", w.Code, w.Body)
	}
	aliceSub := body["data"].(map[string]any)["id"].(string)
	if got := *f.subs.subs[aliceSub].UserID; got != "alice" {
		t.Fatalf("subscription owner = %q, want alice", got)
	}

	// Bob subscribing to the same novel gets his own row, not Alice's.
	w, body = f.do(t, f.bobToken, http.MethodPost, "/api/subscriptions",
		`{"novel_id":"n1","source_url":"https://example.test/n1","source_type":"novel"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("bob subscribe: %d %s", w.Code, w.Body)
	}
	if id := body["data"].(map[string]any)["id"].(string); id == aliceSub {
		t.Fatal("bob was handed alice's subscription")
	}

	// Bob cannot list Alice's subscriptions by naming her in the query.
	if w, _ := f.do(t, f.bobToken, http.MethodGet, "/api/subscriptions?user_id=alice", ""); w.Code != http.StatusForbidden {
		t.Fatalf("bob listing alice: %d, want 403", w.Code)
	}
	// Without user_id the session decides; with a matching one it still works.
	for _, target := range []string{"/api/subscriptions", "/api/subscriptions?user_id=bob"} {
		w, body = f.do(t, f.bobToken, http.MethodGet, target, "")
		if w.Code != http.StatusOK || dataLen(t, body) != 1 {
			t.Fatalf("bob listing own (%s): %d %s", target, w.Code, w.Body)
		}
	}

	// Bob cannot delete Alice's subscription by id.
	if w, _ := f.do(t, f.bobToken, http.MethodDelete, "/api/subscriptions?id="+aliceSub, ""); w.Code != http.StatusNotFound {
		t.Fatalf("bob deleting alice's subscription: %d, want 404", w.Code)
	}
	if _, ok := f.subs.subs[aliceSub]; !ok {
		t.Fatal("alice's subscription was deleted by bob")
	}
	if w, _ := f.do(t, f.aliceToken, http.MethodDelete, "/api/subscriptions?id="+aliceSub, ""); w.Code != http.StatusOK {
		t.Fatalf("alice deleting own subscription: %d", w.Code)
	}

	// No session, no access.
	if w, _ := f.do(t, "", http.MethodGet, "/api/subscriptions?user_id=alice", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous listing: %d, want 401", w.Code)
	}
}

func TestTriggerUpdateIsAdminOnly(t *testing.T) {
	f := newOwnershipFixture(t)
	if w, _ := f.do(t, f.aliceToken, http.MethodPost, "/api/subscriptions/trigger-update", ""); w.Code != http.StatusForbidden {
		t.Fatalf("non-admin trigger: %d, want 403", w.Code)
	}
	if w, _ := f.do(t, f.adminToken, http.MethodPost, "/api/subscriptions/trigger-update", ""); w.Code != http.StatusAccepted {
		t.Fatalf("admin trigger: %d, want 202", w.Code)
	}
	// Let the async run (empty due list) finish before the test ends.
	time.Sleep(10 * time.Millisecond)
}

func TestReadingProgressIsScopedToSessionUser(t *testing.T) {
	f := newOwnershipFixture(t)

	// A user_id query parameter cannot redirect the write to another user.
	if w, _ := f.do(t, f.bobToken, http.MethodPost, "/api/reading-progress?user_id=alice",
		`{"novel_id":"n1","chapter_number":3,"progress_percentage":10}`); w.Code != http.StatusForbidden {
		t.Fatalf("bob writing alice's progress: %d, want 403", w.Code)
	}
	if w, _ := f.do(t, f.aliceToken, http.MethodPost, "/api/reading-progress",
		`{"novel_id":"n1","chapter_number":3,"progress_percentage":10}`); w.Code != http.StatusCreated {
		t.Fatalf("alice saving progress: %d %s", w.Code, w.Body)
	}
	for _, target := range []string{"/api/reading-progress?user_id=alice", "/api/reading-progress/novel?user_id=alice&novel_id=n1"} {
		if w, _ := f.do(t, f.bobToken, http.MethodGet, target, ""); w.Code != http.StatusForbidden {
			t.Fatalf("bob reading %s: %d, want 403", target, w.Code)
		}
	}
	w, body := f.do(t, f.bobToken, http.MethodGet, "/api/reading-progress", "")
	if w.Code != http.StatusOK || dataLen(t, body) != 0 {
		t.Fatalf("bob's own progress: %d %s", w.Code, w.Body)
	}
	w, body = f.do(t, f.aliceToken, http.MethodGet, "/api/reading-progress", "")
	if w.Code != http.StatusOK || dataLen(t, body) != 1 {
		t.Fatalf("alice's own progress: %d %s", w.Code, w.Body)
	}
}

func TestBookmarksAreScopedToSessionUser(t *testing.T) {
	f := newOwnershipFixture(t)
	w, body := f.do(t, f.aliceToken, http.MethodPost, "/api/bookmarks",
		`{"novel_id":"n1","chapter_number":1,"position":5}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("alice bookmark: %d %s", w.Code, w.Body)
	}
	bm := body["data"].(map[string]any)["id"].(string)

	for _, target := range []string{"/api/bookmarks?user_id=alice", "/api/bookmarks/novel?user_id=alice&novel_id=n1"} {
		if w, _ := f.do(t, f.bobToken, http.MethodGet, target, ""); w.Code != http.StatusForbidden {
			t.Fatalf("bob reading %s: %d, want 403", target, w.Code)
		}
	}
	if w, _ := f.do(t, f.bobToken, http.MethodPost, "/api/bookmarks?user_id=alice",
		`{"novel_id":"n1","chapter_number":1,"position":5}`); w.Code != http.StatusForbidden {
		t.Fatalf("bob bookmarking as alice: %d, want 403", w.Code)
	}
	if w, _ := f.do(t, f.bobToken, http.MethodDelete, "/api/bookmarks?id="+bm, ""); w.Code != http.StatusNotFound {
		t.Fatalf("bob deleting alice's bookmark: %d, want 404", w.Code)
	}
	if _, ok := f.bookmarks.bm[bm]; !ok {
		t.Fatal("alice's bookmark was deleted by bob")
	}
	w, body = f.do(t, f.aliceToken, http.MethodGet, "/api/bookmarks/novel?novel_id=n1", "")
	if w.Code != http.StatusOK || dataLen(t, body) != 1 {
		t.Fatalf("alice's novel bookmarks: %d %s", w.Code, w.Body)
	}
	if w, _ := f.do(t, f.aliceToken, http.MethodDelete, "/api/bookmarks?id="+bm, ""); w.Code != http.StatusOK {
		t.Fatalf("alice deleting own bookmark: %d", w.Code)
	}
}

func TestFeedbackIsScopedToSessionUser(t *testing.T) {
	f := newOwnershipFixture(t)
	if w, _ := f.do(t, f.bobToken, http.MethodPost, "/api/feedback?user_id=alice",
		`{"novel_id":"n1","chapter_number":1,"rating":1}`); w.Code != http.StatusForbidden {
		t.Fatalf("bob submitting as alice: %d, want 403", w.Code)
	}
	if w, _ := f.do(t, f.aliceToken, http.MethodPost, "/api/feedback",
		`{"novel_id":"n1","chapter_number":1,"rating":4}`); w.Code != http.StatusCreated {
		t.Fatalf("alice feedback: %d %s", w.Code, w.Body)
	}
	if w, _ := f.do(t, f.bobToken, http.MethodGet, "/api/feedback?user_id=alice", ""); w.Code != http.StatusForbidden {
		t.Fatalf("bob reading alice's feedback: %d, want 403", w.Code)
	}
	w, body := f.do(t, f.aliceToken, http.MethodGet, "/api/feedback", "")
	if w.Code != http.StatusOK || dataLen(t, body) != 1 {
		t.Fatalf("alice's feedback: %d %s", w.Code, w.Body)
	}
}

func TestTerminologyDeleteIsScopedToSessionUser(t *testing.T) {
	f := newOwnershipFixture(t)
	f.terms.terms["t1"] = domain.UserTerminology{ID: "t1", UserID: "alice", OriginalTerm: "x", Translation: "y"}

	if w, _ := f.do(t, f.bobToken, http.MethodDelete, "/api/terminology?id=t1", ""); w.Code != http.StatusNotFound {
		t.Fatalf("bob deleting alice's term: %d, want 404", w.Code)
	}
	if _, ok := f.terms.terms["t1"]; !ok {
		t.Fatal("alice's term was deleted by bob")
	}
	if w, _ := f.do(t, f.aliceToken, http.MethodDelete, "/api/terminology?id=t1", ""); w.Code != http.StatusOK {
		t.Fatalf("alice deleting own term: %d", w.Code)
	}
}
