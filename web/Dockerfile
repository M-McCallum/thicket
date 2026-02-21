FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci
COPY . .

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_LIVEKIT_URL
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI

RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY <<'CADDYFILE' /etc/caddy/Caddyfile
:80 {
    root * /srv
    file_server
    try_files {path} /index.html
}
CADDYFILE
EXPOSE 80
