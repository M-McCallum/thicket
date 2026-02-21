package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/storage"
	"github.com/M-McCallum/thicket/internal/testutil"
)

func TestCreateAttachments_SmallFile_Success(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	server, channel, err := testutil.CreateTestServer(ctx, queries(), user.User.ID)
	if err != nil {
		t.Fatalf("create server: %v", err)
	}
	_ = server

	msg, err := queries().CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: channel.ID,
		AuthorID:  user.User.ID,
		Content:   "test",
	})
	if err != nil {
		t.Fatalf("create message: %v", err)
	}

	atts, err := svc.CreateAttachments(ctx, &msg.ID, nil, []AttachmentInput{
		{
			Reader:      strings.NewReader("hello world"),
			Filename:    "test.txt",
			ContentType: "text/plain",
			Size:        11,
		},
	})
	if err != nil {
		t.Fatalf("create attachments: %v", err)
	}
	if len(atts) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(atts))
	}
	if atts[0].OriginalFilename != "test.txt" {
		t.Errorf("expected filename test.txt, got %s", atts[0].OriginalFilename)
	}
	if atts[0].Size != 11 {
		t.Errorf("expected size 11, got %d", atts[0].Size)
	}
}

func TestCreateAttachments_ExceedsMaxSize(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	_, err := svc.CreateAttachments(context.Background(), nil, nil, []AttachmentInput{
		{
			Reader:      strings.NewReader("x"),
			Filename:    "huge.zip",
			ContentType: "application/zip",
			Size:        600 << 20, // 600MB
		},
	})
	if !errors.Is(err, ErrFileTooLarge) {
		t.Errorf("expected ErrFileTooLarge, got %v", err)
	}
}

func TestCreateAttachments_InvalidContentType(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	_, err := svc.CreateAttachments(context.Background(), nil, nil, []AttachmentInput{
		{
			Reader:      strings.NewReader("x"),
			Filename:    "file.exe",
			ContentType: "application/x-msdownload",
			Size:        100,
		},
	})
	if !errors.Is(err, ErrInvalidFileType) {
		t.Errorf("expected ErrInvalidFileType, got %v", err)
	}
}

func TestCreateAttachments_TooManyFiles(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	inputs := make([]AttachmentInput, 11)
	for i := range inputs {
		inputs[i] = AttachmentInput{
			Reader:      strings.NewReader("x"),
			Filename:    "file.txt",
			ContentType: "text/plain",
			Size:        1,
		}
	}
	_, err := svc.CreateAttachments(context.Background(), nil, nil, inputs)
	if !errors.Is(err, ErrTooManyFiles) {
		t.Errorf("expected ErrTooManyFiles, got %v", err)
	}
}

func TestInitiateMultipartUpload_Success(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	fileSize := int64(50 << 20) // 50MB
	pendingID, partURLs, partSize, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "video.mp4", "video/mp4", fileSize)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	if pendingID == uuid.Nil {
		t.Error("expected non-nil pending ID")
	}

	expectedParts := 5 // 50MB / 10MB
	if len(partURLs) != expectedParts {
		t.Errorf("expected %d part URLs, got %d", expectedParts, len(partURLs))
	}

	if partSize != ChunkSize {
		t.Errorf("expected part size %d, got %d", ChunkSize, partSize)
	}

	// Verify each URL looks correct
	for i, url := range partURLs {
		if !strings.Contains(url, "mock-minio") {
			t.Errorf("part %d: expected mock-minio URL, got %s", i, url)
		}
	}
}

func TestInitiateMultipartUpload_ExceedsMaxSize(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)
	user := createUser(t)

	_, _, _, err := svc.InitiateMultipartUpload(context.Background(), user.User.ID, "huge.mp4", "video/mp4", 600<<20)
	if !errors.Is(err, ErrFileTooLarge) {
		t.Errorf("expected ErrFileTooLarge, got %v", err)
	}
}

func TestInitiateMultipartUpload_InvalidContentType(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)
	user := createUser(t)

	_, _, _, err := svc.InitiateMultipartUpload(context.Background(), user.User.ID, "file.exe", "application/x-msdownload", 50<<20)
	if !errors.Is(err, ErrInvalidFileType) {
		t.Errorf("expected ErrInvalidFileType, got %v", err)
	}
}

func TestInitiateMultipartUpload_StorageError(t *testing.T) {
	mock := storage.NewMockStorage()
	mock.UploadErr = errors.New("storage down")
	svc := NewAttachmentService(queries(), mock)
	user := createUser(t)

	_, _, _, err := svc.InitiateMultipartUpload(context.Background(), user.User.ID, "file.mp4", "video/mp4", 50<<20)
	if err == nil {
		t.Error("expected error, got nil")
	}
}

func TestReportPartComplete_Success(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	err = svc.ReportPartComplete(ctx, user.User.ID, pendingID, 1, "\"etag1\"")
	if err != nil {
		t.Fatalf("report part: %v", err)
	}

	// Verify in DB
	p, err := queries().GetPendingUpload(ctx, pendingID, user.User.ID)
	if err != nil {
		t.Fatalf("get pending: %v", err)
	}

	var parts []CompletedPart
	if err := json.Unmarshal(p.PartsJSON, &parts); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(parts) != 1 || parts[0].ETag != "\"etag1\"" {
		t.Errorf("unexpected parts: %+v", parts)
	}
}

func TestReportPartComplete_WrongUser(t *testing.T) {
	ctx := context.Background()
	user1 := createUser(t)
	user2 := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user1.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	err = svc.ReportPartComplete(ctx, user2.User.ID, pendingID, 1, "\"etag\"")
	if !errors.Is(err, ErrUploadNotFound) {
		t.Errorf("expected ErrUploadNotFound, got %v", err)
	}
}

func TestFinalizeMultipartUpload_Success(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	mock.StatSize = 20 << 20 // matches declared size
	svc := NewAttachmentService(queries(), mock)

	_, channel, err := testutil.CreateTestServer(ctx, queries(), user.User.ID)
	if err != nil {
		t.Fatalf("create server: %v", err)
	}

	msg, err := queries().CreateMessage(ctx, models.CreateMessageParams{
		ChannelID: channel.ID,
		AuthorID:  user.User.ID,
		Content:   "test",
	})
	if err != nil {
		t.Fatalf("create message: %v", err)
	}

	fileSize := int64(20 << 20)
	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "file.mp4", "video/mp4", fileSize)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	// Report parts
	_ = svc.ReportPartComplete(ctx, user.User.ID, pendingID, 1, "\"etag1\"")
	_ = svc.ReportPartComplete(ctx, user.User.ID, pendingID, 2, "\"etag2\"")

	att, err := svc.FinalizeMultipartUpload(ctx, user.User.ID, pendingID, &msg.ID, nil)
	if err != nil {
		t.Fatalf("finalize: %v", err)
	}

	if att.OriginalFilename != "file.mp4" {
		t.Errorf("expected filename file.mp4, got %s", att.OriginalFilename)
	}
	if att.Size != fileSize {
		t.Errorf("expected size %d, got %d", fileSize, att.Size)
	}

	// Pending upload should be deleted
	_, err = queries().GetPendingUpload(ctx, pendingID, user.User.ID)
	if err == nil {
		t.Error("expected pending upload to be deleted")
	}
}

func TestFinalizeMultipartUpload_SizeMismatch(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	mock.StatSize = 15 << 20 // doesn't match 20MB
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	_ = svc.ReportPartComplete(ctx, user.User.ID, pendingID, 1, "\"etag1\"")

	_, err = svc.FinalizeMultipartUpload(ctx, user.User.ID, pendingID, nil, nil)
	if !errors.Is(err, ErrSizeMismatch) {
		t.Errorf("expected ErrSizeMismatch, got %v", err)
	}
}

func TestFinalizeMultipartUpload_Expired(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	// Set expires_at in the past
	_, err = testDB.Pool.Exec(ctx,
		"UPDATE pending_uploads SET expires_at = $1 WHERE id = $2",
		time.Now().Add(-1*time.Hour), pendingID,
	)
	if err != nil {
		t.Fatalf("set expires_at: %v", err)
	}

	_, err = svc.FinalizeMultipartUpload(ctx, user.User.ID, pendingID, nil, nil)
	if !errors.Is(err, ErrUploadExpired) {
		t.Errorf("expected ErrUploadExpired, got %v", err)
	}
}

func TestFinalizeMultipartUpload_WrongUser(t *testing.T) {
	ctx := context.Background()
	user1 := createUser(t)
	user2 := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user1.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	_, err = svc.FinalizeMultipartUpload(ctx, user2.User.ID, pendingID, nil, nil)
	if !errors.Is(err, ErrUploadNotFound) {
		t.Errorf("expected ErrUploadNotFound, got %v", err)
	}
}

func TestFinalizeMultipartUpload_StorageCompleteError(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	mock.CompleteErr = errors.New("s3 error")
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	_, err = svc.FinalizeMultipartUpload(ctx, user.User.ID, pendingID, nil, nil)
	if err == nil {
		t.Error("expected error, got nil")
	}

	// Pending upload should NOT be deleted (retryable)
	_, err = queries().GetPendingUpload(ctx, pendingID, user.User.ID)
	if err != nil {
		t.Error("expected pending upload to still exist after storage error")
	}
}

func TestAbortMultipartUpload_Success(t *testing.T) {
	ctx := context.Background()
	user := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	err = svc.AbortMultipartUpload(ctx, user.User.ID, pendingID)
	if err != nil {
		t.Fatalf("abort: %v", err)
	}

	if !mock.AbortCalled {
		t.Error("expected AbortCalled to be true")
	}

	// Pending upload should be deleted
	_, err = queries().GetPendingUpload(ctx, pendingID, user.User.ID)
	if err == nil {
		t.Error("expected pending upload to be deleted")
	}
}

func TestAbortMultipartUpload_WrongUser(t *testing.T) {
	ctx := context.Background()
	user1 := createUser(t)
	user2 := createUser(t)
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	pendingID, _, _, err := svc.InitiateMultipartUpload(ctx, user1.User.ID, "file.mp4", "video/mp4", 20<<20)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}

	err = svc.AbortMultipartUpload(ctx, user2.User.ID, pendingID)
	if !errors.Is(err, ErrUploadNotFound) {
		t.Errorf("expected ErrUploadNotFound, got %v", err)
	}

	if mock.AbortCalled {
		t.Error("expected AbortCalled to be false")
	}
}

func TestResolveURLs_SmallFile(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	id := uuid.New()
	atts := []models.Attachment{
		{
			ID:               id,
			OriginalFilename: "small.txt",
			Size:             1024, // 1KB
			ObjectKey:        "attachments/small.txt",
			IsExternal:       false,
		},
	}

	svc.ResolveURLs(context.Background(), atts)
	expected := "/api/attachments/" + id.String() + "/small.txt"
	if atts[0].URL != expected {
		t.Errorf("expected %s, got %s", expected, atts[0].URL)
	}
}

func TestResolveURLs_LargeFile(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	atts := []models.Attachment{
		{
			ID:               uuid.New(),
			OriginalFilename: "big.mp4",
			Size:             50 << 20, // 50MB
			ObjectKey:        "attachments/big.mp4",
			IsExternal:       false,
		},
	}

	svc.ResolveURLs(context.Background(), atts)
	if !strings.Contains(atts[0].URL, "mock-minio/presigned") {
		t.Errorf("expected presigned URL, got %s", atts[0].URL)
	}
}

func TestResolveURLs_ExternalFile(t *testing.T) {
	mock := storage.NewMockStorage()
	svc := NewAttachmentService(queries(), mock)

	atts := []models.Attachment{
		{
			ID:         uuid.New(),
			ObjectKey:  "https://example.com/image.png",
			IsExternal: true,
		},
	}

	svc.ResolveURLs(context.Background(), atts)
	if atts[0].URL != "https://example.com/image.png" {
		t.Errorf("expected external URL, got %s", atts[0].URL)
	}
}

