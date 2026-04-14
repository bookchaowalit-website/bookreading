package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/bookreading/backend/internal/domain"
)

// TranslationFeedbackUseCase handles translation feedback operations
type TranslationFeedbackUseCase struct {
	repo domain.TranslationFeedbackRepository
}

// NewTranslationFeedbackUseCase creates a new translation feedback use case
func NewTranslationFeedbackUseCase(repo domain.TranslationFeedbackRepository) *TranslationFeedbackUseCase {
	return &TranslationFeedbackUseCase{repo: repo}
}

// ErrorDetail represents a single error detail entry
type ErrorDetail struct {
	Type        string `json:"type"`
	Description string `json:"description"`
	OriginalText string `json:"original_text,omitempty"`
	CorrectedText string `json:"corrected_text,omitempty"`
}

// SubmitFeedbackRequest represents the request for submitting feedback
type SubmitFeedbackRequest struct {
	NovelID      string       `json:"novel_id"`
	ChapterNumber int         `json:"chapter_number"`
	Rating       int          `json:"rating"`
	Comment      *string      `json:"comment"`
	HasErrors    bool         `json:"has_errors"`
	ErrorDetails []ErrorDetail `json:"error_details"`
}

// SubmitFeedback submits translation feedback
func (uc *TranslationFeedbackUseCase) SubmitFeedback(ctx context.Context, userID string, req SubmitFeedbackRequest) (*domain.TranslationFeedback, error) {
	if req.NovelID == "" {
		return nil, errors.New("novel_id is required")
	}
	if req.ChapterNumber < 0 {
		return nil, errors.New("chapter_number must be non-negative")
	}
	if req.Rating < 1 || req.Rating > 5 {
		return nil, errors.New("rating must be between 1 and 5")
	}

	// Marshal error details to JSON
	var errorDetailsJSON *string
	if len(req.ErrorDetails) > 0 {
		bytes, err := json.Marshal(req.ErrorDetails)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal error details: %w", err)
		}
		str := string(bytes)
		errorDetailsJSON = &str
	}

	feedback := &domain.TranslationFeedback{
		UserID:        &userID,
		NovelID:       req.NovelID,
		ChapterNumber: req.ChapterNumber,
		Rating:        req.Rating,
		Comment:       req.Comment,
		HasErrors:     req.HasErrors,
		ErrorDetails:  errorDetailsJSON,
	}

	if err := uc.repo.Create(ctx, feedback); err != nil {
		return nil, fmt.Errorf("failed to submit feedback: %w", err)
	}

	return feedback, nil
}

// GetChapterFeedback returns all feedback for a specific chapter
func (uc *TranslationFeedbackUseCase) GetChapterFeedback(ctx context.Context, novelID string, chapterNumber int) ([]domain.TranslationFeedback, error) {
	if novelID == "" {
		return nil, errors.New("novel_id is required")
	}
	if chapterNumber < 0 {
		return nil, errors.New("chapter_number must be non-negative")
	}

	return uc.repo.GetByChapter(ctx, novelID, chapterNumber)
}

// GetQualityScore returns the quality score for a specific chapter
func (uc *TranslationFeedbackUseCase) GetQualityScore(ctx context.Context, novelID string, chapterNumber int) (*domain.ChapterQualityScore, error) {
	if novelID == "" {
		return nil, errors.New("novel_id is required")
	}
	if chapterNumber < 0 {
		return nil, errors.New("chapter_number must be non-negative")
	}

	score, err := uc.repo.GetQualityScore(ctx, novelID, chapterNumber)
	if err != nil {
		return nil, fmt.Errorf("failed to get quality score: %w", err)
	}

	return score, nil
}

// GetUserFeedback returns all feedback from a user
func (uc *TranslationFeedbackUseCase) GetUserFeedback(ctx context.Context, userID string) ([]domain.TranslationFeedback, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}

	return uc.repo.GetByUserID(ctx, userID)
}
