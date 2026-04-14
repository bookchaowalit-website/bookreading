package postgres

import (
	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

type novelUpdateHistoryRepository struct {
	db *sqlx.DB
}

// NewNovelUpdateHistoryRepository creates a new novel update history repository
func NewNovelUpdateHistoryRepository(db *sqlx.DB) domain.NovelUpdateHistoryRepository {
	return &novelUpdateHistoryRepository{db: db}
}

func (r *novelUpdateHistoryRepository) Create(history *domain.NovelUpdateHistory) error {
	query := `
		INSERT INTO novel_update_history (novel_id, chapters_added, chapters_updated, status, error_message, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, checked_at
	`
	return r.db.QueryRow(
		query,
		history.NovelID,
		history.ChaptersAdded,
		history.ChaptersUpdated,
		history.Status,
		history.ErrorMessage,
		history.CompletedAt,
	).Scan(&history.ID, &history.CheckedAt)
}

func (r *novelUpdateHistoryRepository) GetByNovelID(novelID string, limit int) ([]domain.NovelUpdateHistory, error) {
	var histories []domain.NovelUpdateHistory
	query := `SELECT id, novel_id, chapters_added, chapters_updated, status, error_message, checked_at, completed_at
	          FROM novel_update_history 
	          WHERE novel_id = $1 
	          ORDER BY checked_at DESC 
	          LIMIT $2`
	err := r.db.Select(&histories, query, novelID, limit)
	return histories, err
}

func (r *novelUpdateHistoryRepository) GetRecent(limit int) ([]domain.NovelUpdateHistory, error) {
	var histories []domain.NovelUpdateHistory
	query := `SELECT id, novel_id, chapters_added, chapters_updated, status, error_message, checked_at, completed_at
	          FROM novel_update_history 
	          ORDER BY checked_at DESC 
	          LIMIT $1`
	err := r.db.Select(&histories, query, limit)
	return histories, err
}
