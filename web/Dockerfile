FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
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
