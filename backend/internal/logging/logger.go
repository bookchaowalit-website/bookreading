package logging

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"
)

// LogLevel represents the severity of a log message
type LogLevel string

const (
	DEBUG LogLevel = "DEBUG"
	INFO  LogLevel = "INFO"
	WARN  LogLevel = "WARN"
	ERROR LogLevel = "ERROR"
	FATAL LogLevel = "FATAL"
)

// Logger is a structured logger
type Logger struct {
	level  LogLevel
	fields map[string]interface{}
}

// NewLogger creates a new structured logger
func NewLogger(level LogLevel) *Logger {
	return &Logger{
		level:  level,
		fields: make(map[string]interface{}),
	}
}

// WithFields returns a new Logger with additional fields
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	newFields := make(map[string]interface{})
	for k, v := range l.fields {
		newFields[k] = v
	}
	for k, v := range fields {
		newFields[k] = v
	}
	return &Logger{
		level:  l.level,
		fields: newFields,
	}
}

// WithField returns a new Logger with a single additional field
func (l *Logger) WithField(key string, value interface{}) *Logger {
	return l.WithFields(map[string]interface{}{key: value})
}

// shouldLog checks if the given level should be logged
func (l *Logger) shouldLog(level LogLevel) bool {
	levels := map[LogLevel]int{
		DEBUG: 0,
		INFO:  1,
		WARN:  2,
		ERROR: 3,
		FATAL: 4,
	}
	return levels[level] >= levels[l.level]
}

// log writes a structured log entry
func (l *Logger) log(level LogLevel, message string, fields map[string]interface{}) {
	if !l.shouldLog(level) {
		return
	}

	entry := make(map[string]interface{})
	entry["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	entry["level"] = string(level)
	entry["message"] = message

	// Add logger fields
	for k, v := range l.fields {
		entry[k] = v
	}

	// Add message-specific fields
	for k, v := range fields {
		entry[k] = v
	}

	// Add request ID if present in context (from middleware)
	// This will be populated by request context in HTTP handlers

	jsonBytes, err := json.Marshal(entry)
	if err != nil {
		log.Printf("Failed to marshal log entry: %v", err)
		return
	}

	switch level {
	case ERROR, FATAL:
		fmt.Fprintln(os.Stderr, string(jsonBytes))
	default:
		fmt.Fprintln(os.Stdout, string(jsonBytes))
	}

	if level == FATAL {
		os.Exit(1)
	}
}

// Debug logs a debug message
func (l *Logger) Debug(message string) {
	l.log(DEBUG, message, nil)
}

// Debugf logs a formatted debug message
func (l *Logger) Debugf(format string, args ...interface{}) {
	l.log(DEBUG, fmt.Sprintf(format, args...), nil)
}

// Info logs an info message
func (l *Logger) Info(message string) {
	l.log(INFO, message, nil)
}

// Infof logs a formatted info message
func (l *Logger) Infof(format string, args ...interface{}) {
	l.log(INFO, fmt.Sprintf(format, args...), nil)
}

// Warn logs a warning message
func (l *Logger) Warn(message string) {
	l.log(WARN, message, nil)
}

// Warnf logs a formatted warning message
func (l *Logger) Warnf(format string, args ...interface{}) {
	l.log(WARN, fmt.Sprintf(format, args...), nil)
}

// Error logs an error message
func (l *Logger) Error(message string) {
	l.log(ERROR, message, nil)
}

// Errorf logs a formatted error message
func (l *Logger) Errorf(format string, args ...interface{}) {
	l.log(ERROR, fmt.Sprintf(format, args...), nil)
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(message string) {
	l.log(FATAL, message, nil)
}

// Fatalf logs a formatted fatal message and exits
func (l *Logger) Fatalf(format string, args ...interface{}) {
	l.log(FATAL, fmt.Sprintf(format, args...), nil)
}

// Global logger
var defaultLogger = NewLogger(INFO)

// GetLogger returns the global logger
func GetLogger() *Logger {
	return defaultLogger
}

// SetLogLevel sets the global logger level
func SetLogLevel(level LogLevel) {
	defaultLogger.level = level
}

// InitLogger initializes the global logger from environment
func InitLogger() {
	level := os.Getenv("LOG_LEVEL")
	switch level {
	case "DEBUG":
		defaultLogger.level = DEBUG
	case "WARN":
		defaultLogger.level = WARN
	case "ERROR":
		defaultLogger.level = ERROR
	default:
		defaultLogger.level = INFO
	}
}
