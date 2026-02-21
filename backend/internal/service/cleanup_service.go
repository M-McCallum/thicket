package service

import (
	"context"
	"log"
	"time"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
)

type CleanupService struct {
	queries *models.Queries
	storage storage.ObjectStorage
	done    chan struct{}
}

func NewCleanupService(q *models.Queries, sc storage.ObjectStorage) *CleanupService {
	return &CleanupService{
		queries: q,
		storage: sc,
		done:    make(chan struct{}),
	}
}

// Start begins the daily cleanup goroutine.
func (s *CleanupService) Start() {
	go s.run()
}

// Stop signals the cleanup goroutine to stop.
func (s *CleanupService) Stop() {
	close(s.done)
}

func (s *CleanupService) run() {
	// Run once on startup after a short delay
	timer := time.NewTimer(30 * time.Second)
	select {
	case <-timer.C:
		s.cleanup()
		s.cleanupPendingUploads()
	case <-s.done:
		timer.Stop()
		return
	}

	// Pending upload cleanup every 30 minutes
	uploadTicker := time.NewTicker(30 * time.Minute)
	// Message retention cleanup daily
	retentionTicker := time.NewTicker(24 * time.Hour)
	defer uploadTicker.Stop()
	defer retentionTicker.Stop()

	for {
		select {
		case <-uploadTicker.C:
			s.cleanupPendingUploads()
		case <-retentionTicker.C:
			s.cleanup()
		case <-s.done:
			return
		}
	}
}

func (s *CleanupService) cleanup() {
	ctx := context.Background()

	channels, err := s.queries.GetChannelsWithRetention(ctx)
	if err != nil {
		log.Printf("[Cleanup] Failed to get channels with retention policies: %v", err)
		return
	}

	if len(channels) == 0 {
		return
	}

	var totalDeleted int64
	for _, ch := range channels {
		if ch.RetentionDays <= 0 {
			continue
		}

		for {
			deleted, err := s.queries.DeleteExpiredMessages(ctx, ch.ChannelID, ch.RetentionDays, 1000)
			if err != nil {
				log.Printf("[Cleanup] Failed to delete expired messages for channel %s: %v", ch.ChannelID, err)
				break
			}
			totalDeleted += deleted
			if deleted < 1000 {
				break // No more to delete
			}
		}
	}

	if totalDeleted > 0 {
		log.Printf("[Cleanup] Deleted %d expired messages across %d channels", totalDeleted, len(channels))
	}
}

func (s *CleanupService) cleanupPendingUploads() {
	ctx := context.Background()

	expired, err := s.queries.GetExpiredPendingUploads(ctx)
	if err != nil {
		log.Printf("[Cleanup] Failed to get expired pending uploads: %v", err)
		return
	}

	if len(expired) == 0 {
		return
	}

	for _, p := range expired {
		_ = s.storage.AbortMultipartUpload(ctx, p.ObjectKey, p.UploadID)
		_ = s.queries.DeletePendingUpload(ctx, p.ID)
	}

	log.Printf("[Cleanup] Cleaned up %d expired pending uploads", len(expired))
}
