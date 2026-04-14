package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	grpcHandler "github.com/bookreading/backend/internal/delivery/grpc"
	"github.com/bookreading/backend/internal/delivery/grpc/pb"
	httpServer "github.com/bookreading/backend/internal/delivery/http"
	"github.com/bookreading/backend/internal/domain"
	"github.com/bookreading/backend/internal/scheduler"
	usecaseImpl "github.com/bookreading/backend/internal/usecase"

	_ "github.com/lib/pq"
	"github.com/jmoiron/sqlx"
	"google.golang.org/grpc"
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
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Connected to database successfully")

	// Create shared dependencies (single source of truth)
	deps := httpServer.NewServerDependencies(db)

	// Initialize use cases for gRPC (using same repositories from deps)
	var novelUseCase domain.NovelUseCase = deps.NovelUsecase
	var chapterUseCase domain.ChapterUseCase = deps.ChapterUsecase
	var terminologyUseCase domain.TerminologyUseCase = usecaseImpl.NewTerminologyUseCase(deps.TerminologyRepo, deps.NovelRepo)

	// Start HTTP server with shared dependencies
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

	// Create gRPC server with SAME dependencies
	grpcHandler := grpcHandler.NewBookReadingServer(novelUseCase, chapterUseCase, terminologyUseCase)

	// Start gRPC server
	lis, err := net.Listen("tcp", ":9090")
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServerImpl := grpc.NewServer()
	pb.RegisterBookReadingServiceServer(grpcServerImpl, grpcHandler)

	go func() {
		log.Println("Starting gRPC server on :9090")
		if err := grpcServerImpl.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down servers...")

	// Shutdown HTTP server
	if err := httpSrv.Shutdown(context.Background()); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	// Shutdown gRPC server
	grpcServerImpl.GracefulStop()

	log.Println("Servers stopped")
}
