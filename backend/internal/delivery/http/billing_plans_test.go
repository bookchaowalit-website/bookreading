package http

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/bookreading/backend/internal/domain"
	"github.com/stripe/stripe-go/v74"
)

// Fixture Price IDs: shaped like Stripe IDs, never real.
const (
	fixturePricePro  = "price_FixturePro0001"
	fixturePriceTeam = "price_FixtureTeam001"
)

func envFrom(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func fixturePlans(t *testing.T) BillingPlans {
	t.Helper()
	plans, err := LoadBillingPlans(envFrom(map[string]string{
		"STRIPE_SECRET_KEY": "sk_test_fixture",
		"STRIPE_PRICE_PRO":  fixturePricePro,
		"STRIPE_PRICE_TEAM": fixturePriceTeam,
	}))
	if err != nil {
		t.Fatal(err)
	}
	return plans
}

func TestLoadBillingPlans(t *testing.T) {
	cases := []struct {
		name      string
		env       map[string]string
		wantErr   string
		wantPlans int
	}{
		{"billing disabled", map[string]string{}, "", 0},
		{"fully configured", map[string]string{"STRIPE_SECRET_KEY": "sk_test_fixture",
			"STRIPE_PRICE_PRO": fixturePricePro, "STRIPE_PRICE_TEAM": " " + fixturePriceTeam + " "}, "", 2},
		{"key without prices", map[string]string{"STRIPE_SECRET_KEY": "sk_test_fixture"},
			"STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM is missing", 0},
		{"one price missing", map[string]string{"STRIPE_SECRET_KEY": "sk_test_fixture",
			"STRIPE_PRICE_PRO": fixturePricePro}, "STRIPE_PRICE_TEAM is missing", 0},
		{"legacy placeholder rejected", map[string]string{"STRIPE_SECRET_KEY": "sk_test_fixture",
			"STRIPE_PRICE_PRO": "price_pro_monthly", "STRIPE_PRICE_TEAM": fixturePriceTeam}, "not a Stripe Price ID", 0},
		{"product id rejected", map[string]string{"STRIPE_SECRET_KEY": "sk_test_fixture",
			"STRIPE_PRICE_PRO": "prod_FixturePro0001", "STRIPE_PRICE_TEAM": fixturePriceTeam}, "not a Stripe Price ID", 0},
		{"duplicate price rejected", map[string]string{"STRIPE_SECRET_KEY": "sk_test_fixture",
			"STRIPE_PRICE_PRO": fixturePricePro, "STRIPE_PRICE_TEAM": fixturePricePro}, "same Stripe Price ID", 0},
		{"prices without key", map[string]string{
			"STRIPE_PRICE_PRO": fixturePricePro, "STRIPE_PRICE_TEAM": fixturePriceTeam}, "STRIPE_SECRET_KEY is empty", 0},
		{"partial without key", map[string]string{"STRIPE_PRICE_PRO": fixturePricePro}, "partially configured", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			plans, err := LoadBillingPlans(envFrom(tc.env))
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %v, want containing %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(plans) != tc.wantPlans {
				t.Fatalf("plans = %d, want %d", len(plans), tc.wantPlans)
			}
		})
	}
}

func TestBillingPlansLookup(t *testing.T) {
	plans := fixturePlans(t)
	if got, ok := plans.PlanForPrice(fixturePriceTeam); !ok || got != "team" {
		t.Fatalf("PlanForPrice(team) = %q, %v", got, ok)
	}
	if _, ok := plans.PlanForPrice("price_Unknown000001"); ok {
		t.Fatal("unknown price must not map to a plan")
	}
	ordered := plans.Ordered()
	if len(ordered) != 2 || ordered[0].ID != "pro" || ordered[1].ID != "team" {
		t.Fatalf("Ordered() = %+v, want pro then team", ordered)
	}
}

func authedRequest(method, target, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	return req.WithContext(context.WithValue(req.Context(), "userID", "user-1")) //nolint:staticcheck // matches AuthMiddleware's key
}

func TestGetPricingPlansUsesConfiguredCatalog(t *testing.T) {
	h := NewPaymentHandlerWithPlans(nil, fixturePlans(t))
	w := httptest.NewRecorder()
	h.GetPricingPlans(w, authedRequest(http.MethodGet, "/api/payments/plans", ""))
	var body struct {
		Plans          []map[string]any `json:"plans"`
		BillingEnabled bool             `json:"billing_enabled"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.BillingEnabled || len(body.Plans) != 2 || body.Plans[0]["id"] != "pro" {
		t.Fatalf("unexpected plans response: %s", w.Body.String())
	}
	if strings.Contains(w.Body.String(), fixturePricePro) {
		t.Fatal("Stripe Price IDs must not be exposed; clients send plan keys")
	}
}

func TestCheckoutWhenBillingDisabled(t *testing.T) {
	h := NewPaymentHandlerWithPlans(newFakeUserRepo(), nil)
	w := httptest.NewRecorder()
	h.CreateCheckoutSession(w, authedRequest(http.MethodPost, "/api/payments/stripe/checkout", `{"price_id":"pro"}`))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 when billing is not configured", w.Code)
	}
}

func TestCheckoutRejectsUnknownPlan(t *testing.T) {
	h := NewPaymentHandlerWithPlans(newFakeUserRepo(), fixturePlans(t))
	for _, planKey := range []string{"enterprise", fixturePricePro} {
		w := httptest.NewRecorder()
		h.CreateCheckoutSession(w, authedRequest(http.MethodPost, "/api/payments/stripe/checkout", `{"price_id":"`+planKey+`"}`))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("plan %q: status = %d, want 400", planKey, w.Code)
		}
	}
}

// fakeStripeAPI records the form bodies Stripe would receive. It stands in
// for api.stripe.com through stripe-go's backend hook, so no network is used.
type fakeStripeAPI struct {
	mu    sync.Mutex
	forms map[string]url.Values
}

func (f *fakeStripeAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	form, _ := url.ParseQuery(string(raw))
	f.mu.Lock()
	f.forms[r.URL.Path] = form
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	switch r.URL.Path {
	case "/v1/customers":
		_, _ = io.WriteString(w, `{"id":"cus_fixture","object":"customer"}`)
	case "/v1/checkout/sessions":
		_, _ = io.WriteString(w, `{"id":"cs_test_fixture","object":"checkout.session","url":"https://checkout.example.test/cs_test_fixture"}`)
	default:
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"error":{"type":"invalid_request_error","message":"not faked"}}`)
	}
}

func useFakeStripe(t *testing.T) *fakeStripeAPI {
	t.Helper()
	fake := &fakeStripeAPI{forms: map[string]url.Values{}}
	srv := httptest.NewServer(fake)
	prevKey := stripe.Key
	prevBackend := stripe.GetBackend(stripe.APIBackend)
	stripe.Key = "sk_test_fixture"
	stripe.SetBackend(stripe.APIBackend, stripe.GetBackendWithConfig(stripe.APIBackend, &stripe.BackendConfig{
		URL:               stripe.String(srv.URL),
		HTTPClient:        srv.Client(),
		MaxNetworkRetries: stripe.Int64(0),
		LeveledLogger:     &stripe.LeveledLogger{Level: stripe.LevelNull},
	}))
	t.Cleanup(func() {
		srv.Close()
		stripe.Key = prevKey
		stripe.SetBackend(stripe.APIBackend, prevBackend)
	})
	return fake
}

func TestCheckoutUsesConfiguredStripePrice(t *testing.T) {
	fake := useFakeStripe(t)
	repo := newFakeUserRepo(&domain.User{ID: "user-1", Email: "reader@example.test", Name: "Reader"})
	h := NewPaymentHandlerWithPlans(repo, fixturePlans(t))
	w := httptest.NewRecorder()
	h.CreateCheckoutSession(w, authedRequest(http.MethodPost, "/api/payments/stripe/checkout", `{"price_id":"team"}`))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
	}
	form := fake.forms["/v1/checkout/sessions"]
	if got := form.Get("line_items[0][price]"); got != fixturePriceTeam {
		t.Fatalf("line item price = %q, want configured %q (form %v)", got, fixturePriceTeam, form)
	}
	for key := range form {
		if strings.Contains(key, "price_data") {
			t.Fatalf("checkout must not send inline price_data, got %q", key)
		}
	}
	if form.Get("metadata[plan]") != "team" || form.Get("mode") != "subscription" {
		t.Fatalf("unexpected checkout form: %v", form)
	}
	if u := repo.users["user-1"]; u.StripeCustomerID == nil || *u.StripeCustomerID != "cus_fixture" {
		t.Fatal("new Stripe customer ID was not persisted")
	}
}

func subscriptionWithPrice(status, priceID string) map[string]any {
	return map[string]any{"id": "sub_1", "object": "subscription", "status": status,
		"items": map[string]any{"object": "list", "data": []any{
			map[string]any{"id": "si_1", "object": "subscription_item",
				"price": map[string]any{"id": priceID, "object": "price"}},
		}}}
}

func TestSubscriptionWebhookAppliesPortalPlanSwitch(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", testWebhookSecret)
	cases := []struct {
		name       string
		priceID    string
		status     string
		wantPlan   string
		wantStatus string
	}{
		{"upgrade to team", fixturePriceTeam, "active", "team", "active"},
		{"unknown price keeps plan", "price_Retired000001", "active", "pro", "active"},
		{"canceled still downgrades", fixturePriceTeam, "canceled", "free", "canceled"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newFakeUserRepo(subscribedUser("pro", "active", "sub_1"))
			h := NewPaymentHandlerWithPlans(repo, fixturePlans(t))
			payload, sig := signedEvent(t, "customer.subscription.updated", subscriptionWithPrice(tc.status, tc.priceID))
			if code := postWebhook(t, h, payload, sig); code != http.StatusOK {
				t.Fatalf("status = %d, want 200", code)
			}
			u := repo.users["user-1"]
			if u.SubscriptionPlan != tc.wantPlan || u.SubscriptionStatus != tc.wantStatus {
				t.Fatalf("got %q/%q, want %q/%q", u.SubscriptionPlan, u.SubscriptionStatus, tc.wantPlan, tc.wantStatus)
			}
		})
	}
}
