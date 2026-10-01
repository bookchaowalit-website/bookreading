package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/usecase"
)

// ============================================
// Reading Progress Handlers
// ============================================

// SaveReadingProgress handles POST /api/reading-progress
func (h *Handler) SaveReadingProgress(w http.ResponseWriter, r *http.Request) {
	if h.readingProgressUseCase == nil {
		InternalServerError(w, nil, "Reading progress feature not available")
		return
	}

	var req struct {
		NovelID            string  `json:"novel_id"`
		ChapterNumber      int     `json:"chapter_number"`
		ProgressPercentage float64 `json:"progress_percentage"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, err, "Invalid request body")
		return
	}

	// Get user ID from context (set by auth middleware)
	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	progress, err := h.readingProgressUseCase.SaveProgress(
		r.Context(),
		userID,
		req.NovelID,
		req.ChapterNumber,
		req.ProgressPercentage,
	)
	if err != nil {
		InternalServerError(w, err, "Failed to save reading progress")
		return
	}

	WriteJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data:    progress,
	})
}

// GetReadingProgress handles GET /api/reading-progress
func (h *Handler) GetReadingProgress(w http.ResponseWriter, r *http.Request) {
	if h.readingProgressUseCase == nil {
		InternalServerError(w, nil, "Reading progress feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	progress, err := h.readingProgressUseCase.GetProgress(r.Context(), userID)
	if err != nil {
		InternalServerError(w, err, "Failed to get reading progress")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    progress,
	})
}

// GetNovelProgress handles GET /api/reading-progress/novel
func (h *Handler) GetNovelProgress(w http.ResponseWriter, r *http.Request) {
	if h.readingProgressUseCase == nil {
		InternalServerError(w, nil, "Reading progress feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}
	novelID := r.URL.Query().Get("novel_id")
	if novelID == "" {
		BadRequest(w, nil, "novel_id is required")
		return
	}

	progress, err := h.readingProgressUseCase.GetNovelProgress(r.Context(), userID, novelID)
	if err != nil {
		InternalServerError(w, err, "Failed to get novel progress")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    progress,
	})
}

// ============================================
// Bookmark Handlers
// ============================================

// AddBookmark handles POST /api/bookmarks
func (h *Handler) AddBookmark(w http.ResponseWriter, r *http.Request) {
	if h.bookmarkUseCase == nil {
		InternalServerError(w, nil, "Bookmark feature not available")
		return
	}

	var req struct {
		NovelID       string  `json:"novel_id"`
		ChapterNumber int     `json:"chapter_number"`
		Position      int     `json:"position"`
		Note          *string `json:"note"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, err, "Invalid request body")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	bookmark, err := h.bookmarkUseCase.AddBookmark(
		r.Context(),
		userID,
		req.NovelID,
		req.ChapterNumber,
		req.Position,
		req.Note,
	)
	if err != nil {
		InternalServerError(w, err, "Failed to add bookmark")
		return
	}

	WriteJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data:    bookmark,
	})
}

// GetBookmarks handles GET /api/bookmarks
func (h *Handler) GetBookmarks(w http.ResponseWriter, r *http.Request) {
	if h.bookmarkUseCase == nil {
		InternalServerError(w, nil, "Bookmark feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	bookmarks, err := h.bookmarkUseCase.GetBookmarks(r.Context(), userID)
	if err != nil {
		InternalServerError(w, err, "Failed to get bookmarks")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    bookmarks,
	})
}

// GetNovelBookmarks handles GET /api/bookmarks/novel
func (h *Handler) GetNovelBookmarks(w http.ResponseWriter, r *http.Request) {
	if h.bookmarkUseCase == nil {
		InternalServerError(w, nil, "Bookmark feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}
	novelID := r.URL.Query().Get("novel_id")
	if novelID == "" {
		BadRequest(w, nil, "novel_id is required")
		return
	}

	bookmarks, err := h.bookmarkUseCase.GetNovelBookmarks(r.Context(), userID, novelID)
	if err != nil {
		InternalServerError(w, err, "Failed to get novel bookmarks")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    bookmarks,
	})
}

// RemoveBookmark handles DELETE /api/bookmarks
func (h *Handler) RemoveBookmark(w http.ResponseWriter, r *http.Request) {
	if h.bookmarkUseCase == nil {
		InternalServerError(w, nil, "Bookmark feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	bookmarkID := r.URL.Query().Get("id")
	if bookmarkID == "" {
		BadRequest(w, nil, "id is required")
		return
	}

	if err := h.bookmarkUseCase.RemoveBookmark(r.Context(), userID, bookmarkID); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w, "Bookmark not found")
			return
		}
		InternalServerError(w, err, "Failed to remove bookmark")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    map[string]string{"message": "Bookmark removed successfully"},
	})
}

// ============================================
// Translation Feedback Handlers
// ============================================

// SubmitFeedback handles POST /api/feedback
func (h *Handler) SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	if h.translationFeedbackUseCase == nil {
		InternalServerError(w, nil, "Translation feedback feature not available")
		return
	}

	var req usecase.SubmitFeedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, err, "Invalid request body")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	feedback, err := h.translationFeedbackUseCase.SubmitFeedback(r.Context(), userID, req)
	if err != nil {
		InternalServerError(w, err, "Failed to submit feedback")
		return
	}

	WriteJSON(w, http.StatusCreated, SuccessResponse{
		Success: true,
		Data:    feedback,
	})
}

// GetFeedback handles GET /api/feedback
func (h *Handler) GetFeedback(w http.ResponseWriter, r *http.Request) {
	if h.translationFeedbackUseCase == nil {
		InternalServerError(w, nil, "Translation feedback feature not available")
		return
	}

	userID, ok := sessionUserID(w, r)
	if !ok {
		return
	}

	feedback, err := h.translationFeedbackUseCase.GetUserFeedback(r.Context(), userID)
	if err != nil {
		InternalServerError(w, err, "Failed to get feedback")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    feedback,
	})
}

// GetChapterFeedback handles GET /api/feedback/chapter
func (h *Handler) GetChapterFeedback(w http.ResponseWriter, r *http.Request) {
	if h.translationFeedbackUseCase == nil {
		InternalServerError(w, nil, "Translation feedback feature not available")
		return
	}

	novelID := r.URL.Query().Get("novel_id")
	chapterStr := r.URL.Query().Get("chapter_number")

	if novelID == "" || chapterStr == "" {
		BadRequest(w, nil, "novel_id and chapter_number are required")
		return
	}

	chapterNumber, err := strconv.Atoi(chapterStr)
	if err != nil {
		BadRequest(w, err, "chapter_number must be a number")
		return
	}

	feedback, err := h.translationFeedbackUseCase.GetChapterFeedback(r.Context(), novelID, chapterNumber)
	if err != nil {
		InternalServerError(w, err, "Failed to get chapter feedback")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    feedback,
	})
}

// GetChapterQualityScore handles GET /api/feedback/quality-score
func (h *Handler) GetChapterQualityScore(w http.ResponseWriter, r *http.Request) {
	if h.translationFeedbackUseCase == nil {
		InternalServerError(w, nil, "Translation feedback feature not available")
		return
	}

	novelID := r.URL.Query().Get("novel_id")
	chapterStr := r.URL.Query().Get("chapter_number")

	if novelID == "" || chapterStr == "" {
		BadRequest(w, nil, "novel_id and chapter_number are required")
		return
	}

	chapterNumber, err := strconv.Atoi(chapterStr)
	if err != nil {
		BadRequest(w, err, "chapter_number must be a number")
		return
	}

	score, err := h.translationFeedbackUseCase.GetQualityScore(r.Context(), novelID, chapterNumber)
	if err != nil {
		InternalServerError(w, err, "Failed to get quality score")
		return
	}

	WriteJSON(w, http.StatusOK, SuccessResponse{
		Success: true,
		Data:    score,
	})
}
