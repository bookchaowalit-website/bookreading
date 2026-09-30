package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bookreading/backend/internal/domain"
	"github.com/stripe/stripe-go/v74"
	"github.com/stripe/stripe-go/v74/webhook"
)

const testWebhookSecret = "whsec_unit_test_only"

// fakeUserRepo is an in-memory domain.UserRepository for handler tests.
type fakeUserRepo struct {
	users     map[string]*domain.User
	updates   int
	updateErr error
}

func newFakeUserRepo(users ...*domain.User) *fakeUserRepo {
	r := &fakeUserRepo{users: map[string]*domain.User{}}
	for _, u := range users {
		r.users[u.ID] = u
	}
	return r
}

func (r *fakeUserRepo) Create(_ context.Context, u *domain.User) error { r.users[u.ID] = u; return nil }
func (r *fakeUserRepo) GetByID(_ context.Context, id string) (*domain.User, error) {
	u, ok := r.users[id]
	if !ok {
		return nil, errors.New("not found")
	}
	c := *u
	return &c, nil
}
func (r *fakeUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	for _, u := range r.users {
		if u.Email == email {
			c := *u
			return &c, nil
		}
	}
	return nil, errors.New("not found")
}
func (r *fakeUserRepo) GetByStripeSubscriptionID(_ context.Context, id string) (*domain.User, error) {
	for _, u := range r.users {
		if u.StripeSubscriptionID != nil && *u.StripeSubscriptionID == id {
			c := *u
			return &c, nil
		}
	}
	return nil, nil
}
func (r *fakeUserRepo) Update(_ context.Context, u *domain.User) error {
	if r.updateErr != nil {
		return r.updateErr
	}
	r.updates++
	c := *u
	r.users[u.ID] = &c
	return nil
}
func (r *fakeUserRepo) Delete(_ context.Context, id string) error { delete(r.users, id); return nil }

func subscribedUser(plan, status, subID string) *domain.User {
	return &domain.User{ID: "user-1", Email: "reader@example.test", SubscriptionPlan: plan,
		SubscriptionStatus: status, StripeSubscriptionID: &subID}
}

// signedEvent builds a Stripe test fixture event signed with the test secret.
func signedEvent(t *testing.T, eventType string, object map[string]any) (string, string) {
	t.Helper()
	return signedEventAt(t, eventType, 0, object)
}

// signedEventAt is signedEvent with an explicit event `created` timestamp.
func signedEventAt(t *testing.T, eventType string, created int64, object map[string]any) (string, string) {
	t.Helper()
	raw, err := json.Marshal(object)
	if err != nil {
		t.Fatal(err)
	}
	payload := fmt.Sprintf(`{"id":"evt_test","object":"event","api_version":%q,"type":%q,"created":%d,"data":{"object":%s}}`,
		stripe.APIVersion, eventType, created, raw)
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: []byte(payload), Secret: testWebhookSecret})
	return payload, signed.Header
}

func postWebhook(t *testing.T, h *PaymentHandler, payload, sig string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/payments/webhook", strings.NewReader(payload))
	req.Header.Set("Stripe-Signature", sig)
	w := httptest.NewRecorder()
	h.HandleWebhook(w, req)
	return w.Code
}

func TestSubscriptionWebhookTransitions(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	cases := []struct {
		name       string
		event      string
		object     map[string]any
		wantPlan   string
		wantStatus string
	}{
		{"deleted downgrades to free", "customer.subscription.deleted",
			map[string]any{"id": "sub_1", "object": "subscription", "status": "canceled"}, "free", "canceled"},
		{"cancel at period end", "customer.subscription.updated",
			map[string]any{"id": "sub_1", "object": "subscription", "status": "active", "cancel_at_period_end": true}, "pro", "canceling"},
		{"payment failure", "customer.subscription.updated",
			map[string]any{"id": "sub_1", "object": "subscription", "status": "past_due"}, "pro", "past_due"},
		{"updated to canceled", "customer.subscription.updated",
			map[string]any{"id": "sub_1", "object": "subscription", "status": "canceled"}, "free", "canceled"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newFakeUserRepo(subscribedUser("pro", "active", "sub_1"))
			h := NewPaymentHandler(repo)
			payload, sig := signedEvent(t, tc.event, tc.object)
			if code := postWebhook(t, h, payload, sig); code != http.StatusOK {
				t.Fatalf("status = %d, want 200", code)
			}
			u := repo.users["user-1"]
			if u.SubscriptionPlan != tc.wantPlan || u.SubscriptionStatus != tc.wantStatus {
				t.Fatalf("got plan=%q status=%q, want %q/%q", u.SubscriptionPlan, u.SubscriptionStatus, tc.wantPlan, tc.wantStatus)
			}
		})
	}
}

func TestSubscriptionWebhookReactivation(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo(subscribedUser("pro", "canceling", "sub_1"))
	h := NewPaymentHandler(repo)
	payload, sig := signedEvent(t, "customer.subscription.updated",
		map[string]any{"id": "sub_1", "object": "subscription", "status": "active", "cancel_at_period_end": false})
	if code := postWebhook(t, h, payload, sig); code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if got := repo.users["user-1"].SubscriptionStatus; got != "active" {
		t.Fatalf("status = %q, want active after resuming", got)
	}
}

func TestSubscriptionWebhookIsIdempotent(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo(subscribedUser("pro", "active", "sub_1"))
	h := NewPaymentHandler(repo)
	payload, sig := signedEvent(t, "customer.subscription.deleted",
		map[string]any{"id": "sub_1", "object": "subscription", "status": "canceled"})
	for i := 0; i < 3; i++ {
		if code := postWebhook(t, h, payload, sig); code != http.StatusOK {
			t.Fatalf("delivery %d: status = %d, want 200", i, code)
		}
	}
	if repo.updates != 1 {
		t.Fatalf("updates = %d, want exactly 1 write for a replayed event", repo.updates)
	}
}

func TestSubscriptionWebhookUnknownSubscriptionIsAcknowledged(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	// The user has since moved to sub_new; deleting the old sub must not downgrade them.
	repo := newFakeUserRepo(subscribedUser("team", "active", "sub_new"))
	h := NewPaymentHandler(repo)
	payload, sig := signedEvent(t, "customer.subscription.deleted",
		map[string]any{"id": "sub_old", "object": "subscription", "status": "canceled"})
	if code := postWebhook(t, h, payload, sig); code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if u := repo.users["user-1"]; u.SubscriptionPlan != "team" || repo.updates != 0 {
		t.Fatalf("user changed by unrelated subscription: plan=%q updates=%d", u.SubscriptionPlan, repo.updates)
	}
}

func TestSubscriptionWebhookPersistenceFailureAsksForRetry(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	repo := newFakeUserRepo(subscribedUser("pro", "active", "sub_1"))
	repo.updateErr = errors.New("db down")
	h := NewPaymentHandler(repo)
	payload, sig := signedEvent(t, "customer.subscription.deleted",
		map[string]any{"id": "sub_1", "object": "subscription", "status": "canceled"})
	if code := postWebhook(t, h, payload, sig); code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 so Stripe retries", code)
	}
}

func TestSubscriptionWebhookRejectsMissingID(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	h := NewPaymentHandler(newFakeUserRepo())
	payload, sig := signedEvent(t, "customer.subscription.updated", map[string]any{"object": "subscription"})
	if code := postWebhook(t, h, payload, sig); code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}

func TestFrontendURL(t *testing.T) {
	t.Setenv("FRONTEND_URL", "")
	if got := frontendURL(); got != "http://localhost:3000" {
		t.Fatalf("default = %q", got)
	}
	t.Setenv("FRONTEND_URL", "https://read.example.test/")
	if got := frontendURL(); got != "https://read.example.test" {
		t.Fatalf("configured = %q, want trailing slash trimmed", got)
	}
}
