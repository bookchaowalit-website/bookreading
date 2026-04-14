package usecase

import (
	"context"
	"log"
	"time"

	"github.com/bookreading/backend/internal/domain"
)

// NovelUpdateUseCase handles automatic novel updates
type NovelUpdateUseCase struct {
	subRepo   domain.NovelSubscriptionRepository
	histRepo  domain.NovelUpdateHistoryRepository
	novelUC   domain.NovelUseCase
	chapterUC domain.ChapterUseCase
}

// NewNovelUpdateUseCase creates a new novel update use case
func NewNovelUpdateUseCase(
	subRepo domain.NovelSubscriptionRepository,
	histRepo domain.NovelUpdateHistoryRepository,
	novelUC domain.NovelUseCase,
	chapterUC domain.ChapterUseCase,
) *NovelUpdateUseCase {
	return &NovelUpdateUseCase{
		subRepo:   subRepo,
		histRepo:  histRepo,
		novelUC:   novelUC,
		chapterUC: chapterUC,
	}
}

// SubscribeToNovel creates a new subscription for auto-updates
func (uc *NovelUpdateUseCase) SubscribeToNovel(ctx context.Context, novelID, sourceURL, sourceType string, userID *string) (*domain.NovelSubscription, error) {
	// Check if subscription already exists
	existing, _ := uc.subRepo.GetByNovelID(novelID)
	if existing != nil {
		return existing, nil
	}

	subscription := &domain.NovelSubscription{
		NovelID:          novelID,
		UserID:           userID,
		SourceURL:        sourceURL,
		SourceType:       sourceType,
		LastChapterCount: 0,
		CheckIntervalHrs: 12,
		IsActive:         true,
	}

	if err := uc.subRepo.Create(subscription); err != nil {
		return nil, err
	}

	return subscription, nil
}

// UnsubscribeFromNovel removes a subscription
func (uc *NovelUpdateUseCase) UnsubscribeFromNovel(ctx context.Context, subscriptionID string) error {
	return uc.subRepo.Delete(subscriptionID)
}

// GetUserSubscriptions returns all subscriptions for a user
func (uc *NovelUpdateUseCase) GetUserSubscriptions(ctx context.Context, userID string) ([]domain.NovelSubscription, error) {
	return uc.subRepo.GetByUserID(userID)
}

// CheckForUpdates checks a single novel for updates
func (uc *NovelUpdateUseCase) CheckForUpdates(ctx context.Context, subscription *domain.NovelSubscription) error {
	history := &domain.NovelUpdateHistory{
		NovelID:   subscription.NovelID,
		Status:    "checking",
		CheckedAt: time.Now(),
	}

	// Record start
	uc.histRepo.Create(history)

	// Scrape the novel to get latest chapters
	_, chaptersScraped, err := uc.novelUC.ScrapeNovel(ctx, subscription.SourceURL, "", "", subscription.NovelID)
	if err != nil {
		history.Status = "error"
		errMsg := err.Error()
		history.ErrorMessage = &errMsg
		now := time.Now()
		history.CompletedAt = &now
		uc.histRepo.Create(history)
		return err
	}

	// Calculate new chapters
	newChapters := chaptersScraped

	// Update subscription
	uc.subRepo.UpdateLastChecked(subscription.ID, subscription.LastChapterCount+newChapters)

	// Record completion
	history.ChaptersAdded = newChapters
	history.Status = "success"
	now := time.Now()
	history.CompletedAt = &now
	uc.histRepo.Create(history)

	log.Printf("Updated novel %s: %d new chapters", subscription.NovelID, newChapters)
	return nil
}

// RunScheduledUpdates processes all due subscriptions
func (uc *NovelUpdateUseCase) RunScheduledUpdates(ctx context.Context) (int, int) {
	subscriptions, err := uc.subRepo.GetDueForUpdate()
	if err != nil {
		log.Printf("Error getting due subscriptions: %v", err)
		return 0, 0
	}

	successCount := 0
	errorCount := 0

	for _, sub := range subscriptions {
		if err := uc.CheckForUpdates(ctx, &sub); err != nil {
			log.Printf("Error updating novel %s: %v", sub.NovelID, err)
			errorCount++
		} else {
			successCount++
		}
	}

	log.Printf("Novel updates completed: %d success, %d errors", successCount, errorCount)
	return successCount, errorCount
}

// GetUpdateHistory returns update history for a novel
func (uc *NovelUpdateUseCase) GetUpdateHistory(ctx context.Context, novelID string, limit int) ([]domain.NovelUpdateHistory, error) {
	if limit <= 0 {
		limit = 10
	}
	return uc.histRepo.GetByNovelID(novelID, limit)
}
