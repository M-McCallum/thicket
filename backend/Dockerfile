FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -u 1000 thicket

USER thicket

COPY --from=builder /server /server
COPY --from=builder /app/internal/database/migrations /migrations

EXPOSE 8080

ENTRYPOINT ["/server"]
