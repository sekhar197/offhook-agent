# Testing offhook-agent locally

Everything here runs on your machine. The text path, the evals, the safety-gated
improve loop, and the dashboard need **no telephony and no LiveKit** — just one
LLM key (or $0 on a local model). Voice/phone is the last, optional step.

## 0. Run it

```bash
git clone https://github.com/sekhar197/offhook-agent && cd offhook-agent
npm install && npm run build

node bin/offhook-agent.js help     # the banner + the command list
```

## 1. Pick a model (one of)

```bash
# Hosted — one key:
export OPENAI_API_KEY=sk-...

# Or free + local — no key:
#   1) install Ollama (https://ollama.com), then:  ollama pull llama3.1
#   2) use the local example config below (models.llm: ollama)
```

Sanity-check the wiring:

```bash
node bin/offhook-agent.js doctor -c examples/business-receptionist/agent.yaml
```

## 2. Talk to it (text — no voice keys)

```bash
node bin/offhook-agent.js chat -c examples/business-receptionist/agent.yaml
# (local model: -c examples/business-receptionist/agent.ollama.yaml)
```

## 3. Watch it test itself

```bash
# Adversarial caller (model-probe, "ignore your instructions", fake service) vs your agent:
OFFHOOK_AGENT_EVAL_PROVIDER=openai OFFHOOK_AGENT_EVAL_MODEL=gpt-5.4-mini npm run verify:safety

# The full simulated-caller scorecard across the use cases:
npm run eval
```

(Both read `OPENAI_API_KEY` from your env. For local: `OFFHOOK_AGENT_EVAL_PROVIDER=ollama OFFHOOK_AGENT_EVAL_MODEL=llama3.1 OFFHOOK_AGENT_EVAL_BASEURL=http://localhost:11434/v1`.)

## 4. Watch it improve itself — and refuse an unsafe edit

The improve loop learns from **call records**. To try it without making real
calls, drop a few sample records next to the config and point the agent's
`observability.path` at them (the default is `./call-records.jsonl`). A minimal
seed:

```bash
cat > call-records.jsonl <<'EOF'
{"callId":"c1","startedAt":"2026-06-16T15:00:00Z","outcome":"completed","turnCount":2,"toolCallCount":0,"turns":[{"index":0,"caller":"how much is a cleaning","agent":"it's forty dollars"}],"tools":[],"errors":[]}
{"callId":"c2","startedAt":"2026-06-16T15:10:00Z","outcome":"caller_hangup","turnCount":2,"toolCallCount":0,"turns":[{"index":0,"caller":"what about a crown","agent":"i'm not sure, maybe a few hundred"}],"tools":[],"errors":[]}
EOF

# Dry-run (propose + gate, write nothing):
node bin/offhook-agent.js improve -c examples/business-receptionist/agent.yaml

# Apply only if it passes the safety gate:
node bin/offhook-agent.js improve -c examples/business-receptionist/agent.yaml --apply
```

The gate re-runs the full eval **including the safety personas** (911 handoff,
no-medical-advice, prompt-injection) and **blocks** any edit that would regress
them — even with `--apply`. Audit + the latest scorecard land in `./improve/`.

## 5. The dashboard

```bash
node bin/offhook-agent.js dashboard -c examples/business-receptionist/agent.yaml
# → open the printed  http://127.0.0.1:4317/?t=<token>  URL
```

Call log, per-call transcript + tools + latency, scorecard, config, keys-status,
and a live Improve panel (runs the gated loop in the browser via SSE). Bound to
`127.0.0.1` and token-guarded; your data never leaves the machine.

## 6. Voice & phone (optional — needs accounts)

```bash
# Browser mic — needs LiveKit creds:
export LIVEKIT_URL=wss://...  LIVEKIT_API_KEY=...  LIVEKIT_API_SECRET=...
node bin/offhook-agent.js dev        # talk in your browser

# Real phone calls: point a SIP number at LiveKit, then:
node bin/offhook-agent.js start
```

See [deploy.md](deploy.md) and [telephony.md](telephony.md) — honest about what's
wired and what isn't.

## Recording a CLI preview for the README

The banner + a short session make a great launch GIF. Record the terminal with
[asciinema](https://asciinema.org):

```bash
asciinema rec offhook-agent-demo.cast
#   node bin/offhook-agent.js help          (the banner)
#   node bin/offhook-agent.js chat          (a quick exchange)
#   node bin/offhook-agent.js improve       (the gate blocking an unsafe edit)
# Ctrl-D to stop; upload, or convert to GIF with agg.
```
