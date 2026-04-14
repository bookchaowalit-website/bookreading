package http

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/infrastructure/aiservice"
	"github.com/bookreading/backend/internal/middleware"
	"github.com/bookreading/backend/internal/repository/postgres"
	"github.com/bookreading/backend/internal/usecase"
	"github.com/jmoiron/sqlx"
)

// ServerDependencies holds all shared dependencies
type ServerDependencies struct {
	DB                         *sqlx.DB
	UserRepo                   domain.UserRepository
	LibraryRepo                domain.UserLibraryRepository
	TermRepo                   domain.UserTerminologyRepository
	NovelRepo                  domain.NovelRepository
	ChapterRepo                domain.ChapterRepository
	TerminologyRepo            domain.TerminologyRepository
	TranslationHistRepo        domain.TranslationHistoryRepository
	SubRepo                    domain.NovelSubscriptionRepository
	HistRepo                   domain.NovelUpdateHistoryRepository
	ReadingProgressRepo        domain.ReadingProgressRepository
	BookmarkRepo               domain.BookmarkRepository
	TranslationFeedbackRepo    domain.TranslationFeedbackRepository
	APIKeyRepo                 domain.APIKeyRepository
	AIClient                   aiservice.AIServiceClient
	UserUsecase                *usecase.UserUsecase
	NovelUsecase               domain.NovelUseCase
	ChapterUsecase             domain.ChapterUseCase
	NovelUpdateUseCase         *usecase.NovelUpdateUseCase
	ReadingProgressUseCase     *usecase.ReadingProgressUseCase
	BookmarkUseCase            *usecase.BookmarkUseCase
	TranslationFeedbackUseCase *usecase.TranslationFeedbackUseCase
	APIKeyUseCase              *usecase.APIKeyUseCase
}

// NewServerDependencies creates shared dependencies from environment and database
func NewServerDependencies(db *sqlx.DB) *ServerDependencies {
	// Initialize repositories
	userRepo := postgres.NewUserRepository(db)
	libraryRepo := postgres.NewUserLibraryRepository(db)
	termRepo := postgres.NewUserTerminologyRepository(db)
	novelRepo := postgres.NewNovelRepository(db)
	chapterRepo := postgres.NewChapterRepository(db)
	terminologyRepo := postgres.NewTerminologyRepository(db)
	translationHistRepo := postgres.NewTranslationHistoryRepository(db)
	subRepo := postgres.NewNovelSubscriptionRepository(db)
	histRepo := postgres.NewNovelUpdateHistoryRepository(db)
	readingProgressRepo := postgres.NewReadingProgressRepository(db)
	bookmarkRepo := postgres.NewBookmarkRepository(db)
	translationFeedbackRepo := postgres.NewTranslationFeedbackRepository(db)
	apiKeyRepo := postgres.NewAPIKeyRepository(db)

	// Initialize AI client
	aiServiceURL := os.Getenv("AI_SERVICE_URL")
	if aiServiceURL == "" {
		aiServiceURL = "http://localhost:8000"
	}
	aiClient := aiservice.NewAIServiceClient(aiServiceURL)

	// Initialize usecases
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "your-secret-key-change-in-production"
	}
	userUsecase := usecase.NewUserUsecase(userRepo, libraryRepo, termRepo, jwtSecret)
	novelUsecase := usecase.NewNovelUseCase(novelRepo, chapterRepo, terminologyRepo, aiClient)
	chapterUsecase := usecase.NewChapterUseCase(chapterRepo, terminologyRepo, translationHistRepo, aiClient)

	// Initialize novel update usecase (requires novelUC and chapterUC for saving new chapters)
	novelUpdateUseCase := usecase.NewNovelUpdateUseCase(subRepo, histRepo, novelUsecase, chapterUsecase)

	// Initialize reading progress usecase
	readingProgressUseCase := usecase.NewReadingProgressUseCase(readingProgressRepo, bookmarkRepo)

	// Initialize bookmark usecase
	bookmarkUseCase := usecase.NewBookmarkUseCase(bookmarkRepo)

	// Initialize translation feedback usecase
	translationFeedbackUseCase := usecase.NewTranslationFeedbackUseCase(translationFeedbackRepo)

	// Initialize API key usecase
	apiKeyUseCase := usecase.NewAPIKeyUseCase(apiKeyRepo)

	return &ServerDependencies{
		DB:                         db,
		UserRepo:                   userRepo,
		LibraryRepo:                libraryRepo,
		TermRepo:                   termRepo,
		NovelRepo:                  novelRepo,
		ChapterRepo:                chapterRepo,
		TerminologyRepo:            terminologyRepo,
		TranslationHistRepo:        translationHistRepo,
		SubRepo:                    subRepo,
		HistRepo:                   histRepo,
		ReadingProgressRepo:        readingProgressRepo,
		BookmarkRepo:               bookmarkRepo,
		TranslationFeedbackRepo:    translationFeedbackRepo,
		APIKeyRepo:                 apiKeyRepo,
		AIClient:                   aiClient,
		UserUsecase:                userUsecase,
		NovelUsecase:               novelUsecase,
		ChapterUsecase:             chapterUsecase,
		NovelUpdateUseCase:         novelUpdateUseCase,
		ReadingProgressUseCase:     readingProgressUseCase,
		BookmarkUseCase:            bookmarkUseCase,
		TranslationFeedbackUseCase: translationFeedbackUseCase,
		APIKeyUseCase:              apiKeyUseCase,
	}
}

// Server is the HTTP server with injected dependencies
type Server struct {
	server *http.Server
	deps   *ServerDependencies
}

// NewServerWithDeps creates a new HTTP server with injected dependencies
func NewServerWithDeps(deps *ServerDependencies, port string) *Server {
	// Initialize handlers with shared dependencies
	h := NewHandlerWithDeps(deps)

	// Setup routes
	mux := http.NewServeMux()

	// Auth routes (public)
	mux.HandleFunc("/api/auth/register", h.Register)
	mux.HandleFunc("/api/auth/login", h.Login)

	// Protected routes
	mux.HandleFunc("/api/users/me", h.AuthMiddleware(h.GetMe))
	mux.HandleFunc("/api/users/me/update", h.AuthMiddleware(h.UpdateUser))
	mux.HandleFunc("/api/users/me/delete", h.AuthMiddleware(h.DeleteUser))

	// Library routes
	mux.HandleFunc("/api/library", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.AuthMiddleware(h.GetLibrary)(w, r)
		case http.MethodPost:
			h.AuthMiddleware(h.AddToLibrary)(w, r)
		case http.MethodDelete:
			h.AuthMiddleware(h.RemoveFromLibrary)(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Terminology routes
	mux.HandleFunc("/api/terminology", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.AuthMiddleware(h.GetTerminology)(w, r)
		case http.MethodPost:
			h.AuthMiddleware(h.AddTerminology)(w, r)
		case http.MethodDelete:
			h.AuthMiddleware(h.DeleteTerminology)(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Novel routes (public for reading)
	mux.HandleFunc("/api/novels", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.ListNovels(w, r)
		case http.MethodPost:
			h.ScrapeNovel(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/novels/detail", h.GetNovel)

	// Chapter routes (public for reading)
	mux.HandleFunc("/api/chapters", h.ListChapters)
	mux.HandleFunc("/api/chapters/detail", h.GetChapter)
	mux.HandleFunc("/api/chapters/by-number", h.GetChapterByNumber)
	mux.HandleFunc("/api/chapters/translate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.TranslateChapter(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Translation history routes (public for reading)
	mux.HandleFunc("/api/translations/history", h.GetTranslationHistory)
	mux.HandleFunc("/api/translations/cached", h.GetCachedTranslation)

	// Novel subscription routes
	mux.HandleFunc("/api/subscriptions", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetSubscriptions(w, r)
		case http.MethodPost:
			h.Subscribe(w, r)
		case http.MethodDelete:
			h.Unsubscribe(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/subscriptions/trigger-update", h.TriggerUpdate)
	mux.HandleFunc("/api/subscriptions/history", h.GetUpdateHistory)

	// Reading progress routes
	mux.HandleFunc("/api/reading-progress", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetReadingProgress(w, r)
		case http.MethodPost:
			h.SaveReadingProgress(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/reading-progress/novel", h.GetNovelProgress)

	// Bookmark routes
	mux.HandleFunc("/api/bookmarks", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetBookmarks(w, r)
		case http.MethodPost:
			h.AddBookmark(w, r)
		case http.MethodDelete:
			h.RemoveBookmark(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/bookmarks/novel", h.GetNovelBookmarks)

	// Translation feedback routes
	mux.HandleFunc("/api/feedback", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetFeedback(w, r)
		case http.MethodPost:
			h.SubmitFeedback(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/feedback/chapter", h.GetChapterFeedback)
	mux.HandleFunc("/api/feedback/quality-score", h.GetChapterQualityScore)

	// API Key management routes (authenticated)
	mux.HandleFunc("/api/settings/api-keys", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.AuthMiddleware(h.GetAPIKeyPrefixes)(w, r)
		case http.MethodPost:
			h.AuthMiddleware(h.SaveAPIKey)(w, r)
		case http.MethodDelete:
			h.AuthMiddleware(h.DeleteAPIKey)(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Payment routes (TODO: implement PaymentWebhook handler)
	// mux.HandleFunc("/api/payments/stripe/webhook", h.PaymentWebhook)

	// Health check (basic - just checks if server is running)
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy","service":"backend","version":"1.0.0"}`))
	})

	// Ready check (for Kubernetes/Docker) - checks all dependencies
	mux.HandleFunc("/api/ready", func(w http.ResponseWriter, r *http.Request) {
		// Check database
		dbStatus := "up"
		if err := deps.DB.Ping(); err != nil {
			dbStatus = "down"
		}

		// Build response
		type HealthResponse struct {
			Status  string `json:"status"`
			DB      string `json:"db"`
			Service string `json:"service"`
		}

		resp := HealthResponse{
			Status:  "ready",
			DB:      dbStatus,
			Service: "backend",
		}

		if dbStatus == "down" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status":  "not ready",
				"db":      "down",
				"service": "backend",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	})

	// Detailed health check with all dependencies
	mux.HandleFunc("/api/health/detailed", func(w http.ResponseWriter, r *http.Request) {
		type DependencyHealth struct {
			Status    string `json:"status"`
			LatencyMs int    `json:"latency_ms,omitempty"`
		}

		type DetailedHealthResponse struct {
			Status       string                      `json:"status"`
			Dependencies map[string]DependencyHealth `json:"dependencies"`
		}

		resp := DetailedHealthResponse{
			Status:       "healthy",
			Dependencies: make(map[string]DependencyHealth),
		}

		// Check database
		start := time.Now()
		if err := deps.DB.Ping(); err != nil {
			resp.Dependencies["database"] = DependencyHealth{Status: "down"}
			resp.Status = "degraded"
		} else {
			resp.Dependencies["database"] = DependencyHealth{
				Status:    "up",
				LatencyMs: int(time.Since(start).Milliseconds()),
			}
		}

		if resp.Status == "healthy" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPartialContent)
		}
		json.NewEncoder(w).Encode(resp)
	})

	// CORS + Rate Limiting middleware
	handler := middleware.ApplyRateLimiting(corsMiddleware(mux))

	return &Server{
		server: &http.Server{
			Addr:    ":" + port,
			Handler: handler,
		},
		deps: deps,
	}
}

// NewServer creates a new HTTP server (backward compatible)
func NewServer(db *sqlx.DB, port string) *Server {
	deps := NewServerDependencies(db)
	return NewServerWithDeps(deps, port)
}

func corsMiddleware(next http.Handler) http.Handler {
	// Get allowed origins from environment variable
	allowedOriginsStr := os.Getenv("ALLOWED_ORIGINS")
	if allowedOriginsStr == "" {
		allowedOriginsStr = "http://localhost:3000"
	}

	// Split comma-separated origins
	allowedOrigins := strings.Split(allowedOriginsStr, ",")
	for i, origin := range allowedOrigins {
		allowedOrigins[i] = strings.TrimSpace(origin)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Check if origin is allowed
		allowed := false
		for _, allowedOrigin := range allowedOrigins {
			if origin == allowedOrigin {
				allowed = true
				break
			}
		}

		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			// For development, allow all if no specific origins configured
			if len(allowedOrigins) == 1 && allowedOrigins[0] == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) Start() error {
	log.Printf("HTTP server starting on %s", s.server.Addr)
	return s.server.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("HTTP server shutting down...")
	return s.server.Shutdown(ctx)
}

// Dependencies returns the server dependencies
func (s *Server) Dependencies() *ServerDependencies {
	return s.deps
}
