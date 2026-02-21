#!/bin/sh
set -eu

if [ -z "${LIVEKIT_API_KEY:-}" ] || [ -z "${LIVEKIT_API_SECRET:-}" ]; then
  echo "ERROR: LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set"
  exit 1
fi

if [ -z "${NODE_IP:-}" ]; then
  echo "ERROR: NODE_IP must be set to the server's public IP address"
  exit 1
fi

cat > /tmp/livekit.yaml <<EOF
port: 7880
rtc:
  port_range_start: 7882
  port_range_end: 7892
  use_external_ip: false
  node_ip: ${NODE_IP}
  tcp_port: 7881

keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}

logging:
  level: info

room:
  empty_timeout: 300
  max_participants: 50
EOF

exec livekit-server --config /tmp/livekit.yaml
