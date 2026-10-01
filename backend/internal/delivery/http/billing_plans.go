package http

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

// BillingPlan is a paid plan backed by a recurring Stripe Price.
//
// Stripe owns the charged amount, currency and interval (they are part of
// the Price object). Amount/Currency/Interval here are display metadata for
// the pricing page only and must be kept in sync with the Stripe Price.
type BillingPlan struct {
	ID          string
	Name        string
	PriceID     string
	Amount      int64
	Currency    string
	Interval    string
	Description string
}

// BillingPlans maps a plan key ("pro", "team") to its configured plan.
// An empty catalog means billing is disabled.
type BillingPlans map[string]BillingPlan

// planCatalog lists the paid plans and the env var holding each Stripe Price ID.
var planCatalog = []struct {
	plan   BillingPlan
	envVar string
}{
	{BillingPlan{ID: "pro", Name: "Pro", Amount: 9900, Currency: "thb", Interval: "month",
		Description: "Pro plan - Unlimited novels, no ads, export features"}, "STRIPE_PRICE_PRO"},
	{BillingPlan{ID: "team", Name: "Team", Amount: 29900, Currency: "thb", Interval: "month",
		Description: "Team plan - Everything in Pro + team features"}, "STRIPE_PRICE_TEAM"},
}

// stripePriceIDPattern matches Stripe Price IDs (for example price_1PqR2sT3uV4w).
// Placeholders such as the old "price_pro_monthly" do not match.
var stripePriceIDPattern = regexp.MustCompile(`^price_[A-Za-z0-9]{8,}$`)

// LoadBillingPlans builds the plan catalog from configuration.
//
// Rules:
//   - a configured Price ID must look like a real Stripe Price ID;
//   - the same Price ID cannot back two plans (webhooks map price -> plan);
//   - when Stripe is enabled (STRIPE_SECRET_KEY set) every plan needs a Price ID;
//   - when Stripe is disabled no Price IDs may be half-configured, and the
//     catalog is empty (checkout answers 503).
func LoadBillingPlans(getenv func(string) string) (BillingPlans, error) {
	stripeEnabled := strings.TrimSpace(getenv("STRIPE_SECRET_KEY")) != ""
	plans := BillingPlans{}
	seen := map[string]string{}
	var missing []string
	for _, entry := range planCatalog {
		priceID := strings.TrimSpace(getenv(entry.envVar))
		if priceID == "" {
			missing = append(missing, entry.envVar)
			continue
		}
		if !stripePriceIDPattern.MatchString(priceID) {
			return nil, fmt.Errorf("%s=%q is not a Stripe Price ID (expected price_<id>)", entry.envVar, priceID)
		}
		if other, dup := seen[priceID]; dup {
			return nil, fmt.Errorf("%s and %s use the same Stripe Price ID", other, entry.envVar)
		}
		seen[priceID] = entry.envVar
		plan := entry.plan
		plan.PriceID = priceID
		plans[plan.ID] = plan
	}
	if len(missing) == 0 {
		if !stripeEnabled {
			return nil, fmt.Errorf("stripe price IDs are set but STRIPE_SECRET_KEY is empty")
		}
		return plans, nil
	}
	if stripeEnabled {
		return nil, fmt.Errorf("STRIPE_SECRET_KEY is set but %s is missing", strings.Join(missing, ", "))
	}
	if len(plans) > 0 {
		return nil, fmt.Errorf("billing is partially configured: %s is missing", strings.Join(missing, ", "))
	}
	return BillingPlans{}, nil
}

// LoadBillingPlansFromEnv is LoadBillingPlans over the process environment.
func LoadBillingPlansFromEnv() (BillingPlans, error) {
	return LoadBillingPlans(os.Getenv)
}

// Enabled reports whether any paid plan is purchasable.
func (p BillingPlans) Enabled() bool { return len(p) > 0 }

// PlanForPrice returns the plan key backed by a Stripe Price ID.
func (p BillingPlans) PlanForPrice(priceID string) (string, bool) {
	for id, plan := range p {
		if plan.PriceID == priceID {
			return id, true
		}
	}
	return "", false
}

// Ordered returns the plans in catalog order (stable API output).
func (p BillingPlans) Ordered() []BillingPlan {
	out := make([]BillingPlan, 0, len(p))
	for _, entry := range planCatalog {
		if plan, ok := p[entry.plan.ID]; ok {
			out = append(out, plan)
		}
	}
	return out
}
