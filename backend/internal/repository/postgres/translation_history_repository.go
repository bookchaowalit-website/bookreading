package postgres

import (
	"context"
	"database/sql"

	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

type translationHistoryRepository struct {
	db *sqlx.DB
}

func NewTranslationHistoryRepository(db *sqlx.DB) domain.TranslationHistoryRepository {
	return &translationHistoryRepository{db: db}
}

func (r *translationHistoryRepository) Create(ctx context.Context, history *domain.TranslationHistory) error {
	query := `
		INSERT INTO translation_history (id, chapter_id, source_text, translated_text, source_language, target_language, model_used, tokens_used)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.db.ExecContext(ctx, query,
		history.ID, history.ChapterID, history.SourceText, history.TranslatedText,
		history.SourceLang, history.TargetLang, history.ModelUsed, history.TokensUsed,
	)
	return err
}

func (r *translationHistoryRepository) GetByChapterID(ctx context.Context, chapterID string) ([]*domain.TranslationHistory, error) {
	query := `SELECT * FROM translation_history WHERE chapter_id = $1 ORDER BY created_at DESC`
	histories := make([]*domain.TranslationHistory, 0)
	err := r.db.SelectContext(ctx, &histories, query, chapterID)
	return histories, err
}

func (r *translationHistoryRepository) GetLatestByChapterID(ctx context.Context, chapterID string) (*domain.TranslationHistory, error) {
	query := `SELECT * FROM translation_history WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 1`
	history := &domain.TranslationHistory{}
	err := r.db.GetContext(ctx, history, query, chapterID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return history, err
}

func (r *translationHistoryRepository) GetCachedTranslation(ctx context.Context, chapterID string, sourceHash string) (*domain.TranslationHistory, error) {
	// For now, just get the latest translation for the chapter
	// In future, we could add source_hash column for more precise caching
	query := `SELECT * FROM translation_history WHERE chapter_id = $1 ORDER BY created_at DESC LIMIT 1`
	history := &domain.TranslationHistory{}
	err := r.db.GetContext(ctx, history, query, chapterID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return history, err
}

func (r *translationHistoryRepository) ListByNovelID(ctx context.Context, novelID string, limit, offset int) ([]*domain.TranslationHistory, int, error) {
	// Get translation history for all chapters in a novel
	query := `
		SELECT th.* FROM translation_history th
		JOIN chapters c ON th.chapter_id = c.id
		WHERE c.novel_id = $1
		ORDER BY th.created_at DESC
		LIMIT $2 OFFSET $3
	`
	countQuery := `
		SELECT COUNT(*) FROM translation_history th
		JOIN chapters c ON th.chapter_id = c.id
		WHERE c.novel_id = $1
	`

	histories := make([]*domain.TranslationHistory, 0)
	err := r.db.SelectContext(ctx, &histories, query, novelID, limit, offset)
	if err != nil {
		return nil, 0, err
	}

	var total int
	err = r.db.GetContext(ctx, &total, countQuery, novelID)
	if err != nil {
		return nil, 0, err
	}

	return histories, total, nil
}
