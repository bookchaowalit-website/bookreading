package http

import (
	"errors"
	"net/http"
	"testing"
	"time"
)

// Stripe does not guarantee webhook delivery order and retries failed
// deliveries for days; these tests replay events out of order with locally
// signed fixtures (no network).

const (
	tCheckout = int64(1_780_000_000)
	tCancel   = tCheckout + 3600
	tLater    = tCheckout + 7200
)

func checkoutObject(subID string) map[string]any {
	return map[string]any{
		"id": "cs_test_1", "object": "checkout.session", "subscription": subID,
		"metadata": map[string]string{"user_id": "user-1", "plan": "pro"},
	}
}

func deliver(t *testing.T, h *PaymentHandler, eventType string, created int64, object map[string]any) {
	t.Helper()
	payload, sig := signedEventAt(t, eventType, created, object)
	if code := postWebhook(t, h, payload, sig); code != http.StatusOK {
		t.Fatalf("%s: status = %d, want 200", eventType, code)
	}
}

func TestStaleCheckoutAfterCancelDoesNotReactivate(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo(subscribedUser("free", "active", ""))
	repo.users["user-1"].StripeSubscriptionID = nil
	h := NewPaymentHandler(repo)

	deliver(t, h, "checkout.session.completed", tCheckout, checkoutObject("sub_1"))
	deliver(t, h, "customer.subscription.deleted", tCancel,
		map[string]any{"id": "sub_1", "object": "subscription", "status": "canceled"})
	// Stripe retries the (older) checkout event after the cancel.
	deliver(t, h, "checkout.session.completed", tCheckout, checkoutObject("sub_1"))

	u := repo.users["user-1"]
	if u.SubscriptionPlan != "free" || u.SubscriptionStatus != "canceled" {
		t.Fatalf("stale checkout re-activated user: plan=%q status=%q", u.SubscriptionPlan, u.SubscriptionStatus)
	}
	if u.StripeEventAt == nil || !u.StripeEventAt.Equal(time.Unix(tCancel, 0)) {
		t.Fatalf("stripe_event_at = %v, want cancel time", u.StripeEventAt)
	}
}

func TestCheckoutForCanceledSubscriptionIgnoredEvenInSameSecond(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	at := time.Unix(tCancel, 0).UTC()
	u := subscribedUser("free", "canceled", "sub_1")
	u.StripeEventAt = &at
	repo := newFakeUserRepo(u)
	h := NewPaymentHandler(repo)

	deliver(t, h, "checkout.session.completed", tCancel, checkoutObject("sub_1"))

	if got := repo.users["user-1"]; got.SubscriptionStatus != "canceled" || repo.updates != 0 {
		t.Fatalf("status=%q updates=%d, want canceled and no write", got.SubscriptionStatus, repo.updates)
	}
}

func TestOutOfOrderSubscriptionUpdateIsIgnored(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo(subscribedUser("pro", "active", "sub_1"))
	h := NewPaymentHandler(repo)

	deliver(t, h, "customer.subscription.updated", tLater,
		map[string]any{"id": "sub_1", "object": "subscription", "status": "active", "cancel_at_period_end": true})
	// An older "active" snapshot delivered late must not undo the cancel request.
	deliver(t, h, "customer.subscription.updated", tCancel,
		map[string]any{"id": "sub_1", "object": "subscription", "status": "active", "cancel_at_period_end": false})

	if got := repo.users["user-1"].SubscriptionStatus; got != "canceling" {
		t.Fatalf("status = %q, want canceling", got)
	}
}

func TestResubscribeAfterCancelActivatesNewSubscription(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	at := time.Unix(tCancel, 0).UTC()
	u := subscribedUser("free", "canceled", "sub_1")
	u.StripeEventAt = &at
	repo := newFakeUserRepo(u)
	h := NewPaymentHandler(repo)

	deliver(t, h, "checkout.session.completed", tLater, checkoutObject("sub_2"))

	got := repo.users["user-1"]
	if got.SubscriptionPlan != "pro" || got.SubscriptionStatus != "active" ||
		got.StripeSubscriptionID == nil || *got.StripeSubscriptionID != "sub_2" {
		t.Fatalf("resubscribe not applied: plan=%q status=%q", got.SubscriptionPlan, got.SubscriptionStatus)
	}
	if !got.StripeEventAt.Equal(time.Unix(tLater, 0)) {
		t.Fatalf("stripe_event_at = %v, want checkout time", got.StripeEventAt)
	}
}

func TestCheckoutForUnknownUserIsAcknowledged(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo()
	h := NewPaymentHandler(repo)
	deliver(t, h, "checkout.session.completed", tCheckout, checkoutObject("sub_1"))
	if repo.updates != 0 {
		t.Fatalf("updates = %d, want 0", repo.updates)
	}
}

func TestCheckoutLookupFailureIsRetried(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo(subscribedUser("free", "active", ""))
	repo.getErr = errors.New("connection refused")
	h := NewPaymentHandler(repo)

	payload, sig := signedEventAt(t, "checkout.session.completed", tCheckout, checkoutObject("sub_1"))
	if code := postWebhook(t, h, payload, sig); code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 so Stripe retries", code)
	}
	if repo.updates != 0 {
		t.Fatalf("updates = %d, want 0", repo.updates)
	}

	// Once the database recovers, the retried delivery activates the plan.
	repo.getErr = nil
	deliver(t, h, "checkout.session.completed", tCheckout, checkoutObject("sub_1"))
	if u := repo.users["user-1"]; u.SubscriptionPlan != "pro" || u.SubscriptionStatus != "active" {
		t.Fatalf("plan=%q status=%q after retry, want pro/active", u.SubscriptionPlan, u.SubscriptionStatus)
	}
}
