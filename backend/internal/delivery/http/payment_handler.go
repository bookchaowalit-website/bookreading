package http

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/stripe/stripe-go/v74"
	portal "github.com/stripe/stripe-go/v74/billingportal/session"
	checkout "github.com/stripe/stripe-go/v74/checkout/session"
	"github.com/stripe/stripe-go/v74/customer"
	"github.com/stripe/stripe-go/v74/subscription"
	"github.com/stripe/stripe-go/v74/webhook"
)

func init() {
	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeKey != "" {
		stripe.Key = stripeKey
	}
}

type PaymentHandler struct {
	userRepo domain.UserRepository
}

func NewPaymentHandler(userRepo domain.UserRepository) *PaymentHandler {
	return &PaymentHandler{userRepo: userRepo}
}

type CreateCheckoutSessionRequest struct {
	PriceID string `json:"price_id"`
}

type CreateCheckoutSessionResponse struct {
	SessionURL string `json:"session_url"`
	SessionID  string `json:"session_id"`
}

// Pricing plans
var plans = map[string]struct {
	Name        string
	PriceID     string
	Amount      int64
	Currency    string
	Interval    string
	Description string
}{
	"pro": {
		Name:        "Pro",
		PriceID:     "price_pro_monthly",
		Amount:      9900, // $99.00 in cents (or 99 THB)
		Currency:    "thb",
		Interval:    "month",
		Description: "Pro plan - Unlimited novels, no ads, export features",
	},
	"team": {
		Name:        "Team",
		PriceID:     "price_team_monthly",
		Amount:      29900, // $299.00 in cents (or 299 THB)
		Currency:    "thb",
		Interval:    "month",
		Description: "Team plan - Everything in Pro + team features",
	},
}

func (h *PaymentHandler) GetPricingPlans(w http.ResponseWriter, r *http.Request) {
	plansList := make([]map[string]interface{}, 0, len(plans))
	for id, plan := range plans {
		plansList = append(plansList, map[string]interface{}{
			"id":          id,
			"name":        plan.Name,
			"price_id":    plan.PriceID,
			"amount":      plan.Amount,
			"currency":    plan.Currency,
			"interval":    plan.Interval,
			"description": plan.Description,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plans": plansList,
	})
}

func (h *PaymentHandler) CreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req CreateCheckoutSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request")
		return
	}

	plan, ok := plans[req.PriceID]
	if !ok {
		respondError(w, http.StatusBadRequest, "Invalid price ID")
		return
	}

	// Get user
	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get user")
		return
	}

	// Create or get Stripe customer
	var customerID string
	if user.StripeCustomerID != nil && *user.StripeCustomerID != "" {
		customerID = *user.StripeCustomerID
	} else {
		custParams := &stripe.CustomerParams{
			Email: stripe.String(user.Email),
			Name:  stripe.String(user.Name),
		}
		custParams.AddMetadata("user_id", userID)
		cust, err := customer.New(custParams)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to create customer")
			return
		}
		customerID = cust.ID

		// Update user with Stripe customer ID
		user.StripeCustomerID = &customerID
		if err := h.userRepo.Update(r.Context(), user); err != nil {
			log.Printf("[WARN] failed to persist Stripe customer ID for user %s: %v", userID, err)
		}
	}

	// Create checkout session
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		PaymentMethodTypes: stripe.StringSlice([]string{
			"card",
			"promptpay", // Thai payment method
		}),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency: stripe.String(plan.Currency),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name:        stripe.String(plan.Name),
						Description: stripe.String(plan.Description),
					},
					UnitAmount: stripe.Int64(plan.Amount),
					Recurring: &stripe.CheckoutSessionLineItemPriceDataRecurringParams{
						Interval: stripe.String(plan.Interval),
					},
				},
				Quantity: stripe.Int64(1),
			},
		},
		Mode:       stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		SuccessURL: stripe.String(frontendURL() + "/app/settings?session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:  stripe.String(frontendURL() + "/app/settings?canceled=true"),
	}
	params.AddMetadata("user_id", userID)
	params.AddMetadata("plan", req.PriceID)

	sess, err := checkout.New(params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create checkout session")
		return
	}

	respondJSON(w, http.StatusOK, CreateCheckoutSessionResponse{
		SessionURL: sess.URL,
		SessionID:  sess.ID,
	})
}

// maxWebhookBodyBytes caps Stripe webhook payloads (Stripe events are < 64 KiB).
const maxWebhookBodyBytes = 65536

func (h *PaymentHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	if webhookSecret == "" {
		// Never accept unsigned events when the secret is not configured.
		respondError(w, http.StatusServiceUnavailable, "Webhook not configured")
		return
	}

	// io.ReadAll handles chunked bodies (ContentLength == -1) and short reads;
	// the previous make([]byte, r.ContentLength) + single Read could panic or
	// truncate the payload.
	body, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookBodyBytes+1))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Failed to read body")
		return
	}
	if len(body) > maxWebhookBodyBytes {
		respondError(w, http.StatusRequestEntityTooLarge, "Payload too large")
		return
	}

	sig := r.Header.Get("Stripe-Signature")
	event, err := webhook.ConstructEvent(body, sig, webhookSecret)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid signature")
		return
	}

	switch event.Type {
	case "checkout.session.completed":
		var sess stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &sess); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid event payload")
			return
		}

		if err := h.applyCheckoutCompleted(r, eventTime(&event), &sess); err != nil {
			log.Printf("[ERROR] stripe checkout.session.completed %s: %v", sess.ID, err)
			// Non-2xx makes Stripe retry the event later.
			respondError(w, http.StatusInternalServerError, "Failed to update user")
			return
		}

	case "customer.subscription.deleted", "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil || sub.ID == "" {
			respondError(w, http.StatusBadRequest, "Invalid event payload")
			return
		}
		if err := h.syncSubscription(r, string(event.Type), eventTime(&event), &sub); err != nil {
			log.Printf("[ERROR] stripe %s for subscription %s: %v", event.Type, sub.ID, err)
			respondError(w, http.StatusInternalServerError, "Failed to update subscription")
			return
		}
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "received"})
}

// syncSubscription mirrors a Stripe subscription's state onto its owner.
// The event carries the full current subscription object, so applying it is
// idempotent: replays and retries converge on the same user row, and a no-op
// write is skipped. Unknown subscriptions (for example an older subscription
// already replaced by a new checkout) are acknowledged without changes.
func (h *PaymentHandler) syncSubscription(r *http.Request, eventType string, at time.Time, sub *stripe.Subscription) error {
	user, err := h.userRepo.GetByStripeSubscriptionID(r.Context(), sub.ID)
	if err != nil {
		return err
	}
	if user == nil || isStaleEvent(user, at) {
		return nil
	}

	plan, status := user.SubscriptionPlan, subscriptionStatusFor(sub)
	if eventType == "customer.subscription.deleted" {
		status = "canceled"
	}
	if status == "canceled" {
		plan = "free"
	}
	if plan == user.SubscriptionPlan && status == user.SubscriptionStatus && !advancesEventTime(user, at) {
		return nil
	}
	user.SubscriptionPlan = plan
	user.SubscriptionStatus = status
	markEventApplied(user, at)
	return h.userRepo.Update(r.Context(), user)
}

// applyCheckoutCompleted activates the plan bought in a checkout session.
//
// Stripe does not guarantee delivery order and retries failed deliveries for
// days, so a checkout.session.completed can arrive after the subscription it
// created was canceled. Two guards keep such a stale event from re-activating
// the user:
//   - events older than the newest event already applied are ignored, and
//   - a checkout for the subscription the user already holds as canceled is
//     ignored regardless of timestamps (a canceled subscription is terminal
//     in Stripe; resubscribing always creates a new subscription ID).
func (h *PaymentHandler) applyCheckoutCompleted(r *http.Request, at time.Time, sess *stripe.CheckoutSession) error {
	userID := sess.Metadata["user_id"]
	if userID == "" {
		return nil
	}
	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil || user == nil {
		// Unknown user (for example deleted since checkout): acknowledge.
		return nil
	}
	if isStaleEvent(user, at) {
		log.Printf("[INFO] ignoring stale checkout.session.completed %s for user %s", sess.ID, userID)
		return nil
	}
	var subID string
	if sess.Subscription != nil {
		subID = sess.Subscription.ID
	}
	if subID != "" && user.StripeSubscriptionID != nil && *user.StripeSubscriptionID == subID &&
		user.SubscriptionStatus == "canceled" {
		log.Printf("[INFO] ignoring checkout.session.completed %s for already canceled subscription %s", sess.ID, subID)
		return nil
	}

	user.SubscriptionPlan = sess.Metadata["plan"]
	user.SubscriptionStatus = "active"
	if subID != "" {
		user.StripeSubscriptionID = &subID
	}
	markEventApplied(user, at)
	return h.userRepo.Update(r.Context(), user)
}

// eventTime returns the event's creation time (Stripe `created`, seconds).
func eventTime(event *stripe.Event) time.Time {
	return time.Unix(event.Created, 0).UTC()
}

// isStaleEvent reports whether an event is strictly older than the newest one
// already applied to the user. `created` has one-second resolution, so events
// from the same second are still applied (the per-type guards and the
// idempotent state mapping handle those).
func isStaleEvent(user *domain.User, at time.Time) bool {
	return user.StripeEventAt != nil && at.Before(*user.StripeEventAt)
}

func advancesEventTime(user *domain.User, at time.Time) bool {
	return user.StripeEventAt == nil || at.After(*user.StripeEventAt)
}

func markEventApplied(user *domain.User, at time.Time) {
	if advancesEventTime(user, at) {
		t := at
		user.StripeEventAt = &t
	}
}

// subscriptionStatusFor maps Stripe's subscription status onto the values the
// frontend understands: active, canceling, past_due, incomplete or canceled.
func subscriptionStatusFor(sub *stripe.Subscription) string {
	switch sub.Status {
	case stripe.SubscriptionStatusActive, stripe.SubscriptionStatusTrialing:
		if sub.CancelAtPeriodEnd {
			return "canceling"
		}
		return "active"
	case stripe.SubscriptionStatusPastDue, stripe.SubscriptionStatusUnpaid, stripe.SubscriptionStatusPaused:
		return "past_due"
	case stripe.SubscriptionStatusIncomplete:
		return "incomplete"
	default: // canceled, incomplete_expired
		return "canceled"
	}
}

// frontendURL is the public origin used for Stripe checkout redirects.
func frontendURL() string {
	if u := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/"); u != "" {
		return u
	}
	return "http://localhost:3000"
}

func (h *PaymentHandler) GetSubscriptionStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get user")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plan":   user.SubscriptionPlan,
		"status": user.SubscriptionStatus,
	})
}

func (h *PaymentHandler) CancelSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get user")
		return
	}

	if user.StripeSubscriptionID == nil || *user.StripeSubscriptionID == "" {
		respondError(w, http.StatusBadRequest, "No active subscription")
		return
	}

	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	_, err = subscription.Update(*user.StripeSubscriptionID, params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to cancel subscription")
		return
	}

	user.SubscriptionStatus = "canceling"
	if err := h.userRepo.Update(r.Context(), user); err != nil {
		log.Printf("[WARN] failed to persist canceling status for user %s: %v", userID, err)
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"status": "Subscription will be canceled at the end of the billing period",
	})
}

// CreateBillingPortal creates a Stripe Customer Portal session for subscription management
func (h *PaymentHandler) CreateBillingPortal(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get user")
		return
	}

	if user.StripeCustomerID == nil || *user.StripeCustomerID == "" {
		respondError(w, http.StatusBadRequest, "No Stripe customer found")
		return
	}

	returnURL := os.Getenv("STRIPE_BILLING_PORTAL_RETURN_URL")
	if returnURL == "" {
		returnURL = "http://localhost:3000/app/settings"
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(*user.StripeCustomerID),
		ReturnURL: stripe.String(returnURL),
	}

	ps, err := portal.New(params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create billing portal session")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"url": ps.URL})
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
