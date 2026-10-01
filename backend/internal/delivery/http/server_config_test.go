package http

import (
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

func TestParseAdminEmails(t *testing.T) {
	got := ParseAdminEmails(" Admin@Example.test, ops@example.test;admin@example.test\tnot-an-email ,, ")
	want := []string{"admin@example.test", "ops@example.test"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if ParseAdminEmails("") != nil {
		t.Fatal("empty input must yield no admins")
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
