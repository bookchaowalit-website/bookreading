package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	httpServer "github.com/bookreading/backend/internal/delivery/http"
	"github.com/bookreading/backend/internal/scheduler"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	// Get configuration from environment
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable"
	}

	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	// Connect to database
	db, err := sqlx.Connect("postgres", databaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer func() { _ = db.Close() }()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Connected to database successfully")

	// Create shared dependencies (single source of truth)
	deps := httpServer.NewServerDependencies(db)

	// HTTP is the live auth/API surface. gRPC proto stubs are not generated
	// in this checkout, so the local reader stack starts HTTP only.
	httpSrv := httpServer.NewServerWithDeps(deps, httpPort)
	go func() {
		if err := httpSrv.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()
	log.Printf("HTTP server started on :%s", httpPort)

	// Start novel update scheduler
	updateIntervalMinutes := 60 // Check every hour
	novelScheduler := scheduler.NewNovelUpdateScheduler(deps.NovelUpdateUseCase, updateIntervalMinutes)
	novelScheduler.Start()
	defer novelScheduler.Stop()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down servers...")

	if err := httpSrv.Shutdown(context.Background()); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	log.Println("Servers stopped")
}
