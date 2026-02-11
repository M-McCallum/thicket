package service

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/M-McCallum/thicket/internal/models"
	"github.com/M-McCallum/thicket/internal/testutil"
)

var (
	testDB     *testutil.TestDB
	jwksServer *testutil.TestJWKSServer
)

func TestMain(m *testing.M) {
	ctx := context.Background()

	var err error
	testDB, err = testutil.SetupTestDB(ctx)
	if err != nil {
		log.Fatalf("setup test db: %v", err)
	}

	jwksServer = testutil.NewTestJWKSServer()

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
