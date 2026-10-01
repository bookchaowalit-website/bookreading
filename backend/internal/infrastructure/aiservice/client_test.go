package aiservice

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

type recorded struct {
	path, auth, contentType string
}

func newRecordingServer(t *testing.T, status int, body any) (*httptest.Server, func() []recorded) {
	t.Helper()
	var (
		mu   sync.Mutex
		seen []recorded
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, recorded{r.URL.Path, r.Header.Get("Authorization"), r.Header.Get("Content-Type")})
		mu.Unlock()
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(srv.Close)
	return srv, func() []recorded {
		mu.Lock()
		defer mu.Unlock()
		return append([]recorded(nil), seen...)
	}
}

func callAll(ctx context.Context, c AIServiceClient) error {
	if _, err := c.ScrapeNovel(ctx, "https://www.piaotia.com/1", "zh"); err != nil {
		return err
	}
	if _, err := c.TranslateContent(ctx, &TranslateRequest{Text: "x"}); err != nil {
		return err
	}
	_, err := c.ExtractTerminology(ctx, &ExtractTerminologyRequest{Text: "x"})
	return err
}

func TestClientSendsBearerTokenWhenConfigured(t *testing.T) {
	srv, seen := newRecordingServer(t, http.StatusOK, map[string]any{"title": "T"})
	c := NewAIServiceClient(srv.URL+"/", "  s3cret  ")
	if err := callAll(context.Background(), c); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := seen()
	wantPaths := []string{"/scrape", "/translate", "/extract-terminology"}
	if len(got) != len(wantPaths) {
		t.Fatalf("got %d requests, want %d", len(got), len(wantPaths))
	}
	for i, r := range got {
		if r.path != wantPaths[i] {
			t.Errorf("request %d path = %q, want %q", i, r.path, wantPaths[i])
		}
		if r.auth != "Bearer s3cret" {
			t.Errorf("request %d Authorization = %q, want bearer token", i, r.auth)
		}
		if r.contentType != "application/json" {
			t.Errorf("request %d Content-Type = %q", i, r.contentType)
		}
	}
}

func TestClientOmitsAuthorizationWithoutToken(t *testing.T) {
	srv, seen := newRecordingServer(t, http.StatusOK, map[string]any{})
	if err := callAll(context.Background(), NewAIServiceClient(srv.URL, "")); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, r := range seen() {
		if r.auth != "" {
			t.Errorf("%s sent Authorization %q with no token configured", r.path, r.auth)
		}
	}
}

func TestClientReportsNon200(t *testing.T) {
	srv, _ := newRecordingServer(t, http.StatusUnauthorized, map[string]string{"detail": "Unauthorized"})
	c := NewAIServiceClient(srv.URL, "wrong")
	_, err := c.ScrapeNovel(context.Background(), "https://www.piaotia.com/1", "zh")
	if err == nil || err.Error() != "scrape request failed with status: 401" {
		t.Fatalf("err = %v, want 401 status error", err)
	}
}
