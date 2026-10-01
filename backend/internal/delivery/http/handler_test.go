package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthCheck(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	// Create a minimal server for testing
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"healthy"}`))
	})

	mux.ServeHTTP(w, req)

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got '%s'", body["status"])
	}
}

func TestCORSConfiguration(t *testing.T) {
	tests := []struct {
		name           string
		allowedOrigins string
		requestOrigin  string
		expectedOrigin string
		shouldAllow    bool
	}{
		{
			name:           "allow specific origin",
			allowedOrigins: "http://localhost:3000",
			requestOrigin:  "http://localhost:3000",
			expectedOrigin: "http://localhost:3000",
			shouldAllow:    true,
		},
		{
			name:           "reject unauthorized origin",
			allowedOrigins: "http://localhost:3000",
			requestOrigin:  "http://evil.com",
			expectedOrigin: "",
			shouldAllow:    false,
		},
		{
			name:           "allow multiple origins",
			allowedOrigins: "http://localhost:3000,http://example.com",
			requestOrigin:  "http://example.com",
			expectedOrigin: "http://example.com",
			shouldAllow:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set environment variable
			t.Setenv("ALLOWED_ORIGINS", tt.allowedOrigins)

			mux := http.NewServeMux()
			mux.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			handler := corsMiddleware(mux)

			req := httptest.NewRequest(http.MethodOptions, "/test", nil)
			req.Header.Set("Origin", tt.requestOrigin)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			resp := w.Result()
			origin := resp.Header.Get("Access-Control-Allow-Origin")

			if tt.shouldAllow {
				if origin != tt.expectedOrigin {
					t.Errorf("expected origin '%s', got '%s'", tt.expectedOrigin, origin)
				}
			} else {
				if origin != "" && origin != "*" {
					t.Errorf("expected empty or * origin, got '%s'", origin)
				}
			}
		})
	}
}

func TestErrorResponse(t *testing.T) {
	w := httptest.NewRecorder()
	WriteJSON(w, http.StatusBadRequest, ErrorResponse{
		Success: false,
		Error:   "test error",
	})

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}

	var body ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body.Error != "test error" {
		t.Errorf("expected error message 'test error', got '%s'", body.Error)
	}
}

func TestSuccessResponse(t *testing.T) {
	w := httptest.NewRecorder()
	testData := map[string]string{"key": "value"}
	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    testData,
	})

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body["success"] != true {
		t.Errorf("expected success to be true")
	}

	data, ok := body["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected data to be map")
	}

	if data["key"] != "value" {
		t.Errorf("expected data.key to be 'value', got '%v'", data["key"])
	}
}

func TestAuthMiddleware(t *testing.T) {
	h := &Handler{
		userUsecase: nil, // Will be mocked in real tests
	}

	tests := []struct {
		name           string
		authHeader     string
		expectedStatus int
	}{
		{
			name:           "missing authorization header",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "invalid format",
			authHeader:     "Token invalid",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "valid format but invalid token",
			authHeader:     "Bearer invalid-token",
			expectedStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := h.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, w.Code)
			}
		})
	}
}
