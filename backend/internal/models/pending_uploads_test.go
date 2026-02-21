package models_test

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/testutil"
)

var testDB *testutil.TestDB

func TestMain(m *testing.M) {
	ctx := context.Background()
	var err error
	testDB, err = testutil.SetupTestDB(ctx)
	if err != nil {
		log.Fatalf("setup test db: %v", err)
	}

	code := m.Run()
	testDB.Cleanup(ctx)
	os.Exit(code)
}

func createTestUser(t *testing.T) models.User {
	t.Helper()
	username := "testuser_" + uuid.New().String()[:8]
	email := username + "@test.com"
	kratosID := uuid.New()
	user, err := testDB.Queries.CreateUser(context.Background(), models.CreateUserParams{
		Username:    username,
		Email:       email,
		KratosID:    kratosID,
		DisplayName: &username,
	})
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	return user
}

func TestCreatePendingUpload(t *testing.T) {
	ctx := context.Background()
	user := createTestUser(t)

	p, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user.ID,
		ObjectKey:   "attachments/test-123.mp4",
		UploadID:    "minio-upload-abc",
		Filename:    "video.mp4",
		ContentType: "video/mp4",
		FileSize:    50 * 1024 * 1024,
	})
	if err != nil {
		t.Fatalf("create pending upload: %v", err)
	}

	if p.ID == uuid.Nil {
		t.Error("expected non-nil ID")
	}
	if p.UserID != user.ID {
		t.Errorf("expected user_id %s, got %s", user.ID, p.UserID)
	}
	if p.Filename != "video.mp4" {
		t.Errorf("expected filename video.mp4, got %s", p.Filename)
	}
	if p.FileSize != 50*1024*1024 {
		t.Errorf("expected file_size %d, got %d", 50*1024*1024, p.FileSize)
	}

	// Read it back
	got, err := testDB.Queries.GetPendingUpload(ctx, p.ID, user.ID)
	if err != nil {
		t.Fatalf("get pending upload: %v", err)
	}
	if got.UploadID != "minio-upload-abc" {
		t.Errorf("expected upload_id minio-upload-abc, got %s", got.UploadID)
	}
}

func TestGetPendingUpload_OwnershipCheck(t *testing.T) {
	ctx := context.Background()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	p, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user1.ID,
		ObjectKey:   "attachments/test-own.mp4",
		UploadID:    "upload-own",
		Filename:    "file.mp4",
		ContentType: "video/mp4",
		FileSize:    100,
	})
	if err != nil {
		t.Fatalf("create pending upload: %v", err)
	}

	// Should succeed for owner
	_, err = testDB.Queries.GetPendingUpload(ctx, p.ID, user1.ID)
	if err != nil {
		t.Fatalf("expected success for owner, got: %v", err)
	}

	// Should fail for different user
	_, err = testDB.Queries.GetPendingUpload(ctx, p.ID, user2.ID)
	if err == nil {
		t.Error("expected error for wrong user, got nil")
	}
}

func TestUpdatePendingUploadParts(t *testing.T) {
	ctx := context.Background()
	user := createTestUser(t)

	p, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user.ID,
		ObjectKey:   "attachments/test-parts.mp4",
		UploadID:    "upload-parts",
		Filename:    "file.mp4",
		ContentType: "video/mp4",
		FileSize:    100,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	parts := []map[string]interface{}{
		{"part_number": 1, "etag": "\"abc123\""},
		{"part_number": 2, "etag": "\"def456\""},
	}
	partsJSON, _ := json.Marshal(parts)

	err = testDB.Queries.UpdatePendingUploadParts(ctx, p.ID, partsJSON)
	if err != nil {
		t.Fatalf("update parts: %v", err)
	}

	got, err := testDB.Queries.GetPendingUpload(ctx, p.ID, user.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	var gotParts []map[string]interface{}
	if err := json.Unmarshal(got.PartsJSON, &gotParts); err != nil {
		t.Fatalf("unmarshal parts: %v", err)
	}
	if len(gotParts) != 2 {
		t.Errorf("expected 2 parts, got %d", len(gotParts))
	}
}

func TestDeletePendingUpload(t *testing.T) {
	ctx := context.Background()
	user := createTestUser(t)

	p, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user.ID,
		ObjectKey:   "attachments/test-del.mp4",
		UploadID:    "upload-del",
		Filename:    "file.mp4",
		ContentType: "video/mp4",
		FileSize:    100,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	err = testDB.Queries.DeletePendingUpload(ctx, p.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = testDB.Queries.GetPendingUpload(ctx, p.ID, user.ID)
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}

func TestGetExpiredPendingUploads(t *testing.T) {
	ctx := context.Background()
	user := createTestUser(t)

	// Create a normal (non-expired) upload
	_, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user.ID,
		ObjectKey:   "attachments/test-notexp.mp4",
		UploadID:    "upload-notexp",
		Filename:    "file.mp4",
		ContentType: "video/mp4",
		FileSize:    100,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Create an expired upload by setting expires_at in the past
	exp, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user.ID,
		ObjectKey:   "attachments/test-expired.mp4",
		UploadID:    "upload-expired",
		Filename:    "expired.mp4",
		ContentType: "video/mp4",
		FileSize:    100,
	})
	if err != nil {
		t.Fatalf("create expired: %v", err)
	}

	// Manually set expires_at to past
	_, err = testDB.Pool.Exec(ctx,
		"UPDATE pending_uploads SET expires_at = $1 WHERE id = $2",
		time.Now().Add(-1*time.Hour), exp.ID,
	)
	if err != nil {
		t.Fatalf("set expires_at: %v", err)
	}

	expired, err := testDB.Queries.GetExpiredPendingUploads(ctx)
	if err != nil {
		t.Fatalf("get expired: %v", err)
	}

	found := false
	for _, p := range expired {
		if p.ID == exp.ID {
			found = true
		}
	}
	if !found {
		t.Error("expected expired upload in results")
	}
}

func TestDeleteExpiredPendingUploads(t *testing.T) {
	ctx := context.Background()
	user := createTestUser(t)

	// Create an expired upload
	exp, err := testDB.Queries.CreatePendingUpload(ctx, models.CreatePendingUploadParams{
		UserID:      user.ID,
		ObjectKey:   "attachments/test-delexp.mp4",
		UploadID:    "upload-delexp",
		Filename:    "expired.mp4",
		ContentType: "video/mp4",
		FileSize:    100,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	_, err = testDB.Pool.Exec(ctx,
		"UPDATE pending_uploads SET expires_at = $1 WHERE id = $2",
		time.Now().Add(-1*time.Hour), exp.ID,
	)
	if err != nil {
		t.Fatalf("set expires_at: %v", err)
	}

	deleted, err := testDB.Queries.DeleteExpiredPendingUploads(ctx)
	if err != nil {
		t.Fatalf("delete expired: %v", err)
	}

	if deleted < 1 {
		t.Error("expected at least 1 deleted row")
	}

	// Should not be retrievable
	_, err = testDB.Queries.GetPendingUpload(ctx, exp.ID, user.ID)
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}
