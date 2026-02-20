#!/bin/sh
# Build overlay configs that Kratos merges via multiple --config flags.
# The base config (kratos.yml) contains dev defaults (localhost URLs).
# This script generates two optional overlays:
#   1. Production overlay — when APP_URL is set, overrides all localhost URLs
#   2. OIDC overlay — when OAuth provider env vars are set

EXTRA_CONFIGS=""

# ---------------------------------------------------------------------------
# 1. Production overlay (APP_URL must be set, e.g. https://thicket.app)
# ---------------------------------------------------------------------------
if [ -n "${APP_URL:-}" ]; then
  # Extract domain from APP_URL (strip protocol)
  DOMAIN=$(echo "$APP_URL" | sed 's|https\?://||')

  cat > /tmp/prod.yml <<EOF
serve:
  public:
    cors:
      enabled: true
      allowed_origins:
        - ${APP_URL}

selfservice:
  default_browser_return_url: ${APP_URL}/auth/login
  allowed_return_urls:
    - ${APP_URL}/auth/login
    - thicket://auth/callback

  methods:
    webauthn:
      enabled: true
      config:
        passwordless: true
        rp:
          display_name: Thicket
          id: ${DOMAIN}
          origins:
            - ${APP_URL}

  flows:
    error:
      ui_url: ${APP_URL}/auth/error
    login:
      ui_url: ${APP_URL}/auth/login
      lifespan: 10m
    registration:
      ui_url: ${APP_URL}/auth/registration
      lifespan: 10m
      after:
        password:
          hooks:
            - hook: session
        oidc:
          hooks:
            - hook: session
    recovery:
      enabled: true
      ui_url: ${APP_URL}/auth/recovery
      lifespan: 15m
    verification:
      enabled: true
      ui_url: ${APP_URL}/auth/verification
      lifespan: 1h
    settings:
      ui_url: ${APP_URL}/auth/settings
      lifespan: 10m
      required_aal: aal1
EOF

  # SMTP override (if SMTP_CONNECTION_URI is set)
  if [ -n "${SMTP_CONNECTION_URI:-}" ]; then
    cat >> /tmp/prod.yml <<EOF

courier:
  smtp:
    connection_uri: ${SMTP_CONNECTION_URI}
EOF
  fi

  EXTRA_CONFIGS="--config /tmp/prod.yml"
fi

# ---------------------------------------------------------------------------
# 2. OIDC overlay (only providers with credentials set)
# ---------------------------------------------------------------------------
cat > /tmp/oidc.yml <<HEADER
selfservice:
  methods:
    oidc:
      enabled: true
      config:
        providers:
HEADER

has_providers=false

if [ -n "$GOOGLE_OAUTH_CLIENT_ID" ] && [ -n "$GOOGLE_OAUTH_CLIENT_SECRET" ]; then
  has_providers=true
  cat >> /tmp/oidc.yml <<EOF
          - id: google
            provider: google
            client_id: "${GOOGLE_OAUTH_CLIENT_ID}"
            client_secret: "${GOOGLE_OAUTH_CLIENT_SECRET}"
            mapper_url: file:///etc/kratos/mappers/google.jsonnet
            scope:
              - email
              - profile
EOF
fi

if [ -n "$GITHUB_OAUTH_CLIENT_ID" ] && [ -n "$GITHUB_OAUTH_CLIENT_SECRET" ]; then
  has_providers=true
  cat >> /tmp/oidc.yml <<EOF
          - id: github
            provider: github
            client_id: "${GITHUB_OAUTH_CLIENT_ID}"
            client_secret: "${GITHUB_OAUTH_CLIENT_SECRET}"
            mapper_url: file:///etc/kratos/mappers/github.jsonnet
            scope:
              - user:email
EOF
fi

if [ -n "$DISCORD_OAUTH_CLIENT_ID" ] && [ -n "$DISCORD_OAUTH_CLIENT_SECRET" ]; then
  has_providers=true
  cat >> /tmp/oidc.yml <<EOF
          - id: discord
            provider: discord
            client_id: "${DISCORD_OAUTH_CLIENT_ID}"
            client_secret: "${DISCORD_OAUTH_CLIENT_SECRET}"
            mapper_url: file:///etc/kratos/mappers/discord.jsonnet
            scope:
              - identify
              - email
EOF
fi

if [ "$has_providers" = true ]; then
  EXTRA_CONFIGS="${EXTRA_CONFIGS} --config /tmp/oidc.yml"
fi

# ---------------------------------------------------------------------------
# Start Kratos with base config + any overlays
# ---------------------------------------------------------------------------
exec kratos "$@" ${EXTRA_CONFIGS}
