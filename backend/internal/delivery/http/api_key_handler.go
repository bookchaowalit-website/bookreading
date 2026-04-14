package http

import (
	"encoding/json"
	"net/http"
)

// SaveAPIKey handles POST /api/settings/api-keys
func (h *Handler) SaveAPIKey(w http.ResponseWriter, r *http.Request) {
	if h.apiKeyUseCase == nil {
		InternalServerError(w, nil, "API key management not available")
		return
	}

	var req struct {
		Provider string `json:"provider"`
		APIKey   string `json:"api_key"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, err, "Invalid request body")
		return
	}

	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		Unauthorized(w, "Authentication required")
		return
	}

	if err := h.apiKeyUseCase.SaveAPIKey(r.Context(), userID, req.Provider, req.APIKey); err != nil {
		BadRequest(w, err, "Failed to save API key")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    map[string]string{"message": "API key saved successfully"},
	})
}

// GetAPIKeyPrefixes handles GET /api/settings/api-keys
func (h *Handler) GetAPIKeyPrefixes(w http.ResponseWriter, r *http.Request) {
	if h.apiKeyUseCase == nil {
		InternalServerError(w, nil, "API key management not available")
		return
	}

	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		Unauthorized(w, "Authentication required")
		return
	}

	keys, err := h.apiKeyUseCase.GetAPIKeyPrefixes(r.Context(), userID)
	if err != nil {
		InternalServerError(w, err, "Failed to get API keys")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    keys,
	})
}

// DeleteAPIKey handles DELETE /api/settings/api-keys
func (h *Handler) DeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	if h.apiKeyUseCase == nil {
		InternalServerError(w, nil, "API key management not available")
		return
	}

	provider := r.URL.Query().Get("provider")
	if provider == "" {
		BadRequest(w, nil, "provider is required")
		return
	}

	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		Unauthorized(w, "Authentication required")
		return
	}

	if err := h.apiKeyUseCase.DeleteAPIKey(r.Context(), userID, provider); err != nil {
		InternalServerError(w, err, "Failed to delete API key")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    map[string]string{"message": "API key deleted successfully"},
	})
}
