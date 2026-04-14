package middleware

import (
	"net/http"
	"time"

	"github.com/bookreading/backend/internal/logging"
)

// RequestLogger logs incoming HTTP requests with structured logging
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Create a response writer to capture status code
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Call next handler
		next.ServeHTTP(rw, r)

		// Log the request
		logger := logging.GetLogger()
		logger.WithFields(map[string]interface{}{
			"method":      r.Method,
			"path":        r.URL.Path,
			"remote_addr": r.RemoteAddr,
			"user_agent":  r.UserAgent(),
			"duration_ms": time.Since(start).Milliseconds(),
			"status":      rw.statusCode,
		}).Info("HTTP request")
	})
}

// responseWriter wraps http.ResponseWriter to capture the status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// ErrorLogger logs errors with request context
type ErrorLogger struct {
	Logger *logging.Logger
}

// NewErrorLogger creates a new error logger middleware
func NewErrorLogger() *ErrorLogger {
	return &ErrorLogger{
		Logger: logging.GetLogger(),
	}
}

// LogError logs an error with request context
func (el *ErrorLogger) LogError(r *http.Request, err error, message string) {
	el.Logger.WithFields(map[string]interface{}{
		"method":      r.Method,
		"path":        r.URL.Path,
		"remote_addr": r.RemoteAddr,
		"error":       err.Error(),
	}).Error(message)
}
