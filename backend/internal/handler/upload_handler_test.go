package handler

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/storage"
)

func setupUploadApp(mock *storage.MockStorage) *fiber.App {
	app := fiber.New()
	q := queries()
	svc := service.NewAttachmentService(q, mock)
	h := NewUploadHandler(svc)

	protected := app.Group("/api", auth.Middleware(jwksMgr))
	protected.Post("/uploads/initiate", h.InitiateUpload)
	protected.Post("/uploads/:pendingId/part-complete", h.ReportPartComplete)
	protected.Post("/uploads/:pendingId/complete", h.CompleteUpload)
	protected.Delete("/uploads/:pendingId", h.AbortUpload)

	return app
}

func TestInitiateUpload_201(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user := createUser(t)

	req := authRequest("POST", "/api/uploads/initiate", user.AccessToken, map[string]interface{}{
		"filename":     "video.mp4",
		"content_type": "video/mp4",
		"file_size":    50 * 1024 * 1024,
	})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request: %v", err)
	}

	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	parseJSON(t, resp, &body)

	if body["pending_upload_id"] == nil {
		t.Error("missing pending_upload_id")
	}
	if body["part_urls"] == nil {
		t.Error("missing part_urls")
	}
	urls := body["part_urls"].([]interface{})
	if len(urls) != 5 { // 50MB / 10MB
		t.Errorf("expected 5 part URLs, got %d", len(urls))
	}
}

func TestInitiateUpload_400_InvalidContentType(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user := createUser(t)

	req := authRequest("POST", "/api/uploads/initiate", user.AccessToken, map[string]interface{}{
		"filename":     "file.exe",
		"content_type": "application/x-msdownload",
		"file_size":    1000,
	})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestInitiateUpload_400_TooLarge(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user := createUser(t)

	req := authRequest("POST", "/api/uploads/initiate", user.AccessToken, map[string]interface{}{
		"filename":     "huge.mp4",
		"content_type": "video/mp4",
		"file_size":    600 * 1024 * 1024, // 600MB
	})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestInitiateUpload_400_MissingFields(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user := createUser(t)

	req := authRequest("POST", "/api/uploads/initiate", user.AccessToken, map[string]interface{}{
		"content_type": "video/mp4",
		"file_size":    1000,
	})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request: %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestInitiateUpload_401_NoAuth(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)

	req := authRequest("POST", "/api/uploads/initiate", "", map[string]interface{}{
		"filename":     "file.mp4",
		"content_type": "video/mp4",
		"file_size":    1000,
	})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request: %v", err)
	}

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestPartComplete_204(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user := createUser(t)

	// Initiate first
	initReq := authRequest("POST", "/api/uploads/initiate", user.AccessToken, map[string]interface{}{
		"filename":     "video.mp4",
		"content_type": "video/mp4",
		"file_size":    20 * 1024 * 1024,
	})
	initResp, err := app.Test(initReq)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	var initBody map[string]interface{}
	parseJSON(t, initResp, &initBody)
	pendingID := initBody["pending_upload_id"].(string)

	// Report part
	partReq := authRequest("POST", "/api/uploads/"+pendingID+"/part-complete", user.AccessToken, map[string]interface{}{
		"part_number": 1,
		"etag":        "\"abc123\"",
	})
	partResp, err := app.Test(partReq)
	if err != nil {
		t.Fatalf("part complete: %v", err)
	}

	if partResp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", partResp.StatusCode)
	}
}

func TestAbortUpload_204(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user := createUser(t)

	// Initiate
	initReq := authRequest("POST", "/api/uploads/initiate", user.AccessToken, map[string]interface{}{
		"filename":     "video.mp4",
		"content_type": "video/mp4",
		"file_size":    20 * 1024 * 1024,
	})
	initResp, err := app.Test(initReq)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	var initBody map[string]interface{}
	parseJSON(t, initResp, &initBody)
	pendingID := initBody["pending_upload_id"].(string)

	// Abort
	abortReq := authRequest("DELETE", "/api/uploads/"+pendingID, user.AccessToken, nil)
	abortResp, err := app.Test(abortReq)
	if err != nil {
		t.Fatalf("abort: %v", err)
	}

	if abortResp.StatusCode != http.StatusNoContent {
		t.Errorf("expected 204, got %d", abortResp.StatusCode)
	}

	if !mock.AbortCalled {
		t.Error("expected storage.AbortMultipartUpload to be called")
	}
}

func TestCompleteUpload_404_WrongUser(t *testing.T) {
	mock := storage.NewMockStorage()
	app := setupUploadApp(mock)
	user1 := createUser(t)
	user2 := createUser(t)

	// Initiate as user1
	initReq := authRequest("POST", "/api/uploads/initiate", user1.AccessToken, map[string]interface{}{
		"filename":     "video.mp4",
		"content_type": "video/mp4",
		"file_size":    20 * 1024 * 1024,
	})
	initResp, err := app.Test(initReq)
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	var initBody map[string]interface{}
	parseJSON(t, initResp, &initBody)
	pendingID := initBody["pending_upload_id"].(string)

	// Try to complete as user2
	completeReq := authRequest("POST", "/api/uploads/"+pendingID+"/complete", user2.AccessToken, map[string]interface{}{
		"message_id": "00000000-0000-0000-0000-000000000000",
	})
	completeResp, err := app.Test(completeReq)
	if err != nil {
		t.Fatalf("complete: %v", err)
	}

	if completeResp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", completeResp.StatusCode)
	}
}

