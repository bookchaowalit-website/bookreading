package grpc

import (
	"context"
	"errors"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func incoming(values ...string) context.Context {
	md := metadata.MD{}
	for _, v := range values {
		md.Append("authorization", v)
	}
	return metadata.NewIncomingContext(context.Background(), md)
}

func TestNewTokenAuthFromEnvFailsClosedInProduction(t *testing.T) {
	for _, env := range []map[string]string{
		{"NODE_ENV": "production"},
		{"APP_ENV": "Production"},
		{"NODE_ENV": "production", ServiceTokenEnv: "   "},
	} {
		if _, err := NewTokenAuthFromEnv(envOf(env)); !errors.Is(err, ErrMissingServiceToken) {
			t.Errorf("env %v: err = %v, want ErrMissingServiceToken", env, err)
		}
		if _, err := ServerAuthOptions(envOf(env)); !errors.Is(err, ErrMissingServiceToken) {
			t.Errorf("ServerAuthOptions(%v): err = %v, want ErrMissingServiceToken", env, err)
		}
	}
}

func TestNewTokenAuthFromEnvDevelopmentWithoutToken(t *testing.T) {
	a, err := NewTokenAuthFromEnv(envOf(nil))
	if err != nil {
		t.Fatalf("development without token: %v", err)
	}
	if err := a.Authorize(context.Background()); err != nil {
		t.Fatalf("development without token should allow calls: %v", err)
	}
}

func TestAuthorize(t *testing.T) {
	a, err := NewTokenAuthFromEnv(envOf(map[string]string{"NODE_ENV": "production", ServiceTokenEnv: "s3cret-token"}))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		ctx  context.Context
		ok   bool
	}{
		{"valid", incoming("Bearer s3cret-token"), true},
		{"scheme is case-insensitive", incoming("bearer s3cret-token"), true},
		{"no metadata", context.Background(), false},
		{"no header", incoming(), false},
		{"wrong token", incoming("Bearer nope"), false},
		{"token prefix only", incoming("Bearer s3cret"), false},
		{"token with suffix", incoming("Bearer s3cret-token-x"), false},
		{"missing scheme", incoming("s3cret-token"), false},
		{"empty bearer", incoming("Bearer "), false},
		{"duplicate headers", incoming("Bearer s3cret-token", "Bearer s3cret-token"), false},
	}
	for _, tc := range cases {
		err := a.Authorize(tc.ctx)
		if tc.ok && err != nil {
			t.Errorf("%s: unexpected error %v", tc.name, err)
		}
		if !tc.ok && status.Code(err) != codes.Unauthenticated {
			t.Errorf("%s: err = %v, want Unauthenticated", tc.name, err)
		}
	}

	var nilAuth *TokenAuth
	if status.Code(nilAuth.Authorize(incoming("Bearer s3cret-token"))) != codes.Unauthenticated {
		t.Error("nil authenticator must deny")
	}
	if status.Code((&TokenAuth{}).Authorize(incoming("Bearer "))) != codes.Unauthenticated {
		t.Error("authenticator with an empty token must deny")
	}
}

type fakeStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s fakeStream) Context() context.Context { return s.ctx }

func TestInterceptorsGateHandlers(t *testing.T) {
	a := &TokenAuth{token: []byte("tok")}

	called := false
	unary := a.UnaryInterceptor()
	handler := func(context.Context, any) (any, error) { called = true; return "ok", nil }
	if _, err := unary(incoming("Bearer bad"), nil, &grpc.UnaryServerInfo{}, handler); status.Code(err) != codes.Unauthenticated || called {
		t.Fatalf("unary with bad token: err=%v called=%v", err, called)
	}
	resp, err := unary(incoming("Bearer tok"), nil, &grpc.UnaryServerInfo{}, handler)
	if err != nil || resp != "ok" || !called {
		t.Fatalf("unary with good token: resp=%v err=%v called=%v", resp, err, called)
	}

	called = false
	stream := a.StreamInterceptor()
	sh := func(any, grpc.ServerStream) error { called = true; return nil }
	if err := stream(nil, fakeStream{ctx: context.Background()}, &grpc.StreamServerInfo{}, sh); status.Code(err) != codes.Unauthenticated || called {
		t.Fatalf("stream without token: err=%v called=%v", err, called)
	}
	if err := stream(nil, fakeStream{ctx: incoming("Bearer tok")}, &grpc.StreamServerInfo{}, sh); err != nil || !called {
		t.Fatalf("stream with good token: err=%v called=%v", err, called)
	}
}

func TestServerAuthOptions(t *testing.T) {
	opts, err := ServerAuthOptions(envOf(map[string]string{ServiceTokenEnv: "tok"}))
	if err != nil || len(opts) != 2 {
		t.Fatalf("ServerAuthOptions: %d options, err %v", len(opts), err)
	}
	// The options must be accepted by a real server.
	grpc.NewServer(opts...).Stop()
}
