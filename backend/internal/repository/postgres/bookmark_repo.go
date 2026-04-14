package postgres

import (
	"context"
	"database/sql"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type bookmarkRepository struct {
	db *sqlx.DB
}

// NewBookmarkRepository creates a new bookmark repository
func NewBookmarkRepository(db *sqlx.DB) domain.BookmarkRepository {
	return &bookmarkRepository{db: db}
}

func (r *bookmarkRepository) Create(ctx context.Context, bookmark *domain.Bookmark) error {
	query := `
		INSERT INTO bookmarks (id, user_id, novel_id, chapter_number, position, note, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	if bookmark.ID == "" {
		bookmark.ID = uuid.New().String()
	}
	now := time.Now()
	_, err := r.db.ExecContext(ctx, query,
		bookmark.ID, bookmark.UserID, bookmark.NovelID,
		bookmark.ChapterNumber, bookmark.Position, bookmark.Note, now,
	)
	return err
}

func (r *bookmarkRepository) GetByID(ctx context.Context, id string) (*domain.Bookmark, error) {
	var bookmark domain.Bookmark
	query := `SELECT id, user_id, novel_id, chapter_number, position, note, created_at
	          FROM bookmarks WHERE id = $1`
	err := r.db.GetContext(ctx, &bookmark, query, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &bookmark, err
}

func (r *bookmarkRepository) GetByUserID(ctx context.Context, userID string) ([]domain.Bookmark, error) {
	var bookmarks []domain.Bookmark
	query := `SELECT id, user_id, novel_id, chapter_number, position, note, created_at
	          FROM bookmarks 
	          WHERE user_id = $1 
	          ORDER BY created_at DESC`
	err := r.db.SelectContext(ctx, &bookmarks, query, userID)
	return bookmarks, err
}

func (r *bookmarkRepository) GetByNovelID(ctx context.Context, userID, novelID string) ([]domain.Bookmark, error) {
	var bookmarks []domain.Bookmark
	query := `SELECT id, user_id, novel_id, chapter_number, position, note, created_at
	          FROM bookmarks 
	          WHERE user_id = $1 AND novel_id = $2 
	          ORDER BY chapter_number ASC, position ASC`
	err := r.db.SelectContext(ctx, &bookmarks, query, userID, novelID)
	return bookmarks, err
}

func (r *bookmarkRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM bookmarks WHERE id = $1", id)
	return err
}
