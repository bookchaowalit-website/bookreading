package usecase

import (
	"context"
	"errors"
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

// SubscribeToNovel creates userID's subscription to a novel, or returns the
// one userID already has (novel_subscriptions is UNIQUE(novel_id, user_id)).
// Another user's subscription to the same novel is never returned.
func (uc *NovelUpdateUseCase) SubscribeToNovel(ctx context.Context, novelID, sourceURL, sourceType, userID string) (*domain.NovelSubscription, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	existing, err := uc.subRepo.GetByUserID(userID)
	if err != nil {
		return nil, err
	}
	for i := range existing {
		if existing[i].NovelID == novelID {
			return &existing[i], nil
		}
	}

	owner := userID
	subscription := &domain.NovelSubscription{
		NovelID:          novelID,
		UserID:           &owner,
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

// UnsubscribeFromNovel removes userID's subscription. A missing subscription
// or one owned by another user returns domain.ErrNotFound.
func (uc *NovelUpdateUseCase) UnsubscribeFromNovel(ctx context.Context, userID, subscriptionID string) error {
	if userID == "" {
		return errors.New("user_id is required")
	}
	sub, err := uc.subRepo.GetByID(subscriptionID)
	if err != nil {
		return err
	}
	if sub == nil || sub.UserID == nil || *sub.UserID != userID {
		return domain.ErrNotFound
	}
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
	uc.recordHistory(history)

	// Scrape the novel to get latest chapters
	_, chaptersScraped, err := uc.novelUC.ScrapeNovel(ctx, subscription.SourceURL, "", "", subscription.NovelID)
	if err != nil {
		history.Status = "error"
		errMsg := err.Error()
		history.ErrorMessage = &errMsg
		now := time.Now()
		history.CompletedAt = &now
		uc.recordHistory(history)
		return err
	}

	// Calculate new chapters
	newChapters := chaptersScraped

	// Update subscription
	if err := uc.subRepo.UpdateLastChecked(subscription.ID, subscription.LastChapterCount+newChapters); err != nil {
		log.Printf("[WARN] failed to update last-checked for subscription %s: %v", subscription.ID, err)
	}

	// Record completion
	history.ChaptersAdded = newChapters
	history.Status = "success"
	now := time.Now()
	history.CompletedAt = &now
	uc.recordHistory(history)

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
	limit, _ = domain.NormalizePage(limit, 0, 10)
	return uc.histRepo.GetByNovelID(novelID, limit)
}

// recordHistory persists an update-history row; failures are logged, not fatal.
func (uc *NovelUpdateUseCase) recordHistory(history *domain.NovelUpdateHistory) {
	if err := uc.histRepo.Create(history); err != nil {
		log.Printf("[WARN] failed to record update history for novel %s: %v", history.NovelID, err)
	}
}
