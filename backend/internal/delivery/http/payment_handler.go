package http

import (
	"encoding/json"
	"net/http"

	"github.com/bookreading/backend/internal/domain"
	"github.com/stripe/stripe-go/v74"
	"github.com/stripe/stripe-go/v74/checkout/session"
	"github.com/stripe/stripe-go/v74/customer"
	"github.com/stripe/stripe-go/v74/subscription"
	"github.com/stripe/stripe-go/v74/webhook"
)

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
	if user.StripeCustomerID != "" {
		customerID = user.StripeCustomerID
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
		user.StripeCustomerID = customerID
		h.userRepo.Update(r.Context(), user)
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
						Name: stripe.String(plan.Name),
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
		SuccessURL: stripe.String("http://localhost:3000/app/settings?session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:  stripe.String("http://localhost:3000/app/settings?canceled=true"),
	}
	params.AddMetadata("user_id", userID)
	params.AddMetadata("plan", req.PriceID)

	sess, err := session.New(params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create checkout session")
		return
	}

	respondJSON(w, http.StatusOK, CreateCheckoutSessionResponse{
		SessionURL: sess.URL,
		SessionID:  sess.ID,
	})
}

func (h *PaymentHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	// Read request body
	body := make([]byte, r.ContentLength)
	r.Body.Read(body)

	// Get Stripe signature header
	sig := r.Header.Get("Stripe-Signature")

	// Verify webhook signature (in production, use webhook secret)
	event, err := webhook.ConstructEvent(body, sig, "whsec_...") // Replace with actual webhook secret
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid signature")
		return
	}

	// Handle different event types
	switch event.Type {
	case "checkout.session.completed":
		var sess stripe.CheckoutSession
		json.Unmarshal(event.Data.Raw, &sess)

		userID := sess.Metadata["user_id"]
		plan := sess.Metadata["plan"]

		// Update user subscription
		user, err := h.userRepo.GetByID(r.Context(), userID)
		if err == nil {
			user.SubscriptionPlan = plan
			user.SubscriptionStatus = "active"
			user.StripeSubscriptionID = sess.Subscription.ID
			h.userRepo.Update(r.Context(), user)
		}

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		json.Unmarshal(event.Data.Raw, &sub)

		// Find user by customer ID and update subscription status
		// In production, you'd have a method to find user by Stripe customer ID

	case "customer.subscription.updated":
		var sub stripe.Subscription
		json.Unmarshal(event.Data.Raw, &sub)
		// Handle subscription updates
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "received"})
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

	if user.StripeSubscriptionID == "" {
		respondError(w, http.StatusBadRequest, "No active subscription")
		return
	}

	// Cancel subscription at period end
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	_, err = subscription.Update(user.StripeSubscriptionID, params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to cancel subscription")
		return
	}

	// Update user status
	user.SubscriptionStatus = "canceling"
	h.userRepo.Update(r.Context(), user)

	respondJSON(w, http.StatusOK, map[string]string{
		"status": "Subscription will be canceled at the end of the billing period",
	})
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
