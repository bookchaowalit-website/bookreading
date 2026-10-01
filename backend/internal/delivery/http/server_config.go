package http

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/bookreading/backend/internal/infrastructure/aiservice"
)

// ServerConfig holds the http.Server limits. Every field has a safe default
// and an environment override (see LoadServerConfig).
type ServerConfig struct {
	// ReadHeaderTimeout bounds reading request headers (slowloris guard).
	ReadHeaderTimeout time.Duration
	// ReadTimeout bounds reading the whole request, including 32 MiB
	// base64 manga image bodies.
	ReadTimeout time.Duration
	// WriteTimeout bounds handling plus writing the response. It must exceed
	// aiservice.RequestTimeout so the longest proxied AI call can finish.
	WriteTimeout time.Duration
	// IdleTimeout bounds keep-alive connections between requests.
	IdleTimeout time.Duration
	// MaxHeaderBytes caps request header size.
	MaxHeaderBytes int
}

// Server limit bounds for MaxHeaderBytes.
const (
	minMaxHeaderBytes = 4 << 10
	maxMaxHeaderBytes = 16 << 20
)

// DefaultServerConfig returns the defaults used when no override is set.
func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      aiservice.RequestTimeout + 30*time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
}

// LoadServerConfig reads HTTP_READ_HEADER_TIMEOUT, HTTP_READ_TIMEOUT,
// HTTP_WRITE_TIMEOUT, HTTP_IDLE_TIMEOUT (Go durations such as "90s") and
// HTTP_MAX_HEADER_BYTES through getenv. Unset values keep the default; an
// invalid value is an error so a typo cannot silently disable a limit.
func LoadServerConfig(getenv func(string) string) (ServerConfig, error) {
	cfg := DefaultServerConfig()
	durations := []struct {
		env string
		dst *time.Duration
	}{
		{"HTTP_READ_HEADER_TIMEOUT", &cfg.ReadHeaderTimeout},
		{"HTTP_READ_TIMEOUT", &cfg.ReadTimeout},
		{"HTTP_WRITE_TIMEOUT", &cfg.WriteTimeout},
		{"HTTP_IDLE_TIMEOUT", &cfg.IdleTimeout},
	}
	for _, d := range durations {
		v := strings.TrimSpace(getenv(d.env))
		if v == "" {
			continue
		}
		parsed, err := time.ParseDuration(v)
		if err != nil || parsed <= 0 {
			return ServerConfig{}, fmt.Errorf("%s must be a positive duration, got %q", d.env, v)
		}
		*d.dst = parsed
	}
	if v := strings.TrimSpace(getenv("HTTP_MAX_HEADER_BYTES")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < minMaxHeaderBytes || n > maxMaxHeaderBytes {
			return ServerConfig{}, fmt.Errorf("HTTP_MAX_HEADER_BYTES must be between %d and %d, got %q", minMaxHeaderBytes, maxMaxHeaderBytes, v)
		}
		cfg.MaxHeaderBytes = n
	}
	if cfg.ReadHeaderTimeout > cfg.ReadTimeout {
		return ServerConfig{}, fmt.Errorf("HTTP_READ_HEADER_TIMEOUT (%s) must not exceed HTTP_READ_TIMEOUT (%s)", cfg.ReadHeaderTimeout, cfg.ReadTimeout)
	}
	if cfg.WriteTimeout <= aiservice.RequestTimeout {
		log.Printf("[WARN] HTTP_WRITE_TIMEOUT %s is not above the ai-service timeout %s; long AI proxy calls will be cut off", cfg.WriteTimeout, aiservice.RequestTimeout)
	}
	return cfg, nil
}

// ParseAdminEmails splits ADMIN_EMAILS (comma or whitespace separated) into
// trimmed, lower-cased, de-duplicated addresses. Entries without "@" are
// ignored.
func ParseAdminEmails(raw string) []string {
	seen := map[string]bool{}
	var out []string
	for _, f := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ';' || r == ' ' || r == '\t' || r == '\n'
	}) {
		e := strings.ToLower(strings.TrimSpace(f))
		if !strings.Contains(e, "@") || seen[e] {
			continue
		}
		seen[e] = true
		out = append(out, e)
	}
	return out
}
