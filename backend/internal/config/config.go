package config

import (
	"fmt"
	"os"
)

type Config struct {
	DB      DBConfig
	API     APIConfig
	LiveKit LiveKitConfig
	Ory     OryConfig
	MinIO   MinIOConfig
	Giphy   GiphyConfig
	Env     string
}

type GiphyConfig struct {
	APIKey string
}

type MinIOConfig struct {
	Endpoint       string
	PublicEndpoint string // browser-reachable endpoint for presigned URLs (e.g. https://chat.example.com/storage)
	AccessKey      string
	SecretKey      string
	Bucket         string
	UseSSL         bool
}

type OryConfig struct {
	KratosPublicURL  string
	KratosBrowserURL string // URL the browser uses to reach Kratos (may differ from internal)
	KratosAdminURL   string
	HydraPublicURL   string
	HydraAdminURL    string
}

func (c OryConfig) JWKSURL() string {
	return c.HydraPublicURL + "/.well-known/jwks.json"
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

func (c DBConfig) URL() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		c.User, c.Password, c.Host, c.Port, c.Name, c.SSLMode)
}

type APIConfig struct {
	Port       string
	Host       string
	CORSOrigin string
}

type LiveKitConfig struct {
	APIKey    string
	APISecret string
	URL       string
}

func Load() (*Config, error) {
	env := getEnv("ENV", "development")

	// Default to "require" for production, "disable" for development
	sslDefault := "require"
	if env == "development" {
		sslDefault = "disable"
	}

	cfg := &Config{
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "thicket"),
			Password: getEnv("DB_PASSWORD", "thicket_dev"),
			Name:     getEnv("DB_NAME", "thicket"),
			SSLMode:  getEnv("DB_SSL_MODE", sslDefault),
		},
		API: APIConfig{
			Port:       getEnv("API_PORT", "8080"),
			Host:       getEnv("API_HOST", "0.0.0.0"),
			CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:5173"),
		},
		LiveKit: LiveKitConfig{
			APIKey:    getEnv("LIVEKIT_API_KEY", "devkey"),
			APISecret: getEnv("LIVEKIT_API_SECRET", "secret"),
			URL:       getEnv("LIVEKIT_URL", "ws://localhost:7880"),
		},
		Ory: OryConfig{
			KratosPublicURL:  getEnv("KRATOS_PUBLIC_URL", "http://localhost:4433"),
			KratosBrowserURL: getEnv("KRATOS_BROWSER_URL", getEnv("KRATOS_PUBLIC_URL", "http://localhost:4433")),
			KratosAdminURL:   getEnv("KRATOS_ADMIN_URL", "http://localhost:4434"),
			HydraPublicURL:   getEnv("HYDRA_PUBLIC_URL", "http://localhost:4444"),
			HydraAdminURL:    getEnv("HYDRA_ADMIN_URL", "http://localhost:4445"),
		},
		MinIO: MinIOConfig{
			Endpoint:       getEnv("MINIO_ENDPOINT", "localhost:9000"),
			PublicEndpoint: getEnv("MINIO_PUBLIC_ENDPOINT", ""),
			AccessKey:      getEnv("MINIO_ACCESS_KEY", "thicket_dev"),
			SecretKey:      getEnv("MINIO_SECRET_KEY", "thicket_dev_secret"),
			Bucket:         getEnv("MINIO_BUCKET", "thicket"),
			UseSSL:         getEnv("MINIO_USE_SSL", "false") == "true",
		},
		Giphy: GiphyConfig{
			APIKey: getEnv("GIPHY_API_KEY", ""),
		},
		Env: env,
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
