package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/usecase"
)

// Email format validation regex
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// ctxKey is the private type for request-context keys; a plain string key
// would never match (context.Value compares key type and value).
type ctxKey string

// UserIDKey holds the authenticated user ID set by AuthMiddleware.
const UserIDKey ctxKey = "userID"

// claimsKey holds the validated *usecase.Claims set by AuthMiddleware.
const claimsKey ctxKey = "claims"

type Handler struct {
	userUsecase                *usecase.UserUsecase
	novelUsecase               domain.NovelUseCase
	chapterUsecase             domain.ChapterUseCase
	translationHistoryRepo     domain.TranslationHistoryRepository
	novelUpdateUseCase         *usecase.NovelUpdateUseCase
	readingProgressUseCase     *usecase.ReadingProgressUseCase
	bookmarkUseCase            *usecase.BookmarkUseCase
	translationFeedbackUseCase *usecase.TranslationFeedbackUseCase
	apiKeyUseCase              *usecase.APIKeyUseCase
}

func NewHandler(userUsecase *usecase.UserUsecase, novelUsecase domain.NovelUseCase, chapterUsecase domain.ChapterUseCase, translationHistoryRepo domain.TranslationHistoryRepository) *Handler {
	return &Handler{
		userUsecase:            userUsecase,
		novelUsecase:           novelUsecase,
		chapterUsecase:         chapterUsecase,
		translationHistoryRepo: translationHistoryRepo,
	}
}

// NewHandlerWithDeps creates a handler with injected dependencies
func NewHandlerWithDeps(deps *ServerDependencies) *Handler {
	return &Handler{
		userUsecase:                deps.UserUsecase,
		novelUsecase:               deps.NovelUsecase,
		chapterUsecase:             deps.ChapterUsecase,
		translationHistoryRepo:     deps.TranslationHistRepo,
		novelUpdateUseCase:         deps.NovelUpdateUseCase,
		readingProgressUseCase:     deps.ReadingProgressUseCase,
		bookmarkUseCase:            deps.BookmarkUseCase,
		translationFeedbackUseCase: deps.TranslationFeedbackUseCase,
		apiKeyUseCase:              deps.APIKeyUseCase,
	}
}

type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var input usecase.RegisterInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	// Input validation
	if input.Email == "" || input.Password == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "Email and password are required"})
		return
	}

	// Email format validation
	if !emailRegex.MatchString(input.Email) {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid email format"})
		return
	}

	// Password strength validation
	if len(input.Password) < 8 {
		h.respond(w, http.StatusBadRequest, Response{Error: "Password must be at least 8 characters"})
		return
	}

	// Name length validation
	if input.Name != "" && len(input.Name) > 100 {
		h.respond(w, http.StatusBadRequest, Response{Error: "Name must be 100 characters or less"})
		return
	}

	result, err := h.userUsecase.Register(r.Context(), input)
	if err != nil {
		log.Printf("[REGISTER] Failed for email=%s: %v", input.Email, err)
		h.respond(w, http.StatusBadRequest, Response{Error: err.Error()})
		return
	}

	// Set HTTP-only cookie
	h.setAuthCookie(w, result.Token)

	h.respond(w, http.StatusCreated, Response{Success: true, Data: result})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var input usecase.LoginInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	// Debug logging
	log.Printf("[LOGIN DEBUG] Attempting login for email: %s", input.Email)

	result, err := h.userUsecase.Login(r.Context(), input)
	if err != nil {
		log.Printf("[LOGIN DEBUG] Login failed for %s: %v", input.Email, err)
		h.respond(w, http.StatusUnauthorized, Response{Error: "Invalid email or password"})
		return
	}

	// Set HTTP-only cookie
	h.setAuthCookie(w, result.Token)
	log.Printf("[LOGIN DEBUG] Login successful for %s", input.Email)

	h.respond(w, http.StatusOK, Response{Success: true, Data: result})
}

// Refresh rotates the token to extend the session
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*usecase.Claims)
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Invalid session"})
		return
	}

	user, err := h.userUsecase.GetByID(r.Context(), claims.UserID)
	if err != nil {
		h.respond(w, http.StatusUnauthorized, Response{Error: "User not found"})
		return
	}

	token, err := h.userUsecase.GenerateToken(user)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to refresh token"})
		return
	}

	h.setAuthCookie(w, token)
	h.respond(w, http.StatusOK, Response{Success: true, Data: map[string]string{"message": "Token refreshed"}})
}

// Logout clears the auth cookie
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.clearAuthCookie(w)
	h.respond(w, http.StatusOK, Response{Success: true, Data: map[string]string{"message": "Logged out"}})
}

// setAuthCookie sets an HTTP-only, secure cookie with the JWT token
func (h *Handler) setAuthCookie(w http.ResponseWriter, token string) {
	secure := os.Getenv("NODE_ENV") == "production" || os.Getenv("COOKIE_SECURE") == "true"
	cookie := &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		MaxAge:   604800, // 7 days
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// clearAuthCookie removes the auth cookie
func (h *Handler) clearAuthCookie(w http.ResponseWriter) {
	secure := os.Getenv("NODE_ENV") == "production" || os.Getenv("COOKIE_SECURE") == "true"
	cookie := &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	user, err := h.userUsecase.GetByID(r.Context(), userID)
	if err != nil {
		h.respond(w, http.StatusNotFound, Response{Error: "User not found"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: user})
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	var updates struct {
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	user, err := h.userUsecase.GetByID(r.Context(), userID)
	if err != nil {
		h.respond(w, http.StatusNotFound, Response{Error: "User not found"})
		return
	}

	if updates.Name != "" {
		user.Name = updates.Name
	}
	if updates.AvatarURL != "" {
		user.AvatarURL = updates.AvatarURL
	}

	if err := h.userUsecase.Update(r.Context(), user); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to update user"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: user})
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	if err := h.userUsecase.Delete(r.Context(), userID); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to delete user"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true})
}

// Library handlers

func (h *Handler) GetLibrary(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	library, err := h.userUsecase.GetLibrary(r.Context(), userID)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to get library"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: library})
}

func (h *Handler) AddToLibrary(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	var input struct {
		NovelID string `json:"novel_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	if err := h.userUsecase.AddToLibrary(r.Context(), userID, input.NovelID); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to add to library"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true})
}

func (h *Handler) RemoveFromLibrary(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	novelID := r.URL.Query().Get("novel_id")
	if novelID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "novel_id is required"})
		return
	}

	if err := h.userUsecase.RemoveFromLibrary(r.Context(), userID, novelID); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to remove from library"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true})
}

// Terminology handlers

func (h *Handler) GetTerminology(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	terms, err := h.userUsecase.GetTerminology(r.Context(), userID)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to get terminology"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: terms})
}

func (h *Handler) AddTerminology(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		h.respond(w, http.StatusUnauthorized, Response{Error: "Unauthorized"})
		return
	}

	var term domain.UserTerminology
	if err := json.NewDecoder(r.Body).Decode(&term); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	term.UserID = userID
	if err := h.userUsecase.AddTerminology(r.Context(), &term); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to add terminology"})
		return
	}

	h.respond(w, http.StatusCreated, Response{Success: true, Data: term})
}

func (h *Handler) DeleteTerminology(w http.ResponseWriter, r *http.Request) {
	termID := r.URL.Query().Get("id")
	if termID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "id is required"})
		return
	}

	if err := h.userUsecase.DeleteTerminology(r.Context(), termID); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to delete terminology"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true})
}

// Novel handlers

func (h *Handler) ListNovels(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit == 0 {
		limit = 20
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	status := r.URL.Query().Get("status")

	novels, total, err := h.novelUsecase.ListNovels(r.Context(), limit, offset, status)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to list novels"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: map[string]interface{}{
		"novels": novels,
		"total":  total,
	}})
}

func (h *Handler) GetNovel(w http.ResponseWriter, r *http.Request) {
	novelID := r.URL.Query().Get("id")
	if novelID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "id is required"})
		return
	}

	novel, err := h.novelUsecase.GetNovel(r.Context(), novelID)
	if err != nil {
		h.respond(w, http.StatusNotFound, Response{Error: "Novel not found"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: novel})
}

func (h *Handler) ScrapeNovel(w http.ResponseWriter, r *http.Request) {
	var input struct {
		URL        string `json:"url"`
		SourceLang string `json:"source_lang"`
		TargetLang string `json:"target_lang"`
		NovelID    string `json:"novel_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	if input.URL == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "url is required"})
		return
	}

	if input.SourceLang == "" {
		input.SourceLang = "zh"
	}
	if input.TargetLang == "" {
		input.TargetLang = "th"
	}

	novelID, chaptersScraped, err := h.novelUsecase.ScrapeNovel(r.Context(), input.URL, input.SourceLang, input.TargetLang, input.NovelID)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: err.Error()})
		return
	}

	h.respond(w, http.StatusCreated, Response{Success: true, Data: map[string]interface{}{
		"novel_id":         novelID,
		"chapters_scraped": chaptersScraped,
	}})
}

// Chapter handlers

func (h *Handler) ListChapters(w http.ResponseWriter, r *http.Request) {
	novelID := r.URL.Query().Get("novel_id")
	if novelID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "novel_id is required"})
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit == 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	chapters, total, err := h.chapterUsecase.ListChapters(r.Context(), novelID, limit, offset)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to list chapters"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: map[string]interface{}{
		"chapters": chapters,
		"total":    total,
	}})
}

func (h *Handler) GetChapter(w http.ResponseWriter, r *http.Request) {
	chapterID := r.URL.Query().Get("id")
	if chapterID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "id is required"})
		return
	}

	chapter, err := h.chapterUsecase.GetChapter(r.Context(), chapterID)
	if err != nil {
		h.respond(w, http.StatusNotFound, Response{Error: "Chapter not found"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: chapter})
}

func (h *Handler) UpdateChapter(w http.ResponseWriter, r *http.Request) {
	chapterID := r.URL.Query().Get("id")
	if chapterID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "id is required"})
		return
	}

	var input struct {
		Title           *string `json:"title"`
		OriginalTitle   *string `json:"original_title"`
		SourceURL       *string `json:"source_url"`
		Content         *string `json:"content"`
		OriginalContent *string `json:"original_content"`
		WordCount       *int    `json:"word_count"`
		IsTranslated    *bool   `json:"is_translated"`
		IsScraped       *bool   `json:"is_scraped"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	chapter, err := h.chapterUsecase.GetChapter(r.Context(), chapterID)
	if err != nil || chapter == nil {
		h.respond(w, http.StatusNotFound, Response{Error: "Chapter not found"})
		return
	}

	if input.Title != nil {
		chapter.Title = *input.Title
	}
	if input.OriginalTitle != nil {
		chapter.OriginalTitle = *input.OriginalTitle
	}
	if input.SourceURL != nil {
		chapter.SourceURL = *input.SourceURL
	}
	if input.Content != nil {
		chapter.Content = *input.Content
	}
	if input.OriginalContent != nil {
		chapter.OriginalContent = *input.OriginalContent
	}
	if input.WordCount != nil {
		chapter.WordCount = *input.WordCount
	}
	if input.IsTranslated != nil {
		chapter.IsTranslated = *input.IsTranslated
	}
	if input.IsScraped != nil {
		chapter.IsScraped = *input.IsScraped
	}

	if err := h.chapterUsecase.UpdateChapter(r.Context(), chapter); err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to update chapter"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: chapter})
}

func (h *Handler) GetChapterByNumber(w http.ResponseWriter, r *http.Request) {
	novelID := r.URL.Query().Get("novel_id")
	if novelID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "novel_id is required"})
		return
	}

	chapterNumber, err := strconv.Atoi(r.URL.Query().Get("chapter_number"))
	if err != nil || chapterNumber == 0 {
		h.respond(w, http.StatusBadRequest, Response{Error: "valid chapter_number is required"})
		return
	}

	chapter, err := h.chapterUsecase.GetChapterByNumber(r.Context(), novelID, chapterNumber)
	if err != nil || chapter == nil {
		h.respond(w, http.StatusNotFound, Response{Error: "Chapter not found"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: chapter})
}

func (h *Handler) TranslateChapter(w http.ResponseWriter, r *http.Request) {
	chapterID := r.URL.Query().Get("id")
	if chapterID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "id is required"})
		return
	}

	var input struct {
		TargetLang     string `json:"target_lang"`
		UseContext     bool   `json:"use_context"`
		TranslatedText string `json:"translated_text"`
		ModelUsed      string `json:"model_used"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	if input.TargetLang == "" {
		input.TargetLang = "th"
	}

	// If translated_text is provided, save it directly (from frontend translation)
	if input.TranslatedText != "" {
		chapter, err := h.chapterUsecase.GetChapter(r.Context(), chapterID)
		if err != nil {
			h.respond(w, http.StatusInternalServerError, Response{Error: err.Error()})
			return
		}
		if chapter == nil {
			h.respond(w, http.StatusNotFound, Response{Error: "Chapter not found"})
			return
		}

		// Save the translated text directly
		chapter.Content = input.TranslatedText
		chapter.IsTranslated = true
		if err := h.chapterUsecase.SaveTranslatedContent(r.Context(), chapterID, input.TranslatedText); err != nil {
			h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to save translation"})
			return
		}

		h.respond(w, http.StatusOK, Response{Success: true, Data: chapter})
		return
	}

	// Otherwise, do server-side translation
	chapter, err := h.chapterUsecase.TranslateChapter(r.Context(), chapterID, input.TargetLang, input.UseContext)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: err.Error()})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: chapter})
}

// Translation History handlers

func (h *Handler) GetTranslationHistory(w http.ResponseWriter, r *http.Request) {
	novelID := r.URL.Query().Get("novel_id")
	chapterID := r.URL.Query().Get("chapter_id")

	if novelID != "" {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit == 0 {
			limit = 50
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		limit, offset = domain.NormalizePage(limit, offset, 50)

		histories, total, err := h.translationHistoryRepo.ListByNovelID(r.Context(), novelID, limit, offset)
		if err != nil {
			h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to get translation history"})
			return
		}

		h.respond(w, http.StatusOK, Response{Success: true, Data: map[string]interface{}{
			"histories": histories,
			"total":     total,
		}})
		return
	}

	if chapterID != "" {
		histories, err := h.translationHistoryRepo.GetByChapterID(r.Context(), chapterID)
		if err != nil {
			h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to get translation history"})
			return
		}

		h.respond(w, http.StatusOK, Response{Success: true, Data: map[string]interface{}{
			"histories": histories,
		}})
		return
	}

	h.respond(w, http.StatusBadRequest, Response{Error: "novel_id or chapter_id is required"})
}

func (h *Handler) GetCachedTranslation(w http.ResponseWriter, r *http.Request) {
	chapterID := r.URL.Query().Get("chapter_id")
	if chapterID == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "chapter_id is required"})
		return
	}

	history, err := h.translationHistoryRepo.GetLatestByChapterID(r.Context(), chapterID)
	if err != nil {
		h.respond(w, http.StatusInternalServerError, Response{Error: "Failed to get cached translation"})
		return
	}

	if history == nil {
		h.respond(w, http.StatusNotFound, Response{Error: "No cached translation found"})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: history})
}

// Auth middleware

func (h *Handler) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var tokenString string

		// Try Authorization header first (for API clients)
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// Fall back to HTTP-only cookie (for browser clients)
		if tokenString == "" {
			cookie, err := r.Cookie("auth_token")
			if err == nil {
				tokenString = cookie.Value
			}
		}

		if tokenString == "" {
			h.respond(w, http.StatusUnauthorized, Response{Error: "Authorization required"})
			return
		}

		claims, err := h.userUsecase.ValidateToken(tokenString)
		if err != nil {
			h.respond(w, http.StatusUnauthorized, Response{Error: "Invalid or expired token"})
			return
		}

		ctx := r.Context()
		ctx = contextWithUserID(ctx, claims.UserID)
		ctx = context.WithValue(ctx, claimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

// AdminMiddleware is AuthMiddleware plus an admin-role check against the
// current user record (so a demotion takes effect without a new token).
func (h *Handler) AdminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return h.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := GetUserIDFromContext(r.Context())
		if !ok {
			h.respond(w, http.StatusUnauthorized, Response{Error: "Authorization required"})
			return
		}
		user, err := h.userUsecase.GetByID(r.Context(), userID)
		if errors.Is(err, sql.ErrNoRows) {
			h.respond(w, http.StatusUnauthorized, Response{Error: "User not found"})
			return
		}
		if err != nil {
			log.Printf("[ERROR] admin check: user lookup failed: %v", err)
			h.respond(w, http.StatusServiceUnavailable, Response{Error: "Could not verify permissions"})
			return
		}
		if !user.IsAdmin() {
			h.respond(w, http.StatusForbidden, Response{Error: "Admin role required"})
			return
		}
		next(w, r)
	})
}

// Helper functions

func (h *Handler) respond(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func contextWithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, UserIDKey, userID)
}

// GetUserIDFromContext extracts the user ID AuthMiddleware stored. An empty
// ID counts as missing.
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok && userID != ""
}
