package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleWebhookRejectsWhenSecretUnset(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", "")
	h := NewPaymentHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/api/payments/webhook", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	h.HandleWebhook(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 when webhook secret is not configured", w.Code)
	}
}

func TestHandleWebhookChunkedBodyDoesNotPanic(t *testing.T) {
	// Regression: make([]byte, r.ContentLength) panicked for chunked bodies
	// where ContentLength is -1.
	t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
	h := NewPaymentHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/api/payments/webhook", strings.NewReader(`{"id":"evt"}`))
	req.ContentLength = -1
	req.Header.Set("Stripe-Signature", "t=1,v1=bad")
	w := httptest.NewRecorder()
	h.HandleWebhook(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an invalid signature", w.Code)
	}
}

func TestHandleWebhookRejectsOversizedBody(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
	h := NewPaymentHandler(nil)
	body := strings.Repeat("a", maxWebhookBodyBytes+10)
	req := httptest.NewRequest(http.MethodPost, "/api/payments/webhook", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.HandleWebhook(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", w.Code)
	}
}
