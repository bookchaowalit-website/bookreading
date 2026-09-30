package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/bookreading/backend/internal/logging"
)

// RateLimiter implements a simple in-memory rate limiter
type RateLimiter struct {
	visitors map[string]*Visitor
	mu       sync.RWMutex
	rate     int           // max requests
	window   time.Duration // time window
}

// Visitor tracks request counts for a single visitor
type Visitor struct {
	count       int
	windowStart time.Time
	lastSeen    time.Time
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*Visitor),
		rate:     rate,
		window:   window,
	}

	// Cleanup old visitors periodically
	go rl.cleanup()
	return rl
}

// Allow checks if a request from this IP should be allowed.
// It uses a fixed window that starts at the visitor's first request, so a
// steady trickle of requests is never blocked (the window used to slide on
// every request, which made the counter accumulate forever).
func (rl *RateLimiter) Allow(ip string) bool {
	return rl.allowAt(ip, time.Now())
}

func (rl *RateLimiter) allowAt(ip string, now time.Time) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	visitor, exists := rl.visitors[ip]
	if !exists || now.Sub(visitor.windowStart) >= rl.window {
		// New visitor or window expired
		rl.visitors[ip] = &Visitor{
			count:       1,
			windowStart: now,
			lastSeen:    now,
		}
		return true
	}

	visitor.count++
	visitor.lastSeen = now

	return visitor.count <= rl.rate
}

// cleanup removes expired visitors
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for ip, visitor := range rl.visitors {
			if now.Sub(visitor.windowStart) >= rl.window {
				delete(rl.visitors, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// Global rate limiters
var (
	// API rate limiter: 100 requests per minute per IP
	apiRateLimiter = NewRateLimiter(100, time.Minute)

	// Translation rate limiter: 10 requests per minute per IP (expensive operations)
	translationRateLimiter = NewRateLimiter(10, time.Minute)

	// Auth rate limiter: 5 login attempts per minute per IP
	authRateLimiter = NewRateLimiter(5, time.Minute)
)

// RateLimitMiddleware returns HTTP middleware that applies rate limiting
func RateLimitMiddleware(next http.Handler, limiter *RateLimiter) http.Handler {
	logger := logging.GetLogger()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)

		if !limiter.Allow(ip) {
			logger.WithFields(map[string]interface{}{
				"ip":     ip,
				"path":   r.URL.Path,
				"method": r.Method,
			}).Warn("Rate limit exceeded")

			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"success":false,"error":"Rate limit exceeded","message":"Too many requests. Please try again later."}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}

// getClientIP extracts the client IP from the request.
// Forwarding headers are trusted as-is (the service is expected to run behind
// a reverse proxy that sets them); only the first X-Forwarded-For hop is used,
// and the port is stripped from RemoteAddr so each new TCP connection from
// the same client shares one bucket.
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (for proxied requests)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first := strings.TrimSpace(strings.Split(xff, ",")[0])
		if first != "" {
			return first
		}
	}

	// Check X-Real-IP header
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr without the ephemeral port
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// ApplyRateLimiting wraps a handler with rate limiting
func ApplyRateLimiting(handler http.Handler) http.Handler {
	// Apply general API rate limiting to all routes
	return RateLimitMiddleware(handler, apiRateLimiter)
}

// Translation endpoints should have stricter rate limiting
func TranslationRateLimitMiddleware(next http.Handler) http.Handler {
	return RateLimitMiddleware(next, translationRateLimiter)
}

// Auth endpoints should have stricter rate limiting
func AuthRateLimitMiddleware(next http.Handler) http.Handler {
	return RateLimitMiddleware(next, authRateLimiter)
}
