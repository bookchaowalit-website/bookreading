package grpc

// Service-token authentication for the gRPC API. This file carries no build
// tag, so it is compiled and tested without the generated protobuf code that
// server.go needs. A generated build creates its server with
//
//	opts, err := ServerAuthOptions(os.Getenv)
//	if err != nil { log.Fatal(err) }
//	srv := grpc.NewServer(opts...)
//
// so every unary and streaming RPC requires "authorization: Bearer <token>".

import (
	"context"
	"crypto/subtle"
	"errors"
	"log"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// ServiceTokenEnv names the shared secret gRPC callers must present.
const ServiceTokenEnv = "GRPC_SERVICE_TOKEN"

// ErrMissingServiceToken is returned in production when no token is set:
// the gRPC API must not start unauthenticated there.
var ErrMissingServiceToken = errors.New(ServiceTokenEnv + " is required in production")

// isProduction follows the backend's existing convention (NODE_ENV, as used
// for the Secure cookie flag) and also accepts APP_ENV.
func isProduction(getenv func(string) string) bool {
	return strings.EqualFold(getenv("NODE_ENV"), "production") ||
		strings.EqualFold(getenv("APP_ENV"), "production")
}

// TokenAuth checks the bearer token on incoming RPCs.
type TokenAuth struct {
	token []byte
	open  bool // development only: no token configured, every call allowed
}

// NewTokenAuthFromEnv builds the authenticator from GRPC_SERVICE_TOKEN. In
// production a missing token is an error (fail closed). Outside production a
// missing token leaves the API open with a warning, for local development
// against the loopback-only port.
func NewTokenAuthFromEnv(getenv func(string) string) (*TokenAuth, error) {
	token := strings.TrimSpace(getenv(ServiceTokenEnv))
	if token == "" {
		if isProduction(getenv) {
			return nil, ErrMissingServiceToken
		}
		log.Printf("[WARN] %s is not set: gRPC API is unauthenticated (development only)", ServiceTokenEnv)
		return &TokenAuth{open: true}, nil
	}
	return &TokenAuth{token: []byte(token)}, nil
}

// errUnauthenticated deliberately does not say which part failed.
var errUnauthenticated = status.Error(codes.Unauthenticated, "valid service token required")

// Authorize checks the "authorization" metadata of ctx.
func (a *TokenAuth) Authorize(ctx context.Context) error {
	if a == nil {
		return errUnauthenticated
	}
	if a.open {
		return nil
	}
	if len(a.token) == 0 {
		return errUnauthenticated
	}
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return errUnauthenticated
	}
	values := md.Get("authorization")
	if len(values) != 1 {
		return errUnauthenticated
	}
	const prefix = "bearer "
	v := strings.TrimSpace(values[0])
	if len(v) <= len(prefix) || !strings.EqualFold(v[:len(prefix)], prefix) {
		return errUnauthenticated
	}
	presented := []byte(strings.TrimSpace(v[len(prefix):]))
	if subtle.ConstantTimeCompare(presented, a.token) != 1 {
		return errUnauthenticated
	}
	return nil
}

// UnaryInterceptor rejects unary RPCs without a valid token.
func (a *TokenAuth) UnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if err := a.Authorize(ctx); err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// StreamInterceptor rejects streaming RPCs without a valid token.
func (a *TokenAuth) StreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, _ *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		if err := a.Authorize(ss.Context()); err != nil {
			return err
		}
		return handler(srv, ss)
	}
}

// ServerAuthOptions returns the grpc.NewServer options that install both
// interceptors, or ErrMissingServiceToken in production without a token.
func ServerAuthOptions(getenv func(string) string) ([]grpc.ServerOption, error) {
	a, err := NewTokenAuthFromEnv(getenv)
	if err != nil {
		return nil, err
	}
	return []grpc.ServerOption{
		grpc.ChainUnaryInterceptor(a.UnaryInterceptor()),
		grpc.ChainStreamInterceptor(a.StreamInterceptor()),
	}, nil
}
