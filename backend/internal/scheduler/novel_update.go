package scheduler

import (
	"context"
	"log"
	"time"

	"github.com/bookreading/backend/internal/usecase"
)

// NovelUpdateScheduler handles periodic novel update checks
type NovelUpdateScheduler struct {
	updateUseCase *usecase.NovelUpdateUseCase
	interval      time.Duration
	stopChan      chan struct{}
	isRunning     bool
}

// NewNovelUpdateScheduler creates a new scheduler
func NewNovelUpdateScheduler(updateUseCase *usecase.NovelUpdateUseCase, intervalMinutes int) *NovelUpdateScheduler {
	return &NovelUpdateScheduler{
		updateUseCase: updateUseCase,
		interval:      time.Duration(intervalMinutes) * time.Minute,
		stopChan:      make(chan struct{}),
		isRunning:     false,
	}
}

// Start begins the scheduled update loop
func (s *NovelUpdateScheduler) Start() {
	if s.isRunning {
		log.Println("Novel update scheduler is already running")
		return
	}

	s.isRunning = true
	log.Printf("Novel update scheduler started (interval: %v)", s.interval)

	go s.run()
}

// Stop stops the scheduled updates
func (s *NovelUpdateScheduler) Stop() {
	if !s.isRunning {
		return
	}

	log.Println("Stopping novel update scheduler...")
	close(s.stopChan)
	s.isRunning = false
}

func (s *NovelUpdateScheduler) run() {
	// Run immediately on start
	s.runUpdates()

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.runUpdates()
		case <-s.stopChan:
			log.Println("Novel update scheduler stopped")
			return
		}
	}
}

func (s *NovelUpdateScheduler) runUpdates() {
	ctx := context.Background()
	successCount, errorCount := s.updateUseCase.RunScheduledUpdates(ctx)

	if errorCount > 0 {
		log.Printf("Novel update run completed: %d success, %d errors", successCount, errorCount)
	} else {
		log.Printf("Novel update run completed: %d novels updated", successCount)
	}
}

// TriggerManual triggers an immediate update cycle
func (s *NovelUpdateScheduler) TriggerManual() {
	log.Println("Triggering manual novel update...")
	go s.runUpdates()
}

// IsRunning returns whether the scheduler is active
func (s *NovelUpdateScheduler) IsRunning() bool {
	return s.isRunning
}
