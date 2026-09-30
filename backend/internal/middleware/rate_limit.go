package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"os"
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
//
// Forwarding headers are honored only when the direct peer (RemoteAddr) is a
// trusted proxy, so a client connecting directly cannot pick its own rate
// limit bucket by sending X-Forwarded-For. Trusted proxies come from the
// TRUSTED_PROXIES env var (comma-separated IPs/CIDRs, or "*" to trust every
// peer); when unset, loopback and private-network peers are trusted, which
// covers Docker/Kubernetes reverse proxies. X-Forwarded-For is walked from the
// right and the first untrusted hop wins, so client-supplied entries to the
// left of the proxy's own entry are ignored. The port is stripped from
// RemoteAddr so each new TCP connection from the same client shares a bucket.
func getClientIP(r *http.Request) string {
	remote := r.RemoteAddr
	if host, _, err := net.SplitHostPort(remote); err == nil {
		remote = host
	}

	proxies := loadTrustedProxies()
	if !proxies.contains(remote) {
		return remote
	}

	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		hops := strings.Split(xff, ",")
		for i := len(hops) - 1; i >= 0; i-- {
			hop := strings.TrimSpace(hops[i])
			if hop == "" {
				continue
			}
			if i == 0 || !proxies.contains(hop) {
				return hop
			}
		}
	}

	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	return remote
}

type trustedProxies struct {
	all      bool
	prefixes []netip.Prefix
}

var defaultTrustedProxies = []string{"127.0.0.0/8", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"}

var (
	trustedProxiesMu    sync.Mutex
	trustedProxiesRaw   = "\x00" // sentinel: never a real env value
	trustedProxiesCache trustedProxies
)

// loadTrustedProxies parses TRUSTED_PROXIES, caching by raw value so tests
// (and a changed environment) pick up new settings without a restart.
func loadTrustedProxies() trustedProxies {
	raw := os.Getenv("TRUSTED_PROXIES")
	trustedProxiesMu.Lock()
	defer trustedProxiesMu.Unlock()
	if raw == trustedProxiesRaw {
		return trustedProxiesCache
	}
	trustedProxiesRaw = raw
	trustedProxiesCache = parseTrustedProxies(raw)
	return trustedProxiesCache
}

func parseTrustedProxies(raw string) trustedProxies {
	entries := defaultTrustedProxies
	if strings.TrimSpace(raw) != "" {
		entries = strings.Split(raw, ",")
	}
	var tp trustedProxies
	for _, e := range entries {
		e = strings.TrimSpace(e)
		switch {
		case e == "":
			continue
		case e == "*":
			tp.all = true
		case strings.Contains(e, "/"):
			if p, err := netip.ParsePrefix(e); err == nil {
				tp.prefixes = append(tp.prefixes, p.Masked())
			}
		default:
			if a, err := netip.ParseAddr(e); err == nil {
				tp.prefixes = append(tp.prefixes, netip.PrefixFrom(a, a.BitLen()))
			}
		}
	}
	return tp
}

func (tp trustedProxies) contains(ip string) bool {
	if tp.all {
		return true
	}
	a, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	a = a.Unmap()
	for _, p := range tp.prefixes {
		if p.Contains(a) {
			return true
		}
	}
	return false
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
