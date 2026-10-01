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
	BillingPlans               BillingPlans
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

	// ADMIN_USER_IDS promotes already-registered accounts (by ID, never by
	// email: registration does not verify email ownership) to admin.
	if db != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		BootstrapAdmins(ctx, userRepo, os.Getenv)
		cancel()
	}

	// Initialize AI client
	aiServiceURL := os.Getenv("AI_SERVICE_URL")
	if aiServiceURL == "" {
		aiServiceURL = "http://localhost:8000"
	}
	// AI_SERVICE_TOKEN is the optional shared secret ai-service checks.
	aiClient := aiservice.NewAIServiceClient(aiServiceURL, os.Getenv("AI_SERVICE_TOKEN"))

	// Initialize usecases
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("FATAL: JWT_SECRET environment variable is required")
	}
	// Billing: Stripe Price IDs come from STRIPE_PRICE_*; a broken billing
	// configuration fails fast instead of failing at the first checkout.
	billingPlans, err := LoadBillingPlansFromEnv()
	if err != nil {
		log.Fatalf("FATAL: invalid billing configuration: %v", err)
	}
	if !billingPlans.Enabled() {
		log.Println("[INFO] billing disabled: STRIPE_SECRET_KEY and STRIPE_PRICE_* are not set")
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
		BillingPlans:               billingPlans,
	}
}

// Server is the HTTP server with injected dependencies
type Server struct {
	server *http.Server
	deps   *ServerDependencies
	routes []string // every registered mux pattern, for the route-access test
}

// routeMux is an http.ServeMux that remembers the patterns registered on it,
// so routes_access_test.go can walk the real route table and fail on any
// route that has no declared access level.
type routeMux struct {
	*http.ServeMux
	patterns []string
}

func (m *routeMux) Handle(pattern string, h http.Handler) {
	m.patterns = append(m.patterns, pattern)
	m.ServeMux.Handle(pattern, h)
}

func (m *routeMux) HandleFunc(pattern string, f func(http.ResponseWriter, *http.Request)) {
	m.Handle(pattern, http.HandlerFunc(f))
}

// postOnly serves next for POST and answers 405 otherwise.
func postOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		next(w, r)
	}
}

// readOnly serves next for GET (and HEAD) and answers 405 otherwise: public
// catalog reads must never accept a state-changing method.
func readOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		next(w, r)
	}
}

// NewServerWithDeps creates a new HTTP server with injected dependencies
func NewServerWithDeps(deps *ServerDependencies, port string) *Server {
	// Initialize handlers with shared dependencies
	h := NewHandlerWithDeps(deps)

	// Setup routes. Access levels (public / authenticated / admin) are pinned
	// per route and method by routes_access_test.go: a new route fails CI
	// until it is classified there.
	mux := &routeMux{ServeMux: http.NewServeMux()}

	// Auth routes (public) - with stricter auth rate limiting (5 req/min)
	mux.Handle("/api/auth/register", middleware.AuthRateLimitMiddleware(postOnly(h.Register)))
	mux.Handle("/api/auth/login", middleware.AuthRateLimitMiddleware(postOnly(h.Login)))
	mux.HandleFunc("/api/auth/logout", postOnly(h.Logout)) // clears the caller's own cookie only
	mux.HandleFunc("/api/auth/refresh", h.AuthMiddleware(h.Refresh))

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

	// Novel routes: catalog reads are public. Adding or re-scraping a novel
	// fetches an arbitrary URL server-side and writes the shared catalog, and
	// no per-user copy exists, so it is admin-only.
	mux.HandleFunc("/api/novels", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.ListNovels(w, r)
		case http.MethodPost:
			h.AdminMiddleware(h.ScrapeNovel)(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/novels/detail", readOnly(h.GetNovel))

	// Chapter routes: reads are public; chapter text is shared by every
	// reader, so overwriting it is admin-only.
	mux.HandleFunc("/api/chapters", readOnly(h.ListChapters))
	mux.HandleFunc("/api/chapters/detail", readOnly(h.GetChapter))
	mux.HandleFunc("/api/chapters/by-number", readOnly(h.GetChapterByNumber))
	mux.HandleFunc("/api/chapters/update", h.AdminMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodPut {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.UpdateChapter(w, r)
	}))
	// Chapter translation - with stricter rate limiting (10 req/min). A signed-in
	// user may run the server-side translation (the AI writes the shared cache
	// once); saving caller-supplied translated_text is admin-only (checked in
	// TranslateChapter).
	mux.Handle("/api/chapters/translate", middleware.TranslationRateLimitMiddleware(h.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			h.TranslateChapter(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Translation history routes (public for reading) - with stricter rate limiting (10 req/min)
	mux.Handle("/api/translations/history", middleware.TranslationRateLimitMiddleware(readOnly(h.GetTranslationHistory)))
	mux.Handle("/api/translations/cached", middleware.TranslationRateLimitMiddleware(readOnly(h.GetCachedTranslation)))

	// Novel subscription routes (protected)
	mux.Handle("/api/subscriptions", h.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	})))
	// Runs the update check for every user's due subscriptions: admin only.
	mux.Handle("/api/subscriptions/trigger-update", h.AdminMiddleware(h.TriggerUpdate))
	mux.Handle("/api/subscriptions/history", h.AuthMiddleware(http.HandlerFunc(h.GetUpdateHistory)))

	// Reading progress routes (protected)
	mux.Handle("/api/reading-progress", h.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetReadingProgress(w, r)
		case http.MethodPost:
			h.SaveReadingProgress(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})))
	mux.Handle("/api/reading-progress/novel", h.AuthMiddleware(http.HandlerFunc(h.GetNovelProgress)))

	// Bookmark routes (protected)
	mux.Handle("/api/bookmarks", h.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
	})))
	mux.Handle("/api/bookmarks/novel", h.AuthMiddleware(http.HandlerFunc(h.GetNovelBookmarks)))

	// Translation feedback routes (protected) - with stricter rate limiting (10 req/min)
	mux.Handle("/api/feedback", middleware.TranslationRateLimitMiddleware(h.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetFeedback(w, r)
		case http.MethodPost:
			h.SubmitFeedback(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))))
	mux.Handle("/api/feedback/chapter", middleware.TranslationRateLimitMiddleware(h.AuthMiddleware(http.HandlerFunc(h.GetChapterFeedback))))
	mux.Handle("/api/feedback/quality-score", middleware.TranslationRateLimitMiddleware(h.AuthMiddleware(http.HandlerFunc(h.GetChapterQualityScore))))

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

	// Payment routes
	paymentHandler := NewPaymentHandlerWithPlans(deps.UserRepo, deps.BillingPlans)
	mux.HandleFunc("/api/payments/stripe/webhook", postOnly(paymentHandler.HandleWebhook)) // Stripe-signed, no session
	mux.HandleFunc("/api/payments/plans", h.AuthMiddleware(paymentHandler.GetPricingPlans))
	mux.HandleFunc("/api/payments/stripe/checkout", h.AuthMiddleware(paymentHandler.CreateCheckoutSession))
	mux.HandleFunc("/api/payments/stripe/billing-portal", h.AuthMiddleware(paymentHandler.CreateBillingPortal))
	mux.HandleFunc("/api/payments/stripe/cancel", h.AuthMiddleware(paymentHandler.CancelSubscription))
	mux.HandleFunc("/api/payments/subscription", h.AuthMiddleware(paymentHandler.GetSubscriptionStatus))

	// ai-service proxy: the browser calls /api/ai/<allow-listed path> with its
	// session; the backend forwards with AI_SERVICE_TOKEN via the aiservice client.
	mux.Handle(AIProxyPrefix+"/", NewAIProxyHandler(deps.AIClient, h.AuthMiddleware, h.AdminMiddleware))

	// Health check (basic - just checks if server is running)
	mux.HandleFunc("/api/health", readOnly(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"healthy","service":"backend","version":"1.0.0"}`))
	}))

	// Ready check (for Kubernetes/Docker) - checks all dependencies
	mux.HandleFunc("/api/ready", readOnly(func(w http.ResponseWriter, r *http.Request) {
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
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"status":  "not ready",
				"db":      "down",
				"service": "backend",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}))

	// Detailed health check with all dependencies
	mux.HandleFunc("/api/health/detailed", readOnly(func(w http.ResponseWriter, r *http.Request) {
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
		_ = json.NewEncoder(w).Encode(resp)
	}))

	// CORS + Rate Limiting middleware
	handler := middleware.ApplyRateLimiting(corsMiddleware(mux))

	cfg, err := LoadServerConfig(os.Getenv)
	if err != nil {
		log.Fatalf("FATAL: invalid HTTP server configuration: %v", err)
	}
	return &Server{server: newHTTPServer(":"+port, handler, cfg), deps: deps, routes: mux.patterns}
}

// newHTTPServer applies cfg's limits to an http.Server.
func newHTTPServer(addr string, handler http.Handler, cfg ServerConfig) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
		MaxHeaderBytes:    cfg.MaxHeaderBytes,
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
		// Set security headers on ALL responses
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

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
