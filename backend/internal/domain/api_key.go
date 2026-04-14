package domain

import (
	"context"
	"time"
)

// UserAPIKey stores user's LLM API keys securely
type UserAPIKey struct {
	ID           string    `db:"id" json:"id"`
	UserID       string    `db:"user_id" json:"-"`
	Provider     string    `db:"provider" json:"provider"` // openai, gemini
	KeyPrefix    string    `db:"key_prefix" json:"key_prefix"` // First 8 chars for display
	EncryptedKey string    `db:"encrypted_key" json:"-"` // Never expose actual keys
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at" json:"updated_at"`
}

// APIKeyRepository defines the interface for API key operations
type APIKeyRepository interface {
	Upsert(ctx context.Context, key *UserAPIKey) error
	GetByUserID(ctx context.Context, userID string) ([]UserAPIKey, error)
	GetByKeyPrefix(ctx context.Context, userID, provider string) (*UserAPIKey, error)
	Delete(ctx context.Context, userID, provider string) error
}
