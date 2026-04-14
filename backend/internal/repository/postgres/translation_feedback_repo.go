package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type translationFeedbackRepository struct {
	db *sqlx.DB
}

// NewTranslationFeedbackRepository creates a new translation feedback repository
func NewTranslationFeedbackRepository(db *sqlx.DB) domain.TranslationFeedbackRepository {
	return &translationFeedbackRepository{db: db}
}

func (r *translationFeedbackRepository) Create(ctx context.Context, feedback *domain.TranslationFeedback) error {
	query := `
		INSERT INTO translation_feedback (id, user_id, novel_id, chapter_number, rating, comment, has_errors, error_details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (user_id, novel_id, chapter_number)
		DO UPDATE SET
			rating = EXCLUDED.rating,
			comment = EXCLUDED.comment,
			has_errors = EXCLUDED.has_errors,
			error_details = EXCLUDED.error_details,
			created_at = EXCLUDED.created_at
		RETURNING id, created_at
	`
	if feedback.ID == "" {
		feedback.ID = uuid.New().String()
	}
	now := time.Now()
	return r.db.QueryRowContext(ctx, query,
		feedback.ID, feedback.UserID, feedback.NovelID,
		feedback.ChapterNumber, feedback.Rating, feedback.Comment,
		feedback.HasErrors, feedback.ErrorDetails, now,
	).Scan(&feedback.ID, &feedback.CreatedAt)
}

func (r *translationFeedbackRepository) GetByChapter(ctx context.Context, novelID string, chapterNumber int) ([]domain.TranslationFeedback, error) {
	var feedbacks []domain.TranslationFeedback
	query := `SELECT id, user_id, novel_id, chapter_number, rating, comment, has_errors, 
	             error_details, created_at
	          FROM translation_feedback 
	          WHERE novel_id = $1 AND chapter_number = $2 
	          ORDER BY created_at DESC`
	err := r.db.SelectContext(ctx, &feedbacks, query, novelID, chapterNumber)
	return feedbacks, err
}

func (r *translationFeedbackRepository) GetByUserID(ctx context.Context, userID string) ([]domain.TranslationFeedback, error) {
	var feedbacks []domain.TranslationFeedback
	query := `SELECT id, user_id, novel_id, chapter_number, rating, comment, has_errors, 
	             error_details, created_at
	          FROM translation_feedback 
	          WHERE user_id = $1 
	          ORDER BY created_at DESC`
	err := r.db.SelectContext(ctx, &feedbacks, query, userID)
	return feedbacks, err
}

func (r *translationFeedbackRepository) GetQualityScore(ctx context.Context, novelID string, chapterNumber int) (*domain.ChapterQualityScore, error) {
	var score domain.ChapterQualityScore
	query := `SELECT 
	             novel_id,
	             chapter_number,
	             COALESCE(AVG(rating), 0) as avg_rating,
	             COUNT(*) as feedback_count
	          FROM translation_feedback 
	          WHERE novel_id = $1 AND chapter_number = $2
	          GROUP BY novel_id, chapter_number`

	var avgRating sql.NullFloat64
	var count int
	err := r.db.QueryRowContext(ctx, query, novelID, chapterNumber).Scan(
		&score.NovelID, &score.ChapterNumber, &avgRating, &count,
	)
	if err != nil {
		return nil, err
	}

	if avgRating.Valid {
		score.AvgRating = avgRating.Float64
	}
	score.FeedbackCount = count

	return &score, nil
}

// errorDetailsJSON is a helper type for marshaling error details
type errorDetailsJSON []struct {
	Type          string `json:"type"`
	Description   string `json:"description"`
	OriginalText  string `json:"original_text,omitempty"`
	CorrectedText string `json:"corrected_text,omitempty"`
}

// MarshalErrorDetails converts error details to JSON string
func MarshalErrorDetails(details interface{}) (string, error) {
	bytes, err := json.Marshal(details)
	return string(bytes), err
}

// UnmarshalErrorDetails converts JSON string to error details
func UnmarshalErrorDetails(jsonStr string) (interface{}, error) {
	var details errorDetailsJSON
	err := json.Unmarshal([]byte(jsonStr), &details)
	return details, err
}
