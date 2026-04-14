package http

import (
	"encoding/json"
	"log"
	"net/http"
)

// ErrorResponse represents a standardized error response
type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// SuccessResponse represents a standardized success response
type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
}

// WriteJSON writes a JSON response with the given status code
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Failed to write JSON response: %v", err)
	}
}

// HandleError handles errors in HTTP handlers with proper logging and response
func HandleError(w http.ResponseWriter, err error, message string, statusCode int) {
	log.Printf("%s: %v", message, err)
	WriteJSON(w, statusCode, ErrorResponse{
		Success: false,
		Error:   message,
		Message: err.Error(),
	})
}

// InternalServerError handles internal server errors
func InternalServerError(w http.ResponseWriter, err error, message string) {
	log.Printf("Internal server error - %s: %v", message, err)
	WriteJSON(w, http.StatusInternalServerError, ErrorResponse{
		Success: false,
		Error:   "Internal Server Error",
		Message: "An unexpected error occurred. Please try again later.",
	})
}

// BadRequest handles bad request errors
func BadRequest(w http.ResponseWriter, err error, message string) {
	log.Printf("Bad request - %s: %v", message, err)
	WriteJSON(w, http.StatusBadRequest, ErrorResponse{
		Success: false,
		Error:   "Bad Request",
		Message: message,
	})
}

// Unauthorized handles unauthorized errors
func Unauthorized(w http.ResponseWriter, message string) {
	WriteJSON(w, http.StatusUnauthorized, ErrorResponse{
		Success: false,
		Error:   "Unauthorized",
		Message: message,
	})
}

// NotFound handles not found errors
func NotFound(w http.ResponseWriter, message string) {
	WriteJSON(w, http.StatusNotFound, ErrorResponse{
		Success: false,
		Error:   "Not Found",
		Message: message,
	})
}

// ServerError handles generic server errors (for use in middleware, etc.)
func ServerError(w http.ResponseWriter, message string) {
	WriteJSON(w, http.StatusInternalServerError, ErrorResponse{
		Success: false,
		Error:   "Internal Server Error",
		Message: message,
	})
}
