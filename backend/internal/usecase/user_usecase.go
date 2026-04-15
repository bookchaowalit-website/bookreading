package usecase

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type UserUsecase struct {
	userRepo    domain.UserRepository
	libraryRepo domain.UserLibraryRepository
	termRepo    domain.UserTerminologyRepository
	jwtSecret   string
	jwtExpiry   time.Duration
}

func NewUserUsecase(
	userRepo domain.UserRepository,
	libraryRepo domain.UserLibraryRepository,
	termRepo domain.UserTerminologyRepository,
	jwtSecret string,
) *UserUsecase {
	return &UserUsecase{
		userRepo:    userRepo,
		libraryRepo: libraryRepo,
		termRepo:    termRepo,
		jwtSecret:   jwtSecret,
		jwtExpiry:   24 * time.Hour * 7, // 7 days
	}
}

type RegisterInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	User  *domain.User `json:"user"`
	Token string       `json:"token"`
}

type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Plan   string `json:"plan"`
	jwt.RegisteredClaims
}

func (u *UserUsecase) Register(ctx context.Context, input RegisterInput) (*AuthResponse, error) {
	// Check if user already exists
	existingUser, err := u.userRepo.GetByEmail(ctx, input.Email)
	if err == nil && existingUser != nil {
		return nil, errors.New("email already registered")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Create user
	user := &domain.User{
		ID:                 uuid.New().String(),
		Email:              input.Email,
		PasswordHash:       string(hashedPassword),
		Name:               input.Name,
		SubscriptionPlan:   "free",
		SubscriptionStatus: "active",
	}

	if err := u.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	// Generate token
	token, err := u.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{User: user, Token: token}, nil
}

func (u *UserUsecase) Login(ctx context.Context, input LoginInput) (*AuthResponse, error) {
	// Get user by email
	user, err := u.userRepo.GetByEmail(ctx, input.Email)
	if err != nil {
		log.Printf("[LOGIN] GetByEmail error: %v", err)
		return nil, errors.New("invalid credentials")
	}
	log.Printf("[LOGIN] Found user: id=%s email=%s hash_len=%d", user.ID, user.Email, len(user.PasswordHash))

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password))
	if err != nil {
		log.Printf("[LOGIN] Bcrypt compare error: %v", err)
		return nil, errors.New("invalid credentials")
	}
	log.Printf("[LOGIN] Password verified successfully")

	// Generate token
	token, err := u.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{User: user, Token: token}, nil
}

func (u *UserUsecase) GetByID(ctx context.Context, id string) (*domain.User, error) {
	return u.userRepo.GetByID(ctx, id)
}

func (u *UserUsecase) Update(ctx context.Context, user *domain.User) error {
	return u.userRepo.Update(ctx, user)
}

func (u *UserUsecase) Delete(ctx context.Context, id string) error {
	return u.userRepo.Delete(ctx, id)
}

func (u *UserUsecase) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(u.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

func (u *UserUsecase) generateToken(user *domain.User) (string, error) {
	claims := &Claims{
		UserID: user.ID,
		Email:  user.Email,
		Plan:   user.SubscriptionPlan,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(u.jwtExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(u.jwtSecret))
}

// GenerateToken is the public method for token generation (used by refresh)
func (u *UserUsecase) GenerateToken(user *domain.User) (string, error) {
	return u.generateToken(user)
}

// Library methods

func (u *UserUsecase) AddToLibrary(ctx context.Context, userID, novelID string) error {
	return u.libraryRepo.AddToLibrary(ctx, userID, novelID)
}

func (u *UserUsecase) RemoveFromLibrary(ctx context.Context, userID, novelID string) error {
	return u.libraryRepo.RemoveFromLibrary(ctx, userID, novelID)
}

func (u *UserUsecase) GetLibrary(ctx context.Context, userID string) ([]domain.UserLibrary, error) {
	return u.libraryRepo.GetUserLibrary(ctx, userID)
}

func (u *UserUsecase) UpdateProgress(ctx context.Context, userID, novelID string, progress float64, lastChapter int) error {
	return u.libraryRepo.UpdateProgress(ctx, userID, novelID, progress, lastChapter)
}

// Terminology methods

func (u *UserUsecase) AddTerminology(ctx context.Context, term *domain.UserTerminology) error {
	term.ID = uuid.New().String()
	return u.termRepo.Create(ctx, term)
}

func (u *UserUsecase) GetTerminology(ctx context.Context, userID string) ([]domain.UserTerminology, error) {
	return u.termRepo.GetByUserID(ctx, userID)
}

func (u *UserUsecase) UpdateTerminology(ctx context.Context, term *domain.UserTerminology) error {
	return u.termRepo.Update(ctx, term)
}

func (u *UserUsecase) DeleteTerminology(ctx context.Context, id string) error {
	return u.termRepo.Delete(ctx, id)
}
