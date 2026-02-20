#!/bin/sh
# Build an OIDC overlay config with only the providers that have credentials set.
# Kratos merges multiple --config files, so we pass the overlay as a second config.

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
  exec kratos "$@" --config /tmp/oidc.yml
else
  exec kratos "$@"
fi
