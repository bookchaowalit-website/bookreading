package postgres

import (
	"context"
	"database/sql"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

type readingProgressRepository struct {
	db *sqlx.DB
}

// NewReadingProgressRepository creates a new reading progress repository
func NewReadingProgressRepository(db *sqlx.DB) domain.ReadingProgressRepository {
	return &readingProgressRepository{db: db}
}

func (r *readingProgressRepository) Create(ctx context.Context, progress *domain.ReadingProgress) error {
	query := `
		INSERT INTO reading_progress (user_id, novel_id, chapter_number, progress_percentage, last_read_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`
	now := time.Now()
	progress.LastReadAt = now
	return r.db.QueryRowContext(ctx, query,
		progress.UserID, progress.NovelID, progress.ChapterNumber,
		progress.ProgressPercentage, now,
	).Scan(&progress.ID, &progress.CreatedAt)
}

func (r *readingProgressRepository) GetByUserID(ctx context.Context, userID string) ([]domain.ReadingProgress, error) {
	var progresses []domain.ReadingProgress
	query := `SELECT id, user_id, novel_id, chapter_number, progress_percentage, last_read_at, created_at
	          FROM reading_progress 
	          WHERE user_id = $1 
	          ORDER BY last_read_at DESC`
	err := r.db.SelectContext(ctx, &progresses, query, userID)
	return progresses, err
}

func (r *readingProgressRepository) GetByNovelID(ctx context.Context, userID, novelID string) (*domain.ReadingProgress, error) {
	var progress domain.ReadingProgress
	query := `SELECT id, user_id, novel_id, chapter_number, progress_percentage, last_read_at, created_at
	          FROM reading_progress 
	          WHERE user_id = $1 AND novel_id = $2`
	err := r.db.GetContext(ctx, &progress, query, userID, novelID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &progress, err
}

func (r *readingProgressRepository) Update(ctx context.Context, progress *domain.ReadingProgress) error {
	query := `UPDATE reading_progress 
	          SET chapter_number = $3, progress_percentage = $4, last_read_at = $5 
	          WHERE id = $1 AND user_id = $2`
	_, err := r.db.ExecContext(ctx, query,
		progress.ID, progress.UserID, progress.ChapterNumber,
		progress.ProgressPercentage, time.Now(),
	)
	return err
}

func (r *readingProgressRepository) Upsert(ctx context.Context, progress *domain.ReadingProgress) error {
	now := time.Now()
	query := `
		INSERT INTO reading_progress (user_id, novel_id, chapter_number, progress_percentage, last_read_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, novel_id) 
		DO UPDATE SET 
			chapter_number = EXCLUDED.chapter_number,
			progress_percentage = EXCLUDED.progress_percentage,
			last_read_at = EXCLUDED.last_read_at
		RETURNING id, created_at
	`
	progress.LastReadAt = now
	return r.db.QueryRowContext(ctx, query,
		progress.UserID, progress.NovelID, progress.ChapterNumber,
		progress.ProgressPercentage, now,
	).Scan(&progress.ID, &progress.CreatedAt)
}

func (r *readingProgressRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM reading_progress WHERE id = $1", id)
	return err
}
