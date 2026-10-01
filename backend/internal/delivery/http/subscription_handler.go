package http

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/bookreading/backend/internal/domain"
)

// triggerUpdateTimeout bounds a manual update run; it outlives the request.
const triggerUpdateTimeout = 30 * time.Minute

// SubscribeRequest represents the request body for subscribing to a novel
type SubscribeRequest struct {
	NovelID    string `json:"novel_id"`
	SourceURL  string `json:"source_url"`
	SourceType string `json:"source_type"`
}

// Subscribe handles POST /api/subscriptions
func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	if h.novelUpdateUseCase == nil {
		InternalServerError(w, nil, "Novel update feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	var req SubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, err, "Invalid request body")
		return
	}

	if req.NovelID == "" || req.SourceURL == "" {
		BadRequest(w, nil, "novel_id and source_url are required")
		return
	}

	subscription, err := h.novelUpdateUseCase.SubscribeToNovel(r.Context(), req.NovelID, req.SourceURL, req.SourceType, userID)
	if err != nil {
		InternalServerError(w, err, "Failed to subscribe to novel")
		return
	}

	WriteJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data:    subscription,
	})
}

// Unsubscribe handles DELETE /api/subscriptions/{id}
func (h *Handler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	if h.novelUpdateUseCase == nil {
		InternalServerError(w, nil, "Novel update feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	subscriptionID := r.URL.Query().Get("id")
	if subscriptionID == "" {
		BadRequest(w, nil, "id is required")
		return
	}

	if err := h.novelUpdateUseCase.UnsubscribeFromNovel(r.Context(), userID, subscriptionID); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w, "Subscription not found")
			return
		}
		InternalServerError(w, err, "Failed to unsubscribe from novel")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    map[string]string{"message": "Unsubscribed successfully"},
	})
}

// GetSubscriptions handles GET /api/subscriptions
func (h *Handler) GetSubscriptions(w http.ResponseWriter, r *http.Request) {
	if h.novelUpdateUseCase == nil {
		InternalServerError(w, nil, "Novel update feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	subscriptions, err := h.novelUpdateUseCase.GetUserSubscriptions(r.Context(), userID)
	if err != nil {
		InternalServerError(w, err, "Failed to get subscriptions")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    subscriptions,
	})
}

// TriggerUpdate handles POST /api/subscriptions/trigger-update. It checks
// every due subscription (all users), so the route is admin-only.
func (h *Handler) TriggerUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.novelUpdateUseCase == nil {
		InternalServerError(w, nil, "Novel update feature not available")
		return
	}

	// The request context is cancelled as soon as this handler returns, so
	// the async run gets its own bounded context.
	uc := h.novelUpdateUseCase
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), triggerUpdateTimeout)
		defer cancel()
		ok, failed := uc.RunScheduledUpdates(ctx)
		log.Printf("[INFO] manual novel update finished: %d ok, %d failed", ok, failed)
	}()

	WriteJSON(w, http.StatusAccepted, SuccessResponse{
		Success: true,
		Data:    map[string]string{"message": "Update triggered"},
	})
}

// GetUpdateHistory handles GET /api/subscriptions/history
func (h *Handler) GetUpdateHistory(w http.ResponseWriter, r *http.Request) {
	if h.novelUpdateUseCase == nil {
		InternalServerError(w, nil, "Novel update feature not available")
		return
	}

	novelID := r.URL.Query().Get("novel_id")
	if novelID == "" {
		BadRequest(w, nil, "novel_id is required")
		return
	}

	limit := 10
	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := json.Number(l).Int64(); err == nil {
			limit = int(val)
		}
	}

	history, err := h.novelUpdateUseCase.GetUpdateHistory(r.Context(), novelID, limit)
	if err != nil {
		InternalServerError(w, err, "Failed to get update history")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    history,
	})
}
