package http

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/bookreading/backend/internal/infrastructure/aiservice"
	"github.com/google/uuid"
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

// ParseAdminUserIDs splits ADMIN_USER_IDS (comma or whitespace separated)
// into canonical, de-duplicated user UUIDs. Entries that are not UUIDs are
// returned separately so startup can report them.
func ParseAdminUserIDs(raw string) (ids []string, invalid []string) {
	seen := map[string]bool{}
	for _, f := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ';' || r == ' ' || r == '\t' || r == '\n'
	}) {
		u, err := uuid.Parse(strings.TrimSpace(f))
		if err != nil {
			invalid = append(invalid, f)
			continue
		}
		id := u.String()
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, invalid
}

// AdminPromoter grants the admin role to existing users by ID.
type AdminPromoter interface {
	PromoteAdminsByID(ctx context.Context, ids []string) (int64, error)
}

// BootstrapAdmins applies ADMIN_USER_IDS at startup.
//
// Registration is open and does not verify email ownership, so an email
// allow-list could be claimed by whoever registers that address first.
// Admins are therefore bound to account IDs: the operator registers, reads
// their own ID from GET /api/users/me, and lists it. The legacy ADMIN_EMAILS
// variable is ignored (with a warning). Nobody is ever demoted or created.
// It returns the number of accounts changed.
func BootstrapAdmins(ctx context.Context, p AdminPromoter, getenv func(string) string) int64 {
	if strings.TrimSpace(getenv("ADMIN_EMAILS")) != "" {
		log.Printf("[WARN] ADMIN_EMAILS is ignored: email ownership is not verified at registration; list account IDs in ADMIN_USER_IDS instead")
	}
	ids, invalid := ParseAdminUserIDs(getenv("ADMIN_USER_IDS"))
	if len(invalid) > 0 {
		log.Printf("[WARN] ADMIN_USER_IDS: ignoring %d entries that are not UUIDs", len(invalid))
	}
	if len(ids) == 0 || p == nil {
		return 0
	}
	n, err := p.PromoteAdminsByID(ctx, ids)
	if err != nil {
		log.Printf("[WARN] ADMIN_USER_IDS bootstrap failed (is migration 009 applied?): %v", err)
		return 0
	}
	log.Printf("[INFO] ADMIN_USER_IDS bootstrap: %d of %d listed accounts promoted", n, len(ids))
	return n
}
