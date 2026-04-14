package postgres

import (
	"database/sql"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

type novelSubscriptionRepository struct {
	db *sqlx.DB
}

// NewNovelSubscriptionRepository creates a new novel subscription repository
func NewNovelSubscriptionRepository(db *sqlx.DB) domain.NovelSubscriptionRepository {
	return &novelSubscriptionRepository{db: db}
}

func (r *novelSubscriptionRepository) Create(subscription *domain.NovelSubscription) error {
	query := `
		INSERT INTO novel_subscriptions (novel_id, user_id, source_url, source_type, last_chapter_count, check_interval_hours)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`
	return r.db.QueryRow(
		query,
		subscription.NovelID,
		subscription.UserID,
		subscription.SourceURL,
		subscription.SourceType,
		subscription.LastChapterCount,
		subscription.CheckIntervalHrs,
	).Scan(&subscription.ID, &subscription.CreatedAt)
}

func (r *novelSubscriptionRepository) GetByID(id string) (*domain.NovelSubscription, error) {
	var sub domain.NovelSubscription
	query := `SELECT id, novel_id, user_id, source_url, source_type, last_chapter_count, 
	             last_checked_at, last_updated_at, check_interval_hours, is_active, created_at 
	          FROM novel_subscriptions WHERE id = $1`
	err := r.db.Get(&sub, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &sub, err
}

func (r *novelSubscriptionRepository) GetByNovelID(novelID string) (*domain.NovelSubscription, error) {
	var sub domain.NovelSubscription
	query := `SELECT id, novel_id, user_id, source_url, source_type, last_chapter_count, 
	             last_checked_at, last_updated_at, check_interval_hours, is_active, created_at 
	          FROM novel_subscriptions WHERE novel_id = $1 AND is_active = true`
	err := r.db.Get(&sub, query, novelID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &sub, err
}

func (r *novelSubscriptionRepository) GetByUserID(userID string) ([]domain.NovelSubscription, error) {
	var subs []domain.NovelSubscription
	query := `SELECT id, novel_id, user_id, source_url, source_type, last_chapter_count, 
	             last_checked_at, last_updated_at, check_interval_hours, is_active, created_at 
	          FROM novel_subscriptions 
	          WHERE user_id = $1 
	          ORDER BY last_updated_at DESC NULLS FIRST, created_at DESC`
	err := r.db.Select(&subs, query, userID)
	return subs, err
}

func (r *novelSubscriptionRepository) GetDueForUpdate() ([]domain.NovelSubscription, error) {
	var subs []domain.NovelSubscription
	query := `SELECT id, novel_id, user_id, source_url, source_type, last_chapter_count, 
	             last_checked_at, last_updated_at, check_interval_hours, is_active, created_at 
	          FROM novel_subscriptions 
	          WHERE is_active = true 
	            AND (last_checked_at IS NULL 
	                 OR last_checked_at < NOW() - (check_interval_hours || ' hours')::interval)
	          ORDER BY last_checked_at ASC NULLS FIRST
	          LIMIT 50`
	err := r.db.Select(&subs, query)
	return subs, err
}

func (r *novelSubscriptionRepository) Update(subscription *domain.NovelSubscription) error {
	query := `UPDATE novel_subscriptions 
	          SET source_url = $2, source_type = $3, last_chapter_count = $4, 
	              check_interval_hours = $5, is_active = $6
	          WHERE id = $1`
	_, err := r.db.Exec(
		query,
		subscription.ID,
		subscription.SourceURL,
		subscription.SourceType,
		subscription.LastChapterCount,
		subscription.CheckIntervalHrs,
		subscription.IsActive,
	)
	return err
}

func (r *novelSubscriptionRepository) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM novel_subscriptions WHERE id = $1", id)
	return err
}

func (r *novelSubscriptionRepository) UpdateLastChecked(id string, chapterCount int) error {
	now := time.Now()
	query := `UPDATE novel_subscriptions 
	          SET last_chapter_count = $2, last_checked_at = $3, last_updated_at = $3 
	          WHERE id = $1`
	_, err := r.db.Exec(query, id, chapterCount, now)
	return err
}
