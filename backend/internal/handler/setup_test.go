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

	"github.com/gofiber/fiber/v3"

	"github.com/M-McCallum/thicket/internal/auth"
	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/service"
	"github.com/M-McCallum/thicket/internal/testutil"
	"github.com/M-McCallum/thicket/internal/ws"
)

var (
	testDB     *testutil.TestDB
	jwksServer *testutil.TestJWKSServer
	jwksMgr    *auth.JWKSManager
)

func TestMain(m *testing.M) {
	ctx := context.Background()

	var err error
	testDB, err = testutil.SetupTestDB(ctx)
	if err != nil {
		log.Fatalf("setup test db: %v", err)
	}

	jwksServer = testutil.NewTestJWKSServer()
	jwksMgr = auth.NewJWKSManager(jwksServer.JWKSURL())

	code := m.Run()

	jwksServer.Close()
	testDB.Cleanup(ctx)
	os.Exit(code)
}

func queries() *models.Queries {
	return testDB.Queries
}

func createUser(t *testing.T) *testutil.TestUser {
	t.Helper()
	u, err := testutil.CreateTestUser(context.Background(), queries(), jwksServer)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	return u
}

// setupApp creates a Fiber app with auth middleware and all server/channel/message/DM routes.
func setupApp() *fiber.App {
	app := fiber.New()

	q := queries()
	permSvc := service.NewPermissionService(q)
	serverSvc := service.NewServerService(q, permSvc)
	channelSvc := service.NewChannelService(q, permSvc)
	messageSvc := service.NewMessageService(q, permSvc)
	dmSvc := service.NewDMService(q)
	hub := ws.NewHub()
	go hub.Run()

	serverHandler := NewServerHandler(serverSvc, channelSvc, hub)
	messageHandler := NewMessageHandler(messageSvc, hub, nil)
	dmHandler := NewDMHandler(dmSvc, hub, nil)

	protected := app.Group("/api", auth.Middleware(jwksMgr))

	protected.Get("/servers", serverHandler.GetUserServers)
	protected.Post("/servers", serverHandler.CreateServer)
	protected.Get("/servers/:id", serverHandler.GetServer)
	protected.Delete("/servers/:id", serverHandler.DeleteServer)
	protected.Post("/servers/join", serverHandler.JoinServer)
	protected.Post("/servers/:id/leave", serverHandler.LeaveServer)
	protected.Get("/servers/:id/members", serverHandler.GetMembers)

	protected.Post("/servers/:id/channels", serverHandler.CreateChannel)
	protected.Get("/servers/:id/channels", serverHandler.GetChannels)
	protected.Delete("/servers/:id/channels/:channelId", serverHandler.DeleteChannel)

	protected.Post("/channels/:channelId/messages", messageHandler.SendMessage)
	protected.Get("/channels/:channelId/messages", messageHandler.GetMessages)
	protected.Put("/messages/:id", messageHandler.UpdateMessage)
	protected.Delete("/messages/:id", messageHandler.DeleteMessage)

	protected.Post("/dm/conversations", dmHandler.CreateConversation)
	protected.Get("/dm/conversations", dmHandler.GetConversations)
	protected.Get("/dm/conversations/:id/messages", dmHandler.GetDMMessages)
	protected.Post("/dm/conversations/:id/messages", dmHandler.SendDM)

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
