# Deploying offhook

offhook runs as a **worker**: it connects *out* to your LiveKit server,
registers, and answers each inbound call (browser or phone) by running the
agent. There are **no inbound ports to expose** — which makes it simple to run
anywhere and safe behind a firewall.

The whole deploy story is **one image + your keys**. The `Dockerfile` in the
repo root is the universal unit; everything below is how to run it.

## What you need

| Env var | Required | What it is |
|---|---|---|
| `LIVEKIT_URL` | yes | `wss://…` — your LiveKit Cloud or self-hosted server |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | yes | LiveKit credentials |
| `OPENAI_API_KEY` | yes (default config) | LLM + STT + TTS in single-key mode |
| provider keys | as configured | e.g. `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY` if you upgrade STT/TTS |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | only for SMS delivery | so `take_message` can text the owner |
| `RESEND_API_KEY` | only for email delivery | so `take_message` can email the owner |

Config (`agent.yaml`) and `knowledge/` are **deployment-specific and not baked
into the image**. Mount them, or extend the image with a `COPY`.

## Run it 24/7 (Docker, any host)

```bash
docker build -t offhook .

docker run --restart unless-stopped \
  -e LIVEKIT_URL -e LIVEKIT_API_KEY -e LIVEKIT_API_SECRET \
  -e OPENAI_API_KEY \
  -v "$PWD/agent.yaml:/app/agent.yaml" \
  -v "$PWD/knowledge:/app/knowledge" \
  offhook
```

`--restart unless-stopped` is what makes it survive crashes and reboots. On
`SIGTERM` (a rolling restart or `docker stop`) the worker **drains in-flight
calls** before exiting, so a deploy never cuts off a live caller.

### Concurrency

One worker process pools several calls. Scale by running more replicas (each is
stateless and connects to the same LiveKit server) — `docker run` more copies,
or set replicas on your platform. Size to your expected simultaneous calls.

## Platform recipes

The same image runs on any container platform. A few one-liners:

- **Fly.io** — `fly launch --dockerfile Dockerfile`, set secrets with
  `fly secrets set LIVEKIT_URL=… OPENAI_API_KEY=…`, scale with `fly scale count N`.
- **Railway / Render** — point a new service at the repo (it autodetects the
  Dockerfile), add the env vars, deploy.
- **Kubernetes** — a standard `Deployment` of the image with the env as
  `Secret`s; no `Service` needed (no inbound ports). Set
  `terminationGracePeriodSeconds` generously so calls drain.
- **LiveKit Cloud agent hosting** — the zero-infra path: LiveKit runs the
  worker for you. Point it at this image.

> These wrappers are thin and **not certified one-click** — validate the build
> and a real call on your target before production. The *image* is the tested
> unit (CI builds it and runs the compiled CLI on every commit); the platform
> glue is yours to confirm.

## Health & restarts

The worker's health *is* its LiveKit registration — there's no separate HTTP
health endpoint to scrape (nothing inbound). For orchestrators that want a
liveness signal, process liveness + `--restart`/replica supervision is the
right model: if the process dies, the platform restarts it and it re-registers.

## Self-hosted / air-gapped

To keep audio entirely on your own infra (no provider sees the call), see
[`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml) and the
`examples/self-hosted/` config: local LiveKit + local Whisper STT + local TTS +
a local LLM (Ollama/vLLM), no outbound calls. Same image, local providers.
