package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/usecase"
)

type contextKey string

const UserIDKey contextKey = "user_id"

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

	if input.Email == "" || input.Password == "" {
		h.respond(w, http.StatusBadRequest, Response{Error: "Email and password are required"})
		return
	}

	result, err := h.userUsecase.Register(r.Context(), input)
	if err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: err.Error()})
		return
	}

	h.respond(w, http.StatusCreated, Response{Success: true, Data: result})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var input usecase.LoginInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	result, err := h.userUsecase.Login(r.Context(), input)
	if err != nil {
		h.respond(w, http.StatusUnauthorized, Response{Error: err.Error()})
		return
	}

	h.respond(w, http.StatusOK, Response{Success: true, Data: result})
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
	userID, ok := r.Context().Value("userID").(string)
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
		TargetLang string `json:"target_lang"`
		UseContext bool   `json:"use_context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		h.respond(w, http.StatusBadRequest, Response{Error: "Invalid request body"})
		return
	}

	if input.TargetLang == "" {
		input.TargetLang = "th"
	}

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
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			h.respond(w, http.StatusUnauthorized, Response{Error: "Authorization header required"})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := h.userUsecase.ValidateToken(tokenString)
		if err != nil {
			h.respond(w, http.StatusUnauthorized, Response{Error: "Invalid token"})
			return
		}

		ctx := r.Context()
		ctx = contextWithUserID(ctx, claims.UserID)
		next(w, r.WithContext(ctx))
	}
}

// Helper functions

func (h *Handler) respond(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

type ctxKey string

func contextWithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, ctxKey("userID"), userID)
}

// GetUserIDFromContext extracts user ID from context
func GetUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(UserIDKey).(string)
	return userID, ok
}
