#!/usr/bin/env bash
set -euo pipefail

HYDRA_ADMIN="${HYDRA_ADMIN_URL:-http://localhost:4445}"

echo "Waiting for Hydra admin API..."
for i in $(seq 1 30); do
  if curl -sf "${HYDRA_ADMIN}/health/ready" > /dev/null 2>&1; then
    echo "Hydra is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Hydra did not become ready in time."
    exit 1
  fi
  sleep 2
done

echo "Registering thicket-desktop client..."
# Delete existing client if present (idempotent)
curl -sf -X DELETE "${HYDRA_ADMIN}/admin/clients/thicket-desktop" > /dev/null 2>&1 || true

curl -sf -X POST "${HYDRA_ADMIN}/admin/clients" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "thicket-desktop",
    "client_name": "Thicket Desktop",
    "token_endpoint_auth_method": "none",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "scope": "openid offline_access profile",
    "redirect_uris": ["thicket://auth/callback", "http://localhost:5173/auth/callback"],
    "post_logout_redirect_uris": ["thicket://auth/logged-out", "http://localhost:5173"],
    "metadata": {
      "is_first_party": true
    }
  }' | python3 -m json.tool 2>/dev/null || echo "(registered)"

echo "Registering thicket-web client..."
curl -sf -X DELETE "${HYDRA_ADMIN}/admin/clients/thicket-web" > /dev/null 2>&1 || true

curl -sf -X POST "${HYDRA_ADMIN}/admin/clients" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "thicket-web",
    "client_name": "Thicket Web",
    "token_endpoint_auth_method": "none",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "scope": "openid offline_access profile",
    "redirect_uris": ["http://localhost:5173/auth/callback"],
    "post_logout_redirect_uris": ["http://localhost:5173"],
    "metadata": {
      "is_first_party": true
    }
  }' | python3 -m json.tool 2>/dev/null || echo "(registered)"

echo "OAuth2 client registration complete."
