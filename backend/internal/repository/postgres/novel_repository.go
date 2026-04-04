package postgres

import (
	"context"
	"database/sql"
	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

type novelRepository struct {
	db *sqlx.DB
}

func NewNovelRepository(db *sqlx.DB) domain.NovelRepository {
	return &novelRepository{db: db}
}

func (r *novelRepository) Create(ctx context.Context, novel *domain.Novel) error {
	query := `
		INSERT INTO novels (id, title, original_title, source_url, source_language, target_language, author, description, cover_image_url, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := r.db.ExecContext(ctx, query,
		novel.ID, novel.Title, novel.OriginalTitle, novel.SourceURL,
		novel.SourceLang, novel.TargetLang, novel.Author, novel.Description,
		novel.CoverImageURL, novel.Status,
	)
	return err
}

func (r *novelRepository) GetByID(ctx context.Context, id string) (*domain.Novel, error) {
	query := `SELECT * FROM novels WHERE id = $1`
	novel := &domain.Novel{}
	err := r.db.GetContext(ctx, novel, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return novel, err
}

func (r *novelRepository) List(ctx context.Context, limit, offset int, status string) ([]*domain.Novel, int, error) {
	var query string
	var countQuery string
	var args []interface{}
	var countArgs []interface{}

	if status != "" {
		query = `SELECT * FROM novels WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		countQuery = `SELECT COUNT(*) FROM novels WHERE status = $1`
		args = []interface{}{status, limit, offset}
		countArgs = []interface{}{status}
	} else {
		query = `SELECT * FROM novels ORDER BY created_at DESC LIMIT $1 OFFSET $2`
		countQuery = `SELECT COUNT(*) FROM novels`
		args = []interface{}{limit, offset}
		countArgs = []interface{}{}
	}

	novels := make([]*domain.Novel, 0)
	err := r.db.SelectContext(ctx, &novels, query, args...)
	if err != nil {
		return nil, 0, err
	}

	var total int
	err = r.db.GetContext(ctx, &total, countQuery, countArgs...)
	if err != nil {
		return nil, 0, err
	}

	return novels, total, nil
}

func (r *novelRepository) Update(ctx context.Context, novel *domain.Novel) error {
	query := `
		UPDATE novels 
		SET title = $2, original_title = $3, source_url = $4, source_language = $5, 
		    target_language = $6, author = $7, description = $8, cover_image_url = $9, status = $10
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query,
		novel.ID, novel.Title, novel.OriginalTitle, novel.SourceURL,
		novel.SourceLang, novel.TargetLang, novel.Author, novel.Description,
		novel.CoverImageURL, novel.Status,
	)
	return err
}
