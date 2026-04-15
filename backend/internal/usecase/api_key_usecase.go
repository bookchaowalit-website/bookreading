package usecase

import (
	"context"
	"errors"
	"fmt"

	"github.com/bookreading/backend/internal/crypto"
	"github.com/bookreading/backend/internal/domain"
)

// APIKeyUseCase handles user API key management
type APIKeyUseCase struct {
	repo domain.APIKeyRepository
}

// NewAPIKeyUseCase creates a new API key use case
func NewAPIKeyUseCase(repo domain.APIKeyRepository) *APIKeyUseCase {
	return &APIKeyUseCase{repo: repo}
}

// SaveAPIKey saves an API key for a user (encrypted)
func (uc *APIKeyUseCase) SaveAPIKey(ctx context.Context, userID, provider, apiKey string) error {
	if userID == "" {
		return errors.New("user_id is required")
	}
	if provider == "" {
		return errors.New("provider is required")
	}
	if apiKey == "" {
		return errors.New("api_key is required")
	}

	// Validate provider
	if provider != "openai" && provider != "gemini" {
		return fmt.Errorf("invalid provider: %s", provider)
	}

	// Validate key format
	if provider == "openai" && len(apiKey) < 10 {
		return errors.New("invalid OpenAI API key format")
	}
	if provider == "gemini" && len(apiKey) < 10 {
		return errors.New("invalid Gemini API key format")
	}

	// Store key prefix for display (first 8 chars)
	keyPrefix := apiKey
	if len(apiKey) > 8 {
		keyPrefix = apiKey[:8]
	}

	// Encrypt the API key before storing
	encryptedKey, err := crypto.Encrypt(apiKey)
	if err != nil {
		// Log warning but continue with plaintext (development mode)
		fmt.Printf("[WARN] API key encryption not available: %v\n", err)
		encryptedKey = apiKey
	}

	key := &domain.UserAPIKey{
		UserID:       userID,
		Provider:     provider,
		KeyPrefix:    keyPrefix,
		EncryptedKey: encryptedKey,
	}

	return uc.repo.Upsert(ctx, key)
}

// GetAPIKeyPrefixes returns the key prefixes (not actual keys) for display
func (uc *APIKeyUseCase) GetAPIKeyPrefixes(ctx context.Context, userID string) ([]domain.UserAPIKey, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}

	return uc.repo.GetByUserID(ctx, userID)
}

// GetAPIKey retrieves the actual API key (for server-side use only)
func (uc *APIKeyUseCase) GetAPIKey(ctx context.Context, userID, provider string) (string, error) {
	if userID == "" || provider == "" {
		return "", errors.New("user_id and provider are required")
	}

	key, err := uc.repo.GetByKeyPrefix(ctx, userID, provider)
	if err != nil {
		return "", fmt.Errorf("failed to get API key: %w", err)
	}
	if key == nil {
		return "", nil // No key stored
	}

	// Decrypt the API key
	decryptedKey, err := crypto.Decrypt(key.EncryptedKey)
	if err != nil {
		// Log warning but return as-is (probably plaintext key)
		fmt.Printf("[WARN] API key decryption failed: %v\n", err)
		return key.EncryptedKey, nil
	}

	return decryptedKey, nil
}

// DeleteAPIKey removes an API key
func (uc *APIKeyUseCase) DeleteAPIKey(ctx context.Context, userID, provider string) error {
	return uc.repo.Delete(ctx, userID, provider)
}
