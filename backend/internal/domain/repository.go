package domain

import (
	"context"
)

// User-related repositories
type UserRepository interface {
	Create(ctx context.Context, user *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	// GetByStripeSubscriptionID returns (nil, nil) when no user owns the subscription.
	GetByStripeSubscriptionID(ctx context.Context, subscriptionID string) (*User, error)
	Update(ctx context.Context, user *User) error
	Delete(ctx context.Context, id string) error
}

type UserLibraryRepository interface {
	AddToLibrary(ctx context.Context, userID, novelID string) error
	RemoveFromLibrary(ctx context.Context, userID, novelID string) error
	GetUserLibrary(ctx context.Context, userID string) ([]UserLibrary, error)
	UpdateProgress(ctx context.Context, userID, novelID string, progress float64, lastChapter int) error
	GetByUserAndNovel(ctx context.Context, userID, novelID string) (*UserLibrary, error)
}

type UserTerminologyRepository interface {
	Create(ctx context.Context, term *UserTerminology) error
	GetByUserID(ctx context.Context, userID string) ([]UserTerminology, error)
	Update(ctx context.Context, term *UserTerminology) error
	// Delete removes the term only when userID owns it; ErrNotFound otherwise.
	Delete(ctx context.Context, userID, id string) error
}

// Novel-related repositories
type NovelRepository interface {
	Create(ctx context.Context, novel *Novel) error
	GetByID(ctx context.Context, id string) (*Novel, error)
	List(ctx context.Context, limit, offset int, status string) ([]*Novel, int, error)
	Update(ctx context.Context, novel *Novel) error
}

type ChapterRepository interface {
	Create(ctx context.Context, chapter *Chapter) error
	GetByID(ctx context.Context, id string) (*Chapter, error)
	ListByNovelID(ctx context.Context, novelID string, limit, offset int) ([]*Chapter, int, error)
	Update(ctx context.Context, chapter *Chapter) error
	GetByNovelIDAndNumber(ctx context.Context, novelID string, chapterNumber int) (*Chapter, error)
}

type TerminologyRepository interface {
	Create(ctx context.Context, term *Terminology) error
	GetByNovelID(ctx context.Context, novelID string) ([]*Terminology, error)
	Update(ctx context.Context, term *Terminology) error
	GetByID(ctx context.Context, id string) (*Terminology, error)
}

type TranslationHistoryRepository interface {
	Create(ctx context.Context, history *TranslationHistory) error
	GetByChapterID(ctx context.Context, chapterID string) ([]*TranslationHistory, error)
	GetLatestByChapterID(ctx context.Context, chapterID string) (*TranslationHistory, error)
	GetCachedTranslation(ctx context.Context, chapterID string, sourceHash string) (*TranslationHistory, error)
	ListByNovelID(ctx context.Context, novelID string, limit, offset int) ([]*TranslationHistory, int, error)
}
