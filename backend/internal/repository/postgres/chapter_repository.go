package postgres

import (
	"context"
	"database/sql"
	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

type chapterRepository struct {
	db *sqlx.DB
}

func NewChapterRepository(db *sqlx.DB) domain.ChapterRepository {
	return &chapterRepository{db: db}
}

func (r *chapterRepository) Create(ctx context.Context, chapter *domain.Chapter) error {
	query := `
		INSERT INTO chapters (id, novel_id, chapter_number, title, original_title, source_url, content, original_content, word_count, is_translated, is_scraped)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err := r.db.ExecContext(ctx, query,
		chapter.ID, chapter.NovelID, chapter.ChapterNumber, chapter.Title,
		chapter.OriginalTitle, chapter.SourceURL, chapter.Content,
		chapter.OriginalContent, chapter.WordCount, chapter.IsTranslated, chapter.IsScraped,
	)
	return err
}

func (r *chapterRepository) GetByID(ctx context.Context, id string) (*domain.Chapter, error) {
	query := `SELECT * FROM chapters WHERE id = $1`
	chapter := &domain.Chapter{}
	err := r.db.GetContext(ctx, chapter, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return chapter, err
}

func (r *chapterRepository) ListByNovelID(ctx context.Context, novelID string, limit, offset int) ([]*domain.Chapter, int, error) {
	query := `SELECT * FROM chapters WHERE novel_id = $1 ORDER BY chapter_number ASC LIMIT $2 OFFSET $3`
	countQuery := `SELECT COUNT(*) FROM chapters WHERE novel_id = $1`

	chapters := make([]*domain.Chapter, 0)
	err := r.db.SelectContext(ctx, &chapters, query, novelID, limit, offset)
	if err != nil {
		return nil, 0, err
	}

	var total int
	err = r.db.GetContext(ctx, &total, countQuery, novelID)
	if err != nil {
		return nil, 0, err
	}

	return chapters, total, nil
}

func (r *chapterRepository) Update(ctx context.Context, chapter *domain.Chapter) error {
	query := `
		UPDATE chapters 
		SET title = $2, original_title = $3, source_url = $4, content = $5, 
		    original_content = $6, word_count = $7, is_translated = $8, is_scraped = $9
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query,
		chapter.ID, chapter.Title, chapter.OriginalTitle, chapter.SourceURL,
		chapter.Content, chapter.OriginalContent, chapter.WordCount,
		chapter.IsTranslated, chapter.IsScraped,
	)
	return err
}

func (r *chapterRepository) GetByNovelIDAndNumber(ctx context.Context, novelID string, chapterNumber int) (*domain.Chapter, error) {
	query := `SELECT * FROM chapters WHERE novel_id = $1 AND chapter_number = $2`
	chapter := &domain.Chapter{}
	err := r.db.GetContext(ctx, chapter, query, novelID, chapterNumber)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return chapter, err
}
