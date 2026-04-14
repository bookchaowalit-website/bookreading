package domain

import (
	"context"
	"time"
)

// ReadingProgress represents a user's reading progress for a novel
type ReadingProgress struct {
	ID               string    `db:"id" json:"id"`
	UserID           string    `db:"user_id" json:"user_id"`
	NovelID          string    `db:"novel_id" json:"novel_id"`
	ChapterNumber    int       `db:"chapter_number" json:"chapter_number"`
	ProgressPercentage float64 `db:"progress_percentage" json:"progress_percentage"`
	LastReadAt       time.Time `db:"last_read_at" json:"last_read_at"`
	CreatedAt        time.Time `db:"created_at" json:"created_at"`
}

// Bookmark represents a user's bookmark in a novel
type Bookmark struct {
	ID            string     `db:"id" json:"id"`
	UserID        string     `db:"user_id" json:"user_id"`
	NovelID       string     `db:"novel_id" json:"novel_id"`
	ChapterNumber int        `db:"chapter_number" json:"chapter_number"`
	Position      int        `db:"position" json:"position"`
	Note          *string    `db:"note" json:"note,omitempty"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
}

// TranslationFeedback represents user feedback on a translation
type TranslationFeedback struct {
	ID           string     `db:"id" json:"id"`
	UserID       *string    `db:"user_id" json:"user_id,omitempty"`
	NovelID      string     `db:"novel_id" json:"novel_id"`
	ChapterNumber int       `db:"chapter_number" json:"chapter_number"`
	Rating       int        `db:"rating" json:"rating"`
	Comment      *string    `db:"comment" json:"comment,omitempty"`
	HasErrors    bool       `db:"has_errors" json:"has_errors"`
	ErrorDetails *string    `db:"error_details" json:"error_details,omitempty"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

// ChapterQualityScore represents aggregated quality score for a chapter
type ChapterQualityScore struct {
	NovelID       string  `json:"novel_id"`
	ChapterNumber int     `json:"chapter_number"`
	AvgRating     float64 `json:"avg_rating"`
	FeedbackCount int     `json:"feedback_count"`
}

// ReadingProgressRepository defines the interface for reading progress operations
type ReadingProgressRepository interface {
	Create(ctx context.Context, progress *ReadingProgress) error
	GetByUserID(ctx context.Context, userID string) ([]ReadingProgress, error)
	GetByNovelID(ctx context.Context, userID, novelID string) (*ReadingProgress, error)
	Update(ctx context.Context, progress *ReadingProgress) error
	Upsert(ctx context.Context, progress *ReadingProgress) error
	Delete(ctx context.Context, id string) error
}

// BookmarkRepository defines the interface for bookmark operations
type BookmarkRepository interface {
	Create(ctx context.Context, bookmark *Bookmark) error
	GetByID(ctx context.Context, id string) (*Bookmark, error)
	GetByUserID(ctx context.Context, userID string) ([]Bookmark, error)
	GetByNovelID(ctx context.Context, userID, novelID string) ([]Bookmark, error)
	Delete(ctx context.Context, id string) error
}

// TranslationFeedbackRepository defines the interface for feedback operations
type TranslationFeedbackRepository interface {
	Create(ctx context.Context, feedback *TranslationFeedback) error
	GetByChapter(ctx context.Context, novelID string, chapterNumber int) ([]TranslationFeedback, error)
	GetByUserID(ctx context.Context, userID string) ([]TranslationFeedback, error)
	GetQualityScore(ctx context.Context, novelID string, chapterNumber int) (*ChapterQualityScore, error)
}
