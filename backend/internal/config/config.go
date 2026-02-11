package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	DB       DBConfig
	JWT      JWTConfig
	API      APIConfig
	LiveKit  LiveKitConfig
	Env      string
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

type JWTConfig struct {
	Secret        string
	AccessExpiry  time.Duration
	RefreshExpiry time.Duration
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
	accessExpiry, err := time.ParseDuration(getEnv("JWT_ACCESS_EXPIRY", "15m"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRY: %w", err)
	}

	refreshExpiry, err := time.ParseDuration(getEnv("JWT_REFRESH_EXPIRY", "720h"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRY: %w", err)
	}

	cfg := &Config{
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "thicket"),
			Password: getEnv("DB_PASSWORD", "thicket_dev"),
			Name:     getEnv("DB_NAME", "thicket"),
			SSLMode:  getEnv("DB_SSL_MODE", "disable"),
		},
		JWT: JWTConfig{
			Secret:        getEnv("JWT_SECRET", "dev-secret-change-me"),
			AccessExpiry:  accessExpiry,
			RefreshExpiry: refreshExpiry,
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
		Env: getEnv("ENV", "development"),
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
