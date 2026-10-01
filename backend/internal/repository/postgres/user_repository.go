package postgres

import (
	"context"
	"database/sql"

	"github.com/bookreading/backend/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type UserRepository struct {
	db *sqlx.DB
}

func NewUserRepository(db *sqlx.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, user *domain.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, name, avatar_url, subscription_plan, subscription_status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING created_at, updated_at
	`
	return r.db.QueryRowxContext(ctx, query,
		user.ID,
		user.Email,
		user.PasswordHash,
		user.Name,
		user.AvatarURL,
		user.SubscriptionPlan,
		user.SubscriptionStatus,
	).Scan(&user.CreatedAt, &user.UpdatedAt)
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	var user domain.User
	query := `SELECT * FROM users WHERE id = $1`
	err := r.db.GetContext(ctx, &user, query, id)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	query := `SELECT * FROM users WHERE email = $1`
	err := r.db.GetContext(ctx, &user, query, email)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByStripeSubscriptionID returns (nil, nil) when no user owns the subscription.
func (r *UserRepository) GetByStripeSubscriptionID(ctx context.Context, subscriptionID string) (*domain.User, error) {
	var user domain.User
	query := `SELECT * FROM users WHERE stripe_subscription_id = $1`
	err := r.db.GetContext(ctx, &user, query, subscriptionID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) Update(ctx context.Context, user *domain.User) error {
	query := `
		UPDATE users 
		SET name = $2, avatar_url = $3, subscription_plan = $4, subscription_status = $5,
		    stripe_customer_id = $6, stripe_subscription_id = $7, stripe_event_at = $8
		WHERE id = $1
		RETURNING updated_at
	`
	return r.db.QueryRowxContext(ctx, query,
		user.ID,
		user.Name,
		user.AvatarURL,
		user.SubscriptionPlan,
		user.SubscriptionStatus,
		user.StripeCustomerID,
		user.StripeSubscriptionID,
		user.StripeEventAt,
	).Scan(&user.UpdatedAt)
}

// PromoteAdmins grants the admin role to existing users whose email matches
// one of emails (case-insensitive). It never demotes anyone and never
// creates accounts. It returns the number of users changed.
func (r *UserRepository) PromoteAdmins(ctx context.Context, emails []string) (int64, error) {
	if len(emails) == 0 {
		return 0, nil
	}
	res, err := r.db.ExecContext(ctx,
		`UPDATE users SET role = $1 WHERE lower(email) = ANY($2) AND role <> $1`,
		domain.RoleAdmin, pq.Array(emails))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *UserRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM users WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// UserLibraryRepository implementation

type UserLibraryRepository struct {
	db *sqlx.DB
}

func NewUserLibraryRepository(db *sqlx.DB) *UserLibraryRepository {
	return &UserLibraryRepository{db: db}
}

func (r *UserLibraryRepository) AddToLibrary(ctx context.Context, userID, novelID string) error {
	query := `
		INSERT INTO user_library (user_id, novel_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, novel_id) DO UPDATE SET saved_at = CURRENT_TIMESTAMP
	`
	_, err := r.db.ExecContext(ctx, query, userID, novelID)
	return err
}

func (r *UserLibraryRepository) RemoveFromLibrary(ctx context.Context, userID, novelID string) error {
	query := `DELETE FROM user_library WHERE user_id = $1 AND novel_id = $2`
	_, err := r.db.ExecContext(ctx, query, userID, novelID)
	return err
}

func (r *UserLibraryRepository) GetUserLibrary(ctx context.Context, userID string) ([]domain.UserLibrary, error) {
	var library []domain.UserLibrary
	query := `
		SELECT ul.* FROM user_library ul
		JOIN novels n ON ul.novel_id = n.id
		WHERE ul.user_id = $1
		ORDER BY ul.last_read_at DESC
	`
	err := r.db.SelectContext(ctx, &library, query, userID)
	if err != nil {
		return nil, err
	}
	return library, nil
}

func (r *UserLibraryRepository) UpdateProgress(ctx context.Context, userID, novelID string, progress float64, lastChapter int) error {
	query := `
		UPDATE user_library 
		SET reading_progress = $3, last_chapter_read = $4, last_read_at = CURRENT_TIMESTAMP
		WHERE user_id = $1 AND novel_id = $2
	`
	_, err := r.db.ExecContext(ctx, query, userID, novelID, progress, lastChapter)
	return err
}

func (r *UserLibraryRepository) GetByUserAndNovel(ctx context.Context, userID, novelID string) (*domain.UserLibrary, error) {
	var item domain.UserLibrary
	query := `SELECT * FROM user_library WHERE user_id = $1 AND novel_id = $2`
	err := r.db.GetContext(ctx, &item, query, userID, novelID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// UserTerminologyRepository implementation

type UserTerminologyRepository struct {
	db *sqlx.DB
}

func NewUserTerminologyRepository(db *sqlx.DB) *UserTerminologyRepository {
	return &UserTerminologyRepository{db: db}
}

func (r *UserTerminologyRepository) Create(ctx context.Context, term *domain.UserTerminology) error {
	query := `
		INSERT INTO user_terminology (id, user_id, original_term, translation, term_type, description)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING created_at, updated_at
	`
	return r.db.QueryRowxContext(ctx, query,
		term.ID,
		term.UserID,
		term.OriginalTerm,
		term.Translation,
		term.TermType,
		term.Description,
	).Scan(&term.CreatedAt, &term.UpdatedAt)
}

func (r *UserTerminologyRepository) GetByUserID(ctx context.Context, userID string) ([]domain.UserTerminology, error) {
	var terms []domain.UserTerminology
	query := `SELECT * FROM user_terminology WHERE user_id = $1 ORDER BY created_at DESC`
	err := r.db.SelectContext(ctx, &terms, query, userID)
	if err != nil {
		return nil, err
	}
	return terms, nil
}

func (r *UserTerminologyRepository) Update(ctx context.Context, term *domain.UserTerminology) error {
	query := `
		UPDATE user_terminology 
		SET translation = $3, term_type = $4, description = $5
		WHERE id = $1 AND user_id = $2
		RETURNING updated_at
	`
	return r.db.QueryRowxContext(ctx, query,
		term.ID,
		term.UserID,
		term.Translation,
		term.TermType,
		term.Description,
	).Scan(&term.UpdatedAt)
}

func (r *UserTerminologyRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM user_terminology WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
