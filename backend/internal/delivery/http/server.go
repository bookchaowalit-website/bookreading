package http

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/bookreading/backend/internal/infrastructure/aiservice"
	"github.com/bookreading/backend/internal/repository/postgres"
	"github.com/bookreading/backend/internal/usecase"
	"github.com/jmoiron/sqlx"
)

type Server struct {
	server *http.Server
}

func NewServer(db *sqlx.DB, port string) *Server {
	// Initialize repositories
	userRepo := postgres.NewUserRepository(db)
	libraryRepo := postgres.NewUserLibraryRepository(db)
	termRepo := postgres.NewUserTerminologyRepository(db)
	novelRepo := postgres.NewNovelRepository(db)
	chapterRepo := postgres.NewChapterRepository(db)
	terminologyRepo := postgres.NewTerminologyRepository(db)
	translationHistRepo := postgres.NewTranslationHistoryRepository(db)

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

	// Initialize handlers
	h := NewHandler(userUsecase, novelUsecase, chapterUsecase, translationHistRepo)

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

	// Health check
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// CORS middleware
	handler := corsMiddleware(mux)

	return &Server{
		server: &http.Server{
			Addr:    ":" + port,
			Handler: handler,
		},
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

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
