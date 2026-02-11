package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mitchell/neoncore/internal/auth"
	"github.com/mitchell/neoncore/internal/models"
	"github.com/mitchell/neoncore/internal/service"
	"github.com/mitchell/neoncore/internal/testutil"
	"github.com/mitchell/neoncore/internal/ws"
)

var (
	testDB *testutil.TestDB
	jwtMgr *auth.JWTManager
)

func TestMain(m *testing.M) {
	ctx := context.Background()

	var err error
	testDB, err = testutil.SetupTestDB(ctx)
	if err != nil {
		log.Fatalf("setup test db: %v", err)
	}

	jwtMgr = auth.NewJWTManager("test-secret", 15*time.Minute)

	code := m.Run()

	testDB.Cleanup(ctx)
	os.Exit(code)
}

func queries() *models.Queries {
	return testDB.Queries
}

func createUser(t *testing.T) *testutil.TestUser {
	t.Helper()
	u, err := testutil.CreateTestUser(context.Background(), queries(), jwtMgr)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	return u
}

// setupApp creates a Fiber app with auth middleware and all server/channel/message routes.
func setupApp() *fiber.App {
	app := fiber.New()

	q := queries()
	serverSvc := service.NewServerService(q)
	channelSvc := service.NewChannelService(q)
	messageSvc := service.NewMessageService(q)
	hub := ws.NewHub()
	go hub.Run()

	serverHandler := NewServerHandler(serverSvc, channelSvc)
	messageHandler := NewMessageHandler(messageSvc, hub)

	protected := app.Group("/api", auth.Middleware(jwtMgr))

	protected.Get("/servers", serverHandler.GetUserServers)
	protected.Post("/servers", serverHandler.CreateServer)
	protected.Get("/servers/:id", serverHandler.GetServer)
	protected.Delete("/servers/:id", serverHandler.DeleteServer)
	protected.Post("/servers/join", serverHandler.JoinServer)
	protected.Post("/servers/:id/leave", serverHandler.LeaveServer)
	protected.Get("/servers/:id/members", serverHandler.GetMembers)

	protected.Post("/servers/:id/channels", serverHandler.CreateChannel)
	protected.Get("/servers/:id/channels", serverHandler.GetChannels)

	protected.Post("/channels/:channelId/messages", messageHandler.SendMessage)
	protected.Get("/channels/:channelId/messages", messageHandler.GetMessages)
	protected.Put("/messages/:id", messageHandler.UpdateMessage)
	protected.Delete("/messages/:id", messageHandler.DeleteMessage)

	return app
}

// authRequest creates an HTTP request with a JSON body and auth token.
func authRequest(method, url, token string, body any) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, url, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

// parseJSON decodes a JSON response body into the target.
func parseJSON(t *testing.T, resp *http.Response, target any) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		t.Fatalf("parse JSON: %v", err)
	}
}
