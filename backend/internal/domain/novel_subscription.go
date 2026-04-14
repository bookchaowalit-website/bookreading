package domain

import (
	"time"
)

// NovelSubscription represents a user's subscription to a novel for auto-updates
type NovelSubscription struct {
	ID               string     `db:"id" json:"id"`
	NovelID          string     `db:"novel_id" json:"novel_id"`
	UserID           *string    `db:"user_id" json:"user_id,omitempty"`
	SourceURL        string     `db:"source_url" json:"source_url"`
	SourceType       string     `db:"source_type" json:"source_type"`
	LastChapterCount int        `db:"last_chapter_count" json:"last_chapter_count"`
	LastCheckedAt    *time.Time `db:"last_checked_at" json:"last_checked_at,omitempty"`
	LastUpdatedAt    *time.Time `db:"last_updated_at" json:"last_updated_at,omitempty"`
	CheckIntervalHrs int        `db:"check_interval_hours" json:"check_interval_hours"`
	IsActive         bool       `db:"is_active" json:"is_active"`
	CreatedAt        time.Time  `db:"created_at" json:"created_at"`
}

// NovelUpdateHistory tracks the history of novel update checks
type NovelUpdateHistory struct {
	ID              string     `db:"id" json:"id"`
	NovelID         string     `db:"novel_id" json:"novel_id"`
	ChaptersAdded   int        `db:"chapters_added" json:"chapters_added"`
	ChaptersUpdated int        `db:"chapters_updated" json:"chapters_updated"`
	Status          string     `db:"status" json:"status"`
	ErrorMessage    *string    `db:"error_message" json:"error_message,omitempty"`
	CheckedAt       time.Time  `db:"checked_at" json:"checked_at"`
	CompletedAt     *time.Time `db:"completed_at" json:"completed_at,omitempty"`
}

// NovelSubscriptionRepository defines the interface for novel subscription operations
type NovelSubscriptionRepository interface {
	Create(subscription *NovelSubscription) error
	GetByID(id string) (*NovelSubscription, error)
	GetByNovelID(novelID string) (*NovelSubscription, error)
	GetByUserID(userID string) ([]NovelSubscription, error)
	GetDueForUpdate() ([]NovelSubscription, error)
	Update(subscription *NovelSubscription) error
	Delete(id string) error
	UpdateLastChecked(id string, chapterCount int) error
}

// NovelUpdateHistoryRepository defines the interface for update history operations
type NovelUpdateHistoryRepository interface {
	Create(history *NovelUpdateHistory) error
	GetByNovelID(novelID string, limit int) ([]NovelUpdateHistory, error)
	GetRecent(limit int) ([]NovelUpdateHistory, error)
}
