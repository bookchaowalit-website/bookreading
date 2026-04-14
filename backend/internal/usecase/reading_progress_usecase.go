package usecase

import (
	"context"
	"errors"
	"fmt"

	"github.com/bookreading/backend/internal/domain"
)

// ReadingProgressUseCase handles reading progress operations
type ReadingProgressUseCase struct {
	repo    domain.ReadingProgressRepository
	bookmarkRepo domain.BookmarkRepository
}

// NewReadingProgressUseCase creates a new reading progress use case
func NewReadingProgressUseCase(repo domain.ReadingProgressRepository, bookmarkRepo domain.BookmarkRepository) *ReadingProgressUseCase {
	return &ReadingProgressUseCase{
		repo:    repo,
		bookmarkRepo: bookmarkRepo,
	}
}

// SaveProgress saves or updates reading progress
func (uc *ReadingProgressUseCase) SaveProgress(ctx context.Context, userID, novelID string, chapterNumber int, progressPercentage float64) (*domain.ReadingProgress, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if novelID == "" {
		return nil, errors.New("novel_id is required")
	}
	if chapterNumber < 0 {
		return nil, errors.New("chapter_number must be non-negative")
	}
	if progressPercentage < 0 || progressPercentage > 100 {
		return nil, errors.New("progress_percentage must be between 0 and 100")
	}

	progress := &domain.ReadingProgress{
		UserID:           userID,
		NovelID:          novelID,
		ChapterNumber:    chapterNumber,
		ProgressPercentage: progressPercentage,
	}

	// Upsert (insert or update)
	if err := uc.repo.Upsert(ctx, progress); err != nil {
		return nil, fmt.Errorf("failed to save reading progress: %w", err)
	}

	return progress, nil
}

// GetProgress returns all reading progress for a user
func (uc *ReadingProgressUseCase) GetProgress(ctx context.Context, userID string) ([]domain.ReadingProgress, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}

	return uc.repo.GetByUserID(ctx, userID)
}

// GetNovelProgress returns reading progress for a specific novel
func (uc *ReadingProgressUseCase) GetNovelProgress(ctx context.Context, userID, novelID string) (*domain.ReadingProgress, error) {
	if userID == "" || novelID == "" {
		return nil, errors.New("user_id and novel_id are required")
	}

	return uc.repo.GetByNovelID(ctx, userID, novelID)
}

// DeleteProgress deletes a reading progress entry
func (uc *ReadingProgressUseCase) DeleteProgress(ctx context.Context, id string) error {
	return uc.repo.Delete(ctx, id)
}

// BookmarkUseCase handles bookmark operations
type BookmarkUseCase struct {
	repo domain.BookmarkRepository
}

// NewBookmarkUseCase creates a new bookmark use case
func NewBookmarkUseCase(repo domain.BookmarkRepository) *BookmarkUseCase {
	return &BookmarkUseCase{repo: repo}
}

// AddBookmark creates a new bookmark
func (uc *BookmarkUseCase) AddBookmark(ctx context.Context, userID, novelID string, chapterNumber, position int, note *string) (*domain.Bookmark, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if novelID == "" {
		return nil, errors.New("novel_id is required")
	}
	if chapterNumber < 0 {
		return nil, errors.New("chapter_number must be non-negative")
	}
	if position < 0 {
		return nil, errors.New("position must be non-negative")
	}

	bookmark := &domain.Bookmark{
		UserID:        userID,
		NovelID:       novelID,
		ChapterNumber: chapterNumber,
		Position:      position,
		Note:          note,
	}

	if err := uc.repo.Create(ctx, bookmark); err != nil {
		return nil, fmt.Errorf("failed to create bookmark: %w", err)
	}

	return bookmark, nil
}

// GetBookmarks returns all bookmarks for a user
func (uc *BookmarkUseCase) GetBookmarks(ctx context.Context, userID string) ([]domain.Bookmark, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}

	return uc.repo.GetByUserID(ctx, userID)
}

// GetNovelBookmarks returns all bookmarks for a specific novel
func (uc *BookmarkUseCase) GetNovelBookmarks(ctx context.Context, userID, novelID string) ([]domain.Bookmark, error) {
	if userID == "" || novelID == "" {
		return nil, errors.New("user_id and novel_id are required")
	}

	return uc.repo.GetByNovelID(ctx, userID, novelID)
}

// RemoveBookmark deletes a bookmark
func (uc *BookmarkUseCase) RemoveBookmark(ctx context.Context, id string) error {
	if id == "" {
		return errors.New("bookmark id is required")
	}

	return uc.repo.Delete(ctx, id)
}
