package http

import (
	"encoding/json"
	"net/http"
)

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

	var req SubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, err, "Invalid request body")
		return
	}

	if req.NovelID == "" || req.SourceURL == "" {
		BadRequest(w, nil, "novel_id and source_url are required")
		return
	}

	subscription, err := h.novelUpdateUseCase.SubscribeToNovel(r.Context(), req.NovelID, req.SourceURL, req.SourceType, nil)
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

	subscriptionID := r.URL.Query().Get("id")
	if subscriptionID == "" {
		BadRequest(w, nil, "id is required")
		return
	}

	if err := h.novelUpdateUseCase.UnsubscribeFromNovel(r.Context(), subscriptionID); err != nil {
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

	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		// Return all active subscriptions if no user_id provided
		BadRequest(w, nil, "user_id is required")
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

// TriggerUpdate handles POST /api/subscriptions/trigger-update
func (h *Handler) TriggerUpdate(w http.ResponseWriter, r *http.Request) {
	if h.novelUpdateUseCase == nil {
		InternalServerError(w, nil, "Novel update feature not available")
		return
	}

	// Trigger manual update (async)
	go func() {
		h.novelUpdateUseCase.RunScheduledUpdates(r.Context())
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
