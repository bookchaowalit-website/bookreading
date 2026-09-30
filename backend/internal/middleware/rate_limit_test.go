package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestLimiter(rate int, window time.Duration) *RateLimiter {
	// Avoid NewRateLimiter so no cleanup goroutine leaks from tests.
	return &RateLimiter{visitors: map[string]*Visitor{}, rate: rate, window: window}
}

func TestAllowBlocksAfterRateWithinWindow(t *testing.T) {
	rl := newTestLimiter(3, time.Minute)
	now := time.Unix(1_700_000_000, 0)
	for i := 0; i < 3; i++ {
		if !rl.allowAt("a", now.Add(time.Duration(i)*time.Second)) {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if rl.allowAt("a", now.Add(3*time.Second)) {
		t.Fatal("4th request inside the window should be blocked")
	}
	if !rl.allowAt("b", now.Add(3*time.Second)) {
		t.Fatal("other visitors must have their own bucket")
	}
	if !rl.allowAt("a", now.Add(time.Minute)) {
		t.Fatal("a new window should reset the counter")
	}
}

func TestAllowSteadyTrickleIsNeverBlocked(t *testing.T) {
	// Regression: the window used to slide on every request, so one request
	// every 50s accumulated forever and was eventually rejected.
	rl := newTestLimiter(3, time.Minute)
	now := time.Unix(1_700_000_000, 0)
	for i := 0; i < 20; i++ {
		if !rl.allowAt("a", now.Add(time.Duration(i)*50*time.Second)) {
			t.Fatalf("request %d at 1 per 50s should be allowed", i+1)
		}
	}
}

func TestGetClientIP(t *testing.T) {
	cases := []struct {
		name, trusted, xff, xri, remote, want string
	}{
		{"remote strips port", "", "", "", "10.0.0.1:54321", "10.0.0.1"},
		{"ipv6 remote strips port", "", "", "", "[::1]:8080", "::1"},
		{"remote without port", "", "", "", "10.0.0.9", "10.0.0.9"},
		{"private proxy xff", "", "203.0.113.5", "", "10.0.0.1:1", "203.0.113.5"},
		{"private proxy x-real-ip", "", "", " 198.51.100.7 ", "10.0.0.1:1", "198.51.100.7"},
		{"direct public client cannot spoof xff", "", "1.2.3.4", "", "203.0.113.9:1", "203.0.113.9"},
		{"direct public client cannot spoof x-real-ip", "", "", "1.2.3.4", "203.0.113.9:1", "203.0.113.9"},
		{"spoofed left hop ignored", "", "1.2.3.4, 203.0.113.5", "", "10.0.0.1:1", "203.0.113.5"},
		{"trusted hops skipped", "", "203.0.113.5, 10.0.0.2", "", "10.0.0.1:1", "203.0.113.5"},
		{"explicit cidr list", "198.51.100.0/24", "203.0.113.5", "", "198.51.100.10:1", "203.0.113.5"},
		{"explicit list excludes private", "198.51.100.0/24", "203.0.113.5", "", "10.0.0.1:1", "10.0.0.1"},
		{"trust all", "*", "1.2.3.4", "", "203.0.113.9:1", "1.2.3.4"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("TRUSTED_PROXIES", c.trusted)
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.RemoteAddr = c.remote
			if c.xff != "" {
				r.Header.Set("X-Forwarded-For", c.xff)
			}
			if c.xri != "" {
				r.Header.Set("X-Real-IP", c.xri)
			}
			if got := getClientIP(r); got != c.want {
				t.Fatalf("getClientIP = %q, want %q", got, c.want)
			}
		})
	}
}

func TestRateLimitMiddlewareReturns429(t *testing.T) {
	rl := newTestLimiter(1, time.Minute)
	h := RateLimitMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), rl)

	codes := []int{}
	for port := 1000; port < 1002; port++ {
		r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
		// Different ephemeral ports from the same host must share a bucket.
		r.RemoteAddr = fmt.Sprintf("192.0.2.1:%d", port)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		codes = append(codes, w.Code)
	}
	if codes[0] != http.StatusNoContent || codes[1] != http.StatusTooManyRequests {
		t.Fatalf("codes = %v, want [204 429]", codes)
	}
}
