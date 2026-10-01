package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/infrastructure/aiservice"
	"github.com/bookreading/backend/internal/usecase"
)

func envMap(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadServerConfigDefaults(t *testing.T) {
	cfg, err := LoadServerConfig(envMap(nil))
	if err != nil {
		t.Fatal(err)
	}
	if cfg != DefaultServerConfig() {
		t.Fatalf("defaults changed: %+v", cfg)
	}
	if cfg.WriteTimeout <= aiservice.RequestTimeout {
		t.Fatalf("WriteTimeout %s must exceed the ai-service timeout %s", cfg.WriteTimeout, aiservice.RequestTimeout)
	}
	if cfg.ReadHeaderTimeout <= 0 || cfg.ReadTimeout <= 0 || cfg.IdleTimeout <= 0 || cfg.MaxHeaderBytes <= 0 {
		t.Fatalf("every limit must be set: %+v", cfg)
	}
}

func TestLoadServerConfigOverrides(t *testing.T) {
	cfg, err := LoadServerConfig(envMap(map[string]string{
		"HTTP_READ_HEADER_TIMEOUT": "5s",
		"HTTP_READ_TIMEOUT":        "2m",
		"HTTP_WRITE_TIMEOUT":       "10m",
		"HTTP_IDLE_TIMEOUT":        "30s",
		"HTTP_MAX_HEADER_BYTES":    "65536",
	}))
	if err != nil {
		t.Fatal(err)
	}
	want := ServerConfig{5 * time.Second, 2 * time.Minute, 10 * time.Minute, 30 * time.Second, 65536}
	if cfg != want {
		t.Fatalf("got %+v, want %+v", cfg, want)
	}
}

func TestLoadServerConfigRejectsInvalid(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"bad duration":         {"HTTP_READ_TIMEOUT": "soon"},
		"zero duration":        {"HTTP_WRITE_TIMEOUT": "0s"},
		"negative duration":    {"HTTP_IDLE_TIMEOUT": "-1s"},
		"header bytes text":    {"HTTP_MAX_HEADER_BYTES": "big"},
		"header bytes small":   {"HTTP_MAX_HEADER_BYTES": "100"},
		"header bytes huge":    {"HTTP_MAX_HEADER_BYTES": "1073741824"},
		"header after read to": {"HTTP_READ_HEADER_TIMEOUT": "2m", "HTTP_READ_TIMEOUT": "1m"},
	} {
		if _, err := LoadServerConfig(envMap(env)); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
}

func TestNewHTTPServerAppliesConfig(t *testing.T) {
	cfg := DefaultServerConfig()
	srv := newHTTPServer(":0", http.NotFoundHandler(), cfg)
	if srv.ReadHeaderTimeout != cfg.ReadHeaderTimeout || srv.ReadTimeout != cfg.ReadTimeout ||
		srv.WriteTimeout != cfg.WriteTimeout || srv.IdleTimeout != cfg.IdleTimeout ||
		srv.MaxHeaderBytes != cfg.MaxHeaderBytes {
		t.Fatalf("server limits not applied: %+v", srv)
	}
}

func TestParseAdminUserIDs(t *testing.T) {
	got, invalid := ParseAdminUserIDs(" 3F2504E0-4F89-11D3-9A0C-0305E82C3301, admin@example.test;3f2504e0-4f89-11d3-9a0c-0305e82c3301\t6ba7b810-9dad-11d1-80b4-00c04fd430c8 ,, ")
	want := []string{"3f2504e0-4f89-11d3-9a0c-0305e82c3301", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if !reflect.DeepEqual(invalid, []string{"admin@example.test"}) {
		t.Fatalf("invalid = %v", invalid)
	}
	if ids, _ := ParseAdminUserIDs(""); ids != nil {
		t.Fatal("empty input must yield no admins")
	}
}

type recordingPromoter struct{ calls [][]string }

func (p *recordingPromoter) PromoteAdminsByID(_ context.Context, ids []string) (int64, error) {
	p.calls = append(p.calls, ids)
	return int64(len(ids)), nil
}

func TestBootstrapAdminsNeverPromotesByEmail(t *testing.T) {
	// Registration does not verify email ownership, so whoever registers a
	// listed address first must not become admin.
	env := map[string]string{"ADMIN_EMAILS": "owner@example.test"}
	p := &recordingPromoter{}
	if n := BootstrapAdmins(context.Background(), p, func(k string) string { return env[k] }); n != 0 || len(p.calls) != 0 {
		t.Fatalf("ADMIN_EMAILS alone promoted accounts: n=%d calls=%v", n, p.calls)
	}

	env["ADMIN_USER_IDS"] = "6ba7b810-9dad-11d1-80b4-00c04fd430c8, owner@example.test"
	if n := BootstrapAdmins(context.Background(), p, func(k string) string { return env[k] }); n != 1 {
		t.Fatalf("promoted %d, want 1", n)
	}
	if want := [][]string{{"6ba7b810-9dad-11d1-80b4-00c04fd430c8"}}; !reflect.DeepEqual(p.calls, want) {
		t.Fatalf("calls = %v, want %v", p.calls, want)
	}
}

func TestAuthMiddlewareSetsUserIDForHandlers(t *testing.T) {
	// Regression: the middleware stored the ID under a typed key while the
	// handlers read a plain string key, so every protected route 401'd.
	reader := &domain.User{ID: "user-1", Email: "reader@example.test", Role: domain.RoleUser}
	users := usecase.NewUserUsecase(newFakeUserRepo(reader), nil, nil, "fixture-jwt-secret")
	token, err := users.GenerateToken(reader)
	if err != nil {
		t.Fatal(err)
	}
	h := &Handler{userUsecase: users}

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.AuthMiddleware(h.GetMe)(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GetMe after AuthMiddleware: status %d body %s", w.Code, w.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	h.AuthMiddleware(h.Refresh)(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Refresh after AuthMiddleware: status %d body %s", w.Code, w.Body.String())
	}
}
