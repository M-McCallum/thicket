package service

import (
	"context"
	"log"
	"os"
	"testing"
	"time"

	"github.com/mitchell/neoncore/internal/auth"
	"github.com/mitchell/neoncore/internal/models"
	"github.com/mitchell/neoncore/internal/testutil"
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
