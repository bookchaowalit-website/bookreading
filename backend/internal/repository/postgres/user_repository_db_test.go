package postgres

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/bookreading/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

// These tests run only when BOOKREADING_TEST_DATABASE_URL points at a
// throwaway database built with database/migrations (or init.sql). They
// create rows with random IDs and delete them afterwards.
func testDB(t *testing.T) *sqlx.DB {
	t.Helper()
	dsn := os.Getenv("BOOKREADING_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("BOOKREADING_TEST_DATABASE_URL not set")
	}
	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func createTestUser(t *testing.T, repo *UserRepository) *domain.User {
	t.Helper()
	u := &domain.User{
		ID:                 uuid.NewString(),
		Email:              uuid.NewString() + "@example.test",
		PasswordHash:       "x",
		Name:               "fixture",
		SubscriptionPlan:   "free",
		SubscriptionStatus: "active",
	}
	if err := repo.Create(context.Background(), u); err != nil {
		t.Fatalf("Create: %v", err)
	}
	t.Cleanup(func() { _ = repo.Delete(context.Background(), u.ID) })
	return u
}

func TestUserRepositoryRoundTripAndPromoteByID(t *testing.T) {
	db := testDB(t)
	repo := NewUserRepository(db)
	ctx := context.Background()
	u := createTestUser(t, repo)
	other := createTestUser(t, repo)

	got, err := repo.GetByID(ctx, u.ID)
	if err != nil {
		t.Fatalf("GetByID (does the schema match domain.User?): %v", err)
	}
	if got.Role != domain.RoleUser {
		t.Fatalf("new user role = %q, want %q", got.Role, domain.RoleUser)
	}

	n, err := repo.PromoteAdminsByID(ctx, []string{u.ID, uuid.NewString()})
	if err != nil || n != 1 {
		t.Fatalf("PromoteAdminsByID = %d, %v; want 1, nil", n, err)
	}
	if got, _ := repo.GetByID(ctx, u.ID); !got.IsAdmin() {
		t.Fatal("listed user was not promoted")
	}
	if got, _ := repo.GetByID(ctx, other.ID); got.IsAdmin() {
		t.Fatal("unlisted user was promoted")
	}
	if n, _ := repo.PromoteAdminsByID(ctx, []string{u.ID}); n != 0 {
		t.Fatalf("re-promoting changed %d rows, want 0", n)
	}
}

func TestUserTerminologyDeleteIsOwnerScoped(t *testing.T) {
	db := testDB(t)
	users := NewUserRepository(db)
	terms := NewUserTerminologyRepository(db)
	ctx := context.Background()
	owner := createTestUser(t, users)
	intruder := createTestUser(t, users)

	term := &domain.UserTerminology{ID: uuid.NewString(), UserID: owner.ID, OriginalTerm: "x", Translation: "y", TermType: "general"}
	if err := terms.Create(ctx, term); err != nil {
		t.Fatalf("Create term: %v", err)
	}
	if err := terms.Delete(ctx, intruder.ID, term.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("foreign delete err = %v, want ErrNotFound", err)
	}
	list, err := terms.GetByUserID(ctx, owner.ID)
	if err != nil {
		t.Fatalf("GetByUserID: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("owner has %d terms after foreign delete, want 1", len(list))
	}
	if err := terms.Delete(ctx, owner.ID, term.ID); err != nil {
		t.Fatalf("owner delete: %v", err)
	}
}
