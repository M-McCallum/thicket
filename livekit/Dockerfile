FROM livekit/livekit-server:latest AS livekit
FROM alpine:3.20
COPY --from=livekit /livekit-server /usr/local/bin/livekit-server
COPY entrypoint.sh /etc/livekit/entrypoint.sh
RUN chmod +x /etc/livekit/entrypoint.sh
