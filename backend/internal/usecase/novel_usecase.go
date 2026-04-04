package usecase

import (
	"context"
	"fmt"
	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/infrastructure/aiservice"
	"github.com/google/uuid"
)

type novelUseCase struct {
	novelRepo       domain.NovelRepository
	chapterRepo     domain.ChapterRepository
	terminologyRepo domain.TerminologyRepository
	aiClient        aiservice.AIServiceClient
}

func NewNovelUseCase(
	novelRepo domain.NovelRepository,
	chapterRepo domain.ChapterRepository,
	terminologyRepo domain.TerminologyRepository,
	aiClient aiservice.AIServiceClient,
) domain.NovelUseCase {
	return &novelUseCase{
		novelRepo:       novelRepo,
		chapterRepo:     chapterRepo,
		terminologyRepo: terminologyRepo,
		aiClient:        aiClient,
	}
}

func (uc *novelUseCase) CreateNovel(ctx context.Context, novel *domain.Novel) error {
	novel.ID = uuid.New().String()
	return uc.novelRepo.Create(ctx, novel)
}

func (uc *novelUseCase) GetNovel(ctx context.Context, id string) (*domain.Novel, error) {
	return uc.novelRepo.GetByID(ctx, id)
}

func (uc *novelUseCase) ListNovels(ctx context.Context, limit, offset int, status string) ([]*domain.Novel, int, error) {
	return uc.novelRepo.List(ctx, limit, offset, status)
}

func (uc *novelUseCase) ScrapeNovel(ctx context.Context, url, sourceLang, targetLang, novelID string) (string, int, error) {
	// Call AI service to scrape
	scrapeResp, err := uc.aiClient.ScrapeNovel(ctx, url, sourceLang)
	if err != nil {
		return "", 0, fmt.Errorf("failed to scrape novel: %w", err)
	}

	// Use provided ID or generate a new one
	if novelID == "" {
		novelID = uuid.New().String()
	}

	// Create novel record
	novel := &domain.Novel{
		ID:            novelID,
		Title:         scrapeResp.Title,
		OriginalTitle: scrapeResp.OriginalTitle,
		SourceURL:     url,
		SourceLang:    sourceLang,
		TargetLang:    targetLang,
		Author:        scrapeResp.Author,
		Description:   scrapeResp.Description,
		CoverImageURL: scrapeResp.CoverImageURL,
		Status:        "ongoing",
	}

	err = uc.novelRepo.Create(ctx, novel)
	if err != nil {
		return "", 0, fmt.Errorf("failed to create novel: %w", err)
	}

	// Create chapters
	chaptersScraped := 0
	for _, ch := range scrapeResp.Chapters {
		chapter := &domain.Chapter{
			ID:              uuid.New().String(),
			NovelID:         novel.ID,
			ChapterNumber:   ch.ChapterNumber,
			Title:           ch.Title,
			OriginalTitle:   ch.OriginalTitle,
			SourceURL:       ch.URL,
			OriginalContent: ch.Content,
			Content:         "", // Will be translated later
			WordCount:       len(ch.Content),
			IsScraped:       true,
			IsTranslated:    false,
		}

		err = uc.chapterRepo.Create(ctx, chapter)
		if err != nil {
			// Continue with other chapters even if one fails
			continue
		}
		chaptersScraped++
	}

	return novel.ID, chaptersScraped, nil
}
