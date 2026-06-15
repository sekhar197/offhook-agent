# offhook — production voice-agent worker image.
#
# The universal deploy unit: one image runs on any container platform (Docker,
# Fly, Railway, Render, Kubernetes, LiveKit Cloud agent hosting). The worker
# connects OUT to your LiveKit server and answers calls (browser or SIP) — no
# inbound ports to expose. It drains in-flight calls on SIGTERM, so a rolling
# restart never drops a live call.
#
# Config + knowledge are deployment-specific and NOT baked in. Either:
#   • mount them:   docker run -v "$PWD/agent.yaml:/app/agent.yaml" \
#                              -v "$PWD/knowledge:/app/knowledge" ...
#   • or extend:    FROM ghcr.io/you/offhook  +  COPY agent.yaml knowledge/ ./
#
# Run 24/7 with auto-restart and your LiveKit + provider keys:
#   docker run --restart unless-stopped \
#     -e LIVEKIT_URL -e LIVEKIT_API_KEY -e LIVEKIT_API_SECRET \
#     -e OPENAI_API_KEY \
#     -v "$PWD/agent.yaml:/app/agent.yaml" -v "$PWD/knowledge:/app/knowledge" \
#     offhook

# ---- build ------------------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
COPY web ./web
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Where the worker looks for config (override with a different mount/path).
ENV OFFHOOK_CONFIG=/app/agent.yaml

# Production deps only. The LiveKit STT/TTS plugins are lazy-imported, so an
# image only pays for what its config actually uses.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/bin ./bin
COPY --from=build /app/web ./web

# Drop privileges — the base image ships a non-root `node` user.
USER node

# `offhook start` hands off to the LiveKit worker (registers, pools, dispatches
# each inbound call to the entry hook, drains on SIGTERM).
CMD ["node", "bin/offhook.js", "start"]
