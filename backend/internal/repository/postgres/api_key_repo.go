package postgres

import (
	"context"
	"database/sql"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type apiKeyRepository struct {
	db *sqlx.DB
}

// NewAPIKeyRepository creates a new API key repository
func NewAPIKeyRepository(db *sqlx.DB) domain.APIKeyRepository {
	return &apiKeyRepository{db: db}
}

func (r *apiKeyRepository) Upsert(ctx context.Context, key *domain.UserAPIKey) error {
	now := time.Now()
	query := `
		INSERT INTO user_api_keys (id, user_id, provider, key_prefix, encrypted_key, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id, provider)
		DO UPDATE SET
			key_prefix = EXCLUDED.key_prefix,
			encrypted_key = EXCLUDED.encrypted_key,
			updated_at = EXCLUDED.updated_at
	`
	if key.ID == "" {
		key.ID = uuid.New().String()
	}
	_, err := r.db.ExecContext(ctx, query,
		key.ID, key.UserID, key.Provider,
		key.KeyPrefix, key.EncryptedKey, now, now,
	)
	return err
}

func (r *apiKeyRepository) GetByUserID(ctx context.Context, userID string) ([]domain.UserAPIKey, error) {
	var keys []domain.UserAPIKey
	query := `SELECT id, user_id, provider, key_prefix, created_at, updated_at
	          FROM user_api_keys WHERE user_id = $1`
	err := r.db.SelectContext(ctx, &keys, query, userID)
	return keys, err
}

func (r *apiKeyRepository) GetByKeyPrefix(ctx context.Context, userID, provider string) (*domain.UserAPIKey, error) {
	var key domain.UserAPIKey
	query := `SELECT id, user_id, provider, key_prefix, encrypted_key, created_at, updated_at
	          FROM user_api_keys WHERE user_id = $1 AND provider = $2`
	err := r.db.GetContext(ctx, &key, query, userID, provider)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &key, err
}

func (r *apiKeyRepository) Delete(ctx context.Context, userID, provider string) error {
	_, err := r.db.ExecContext(ctx,
		"DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2",
		userID, provider,
	)
	return err
}
