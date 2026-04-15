package domain

import (
	"context"
)

type NovelUseCase interface {
	CreateNovel(ctx context.Context, novel *Novel) error
	GetNovel(ctx context.Context, id string) (*Novel, error)
	ListNovels(ctx context.Context, limit, offset int, status string) ([]*Novel, int, error)
	ScrapeNovel(ctx context.Context, url, sourceLang, targetLang, novelID string) (string, int, error)
}

type ChapterUseCase interface {
	GetChapter(ctx context.Context, id string) (*Chapter, error)
	GetChapterByNumber(ctx context.Context, novelID string, chapterNumber int) (*Chapter, error)
	ListChapters(ctx context.Context, novelID string, limit, offset int) ([]*Chapter, int, error)
	TranslateChapter(ctx context.Context, chapterID, targetLang string, useContext bool) (*Chapter, error)
	SaveChapter(ctx context.Context, novelID string, chapter *ScrapedChapter) error
	SaveTranslatedContent(ctx context.Context, chapterID string, translatedText string) error
	UpdateChapter(ctx context.Context, chapter *Chapter) error
}

type TerminologyUseCase interface {
	GetTerminology(ctx context.Context, novelID string) ([]*Terminology, error)
	AddTerminology(ctx context.Context, term *Terminology) error
	UpdateTerminology(ctx context.Context, term *Terminology) error
}
