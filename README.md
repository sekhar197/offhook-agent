# offhook

> **The open, safety-first voice agent — that tests itself, and improves itself without breaking its own safety.**

offhook is a production-hardened, self-hostable AI voice agent that answers phone calls. Bring your own keys, any model (hosted or fully local), one config file. What makes it different isn't that it talks — lots of things talk. It's that **offhook tests itself with adversarial callers, and can improve itself from real calls — gated so a self-edit can never regress the behaviors that matter** (handing a chest-pain caller to 911, never giving medical advice, never leaking internals).

```
offhook improve
  → reads your real calls → finds what's failing → proposes a config fix
  → re-runs the full eval INCLUDING the safety personas
  → ships the change ONLY if safety still holds.   Otherwise: blocked.
```

## Why this is different (and what already exists — credit where due)

Self-improving agents ([Hermes](https://github.com/NousResearch/hermes-agent)), voice-eval platforms (Coval, Hamming, Cekura), and eval-gated prompt optimization (DSPy, TextGrad) all exist. offhook is **not** claiming to invent self-improvement. Its specific, uncontested contribution is the **combination**:

1. **It's the agent itself — open and self-hostable.** Not a closed SaaS you point at someone else's agent; not a framework you assemble. BYO keys, any OpenAI-compatible LLM, STT/TTS swappable, runs fully local. Your data never leaves your box.
2. **It tests itself — an open adversarial eval harness, in the repo.** 35 LLM-driven caller personas across 9 verticals, including the ones that matter: a chest-pain caller who must be sent to **911**, a gas-smell caller who must be told to **evacuate**, and prompt-injection probes. `npm run eval` and `npm run verify:safety` — free, reproducible, CI-gateable. No SaaS.
3. **It improves itself — safely.** `offhook improve` learns from real call records and proposes edits to your `agent.yaml`. In the default **gated** mode, a change is applied *only if* it passes the full eval including the safety personas. Autonomous, but it **cannot** regress its own safety. (An `--unguarded` mode exists for the brave; it warns loudly.)

The safety gate is the part nobody else leads with — and it's the reason "self-improving" is responsible here instead of reckless.

## What it is (the agent under the hood)

A production-hardened **cascaded** pipeline — STT → LLM → TTS over [LiveKit](https://github.com/livekit/agents) — because the cascade is where the brain lives (tool-calling, ASR correction, caller-safety), and where self-improvement can act:

- **Any model.** Every OpenAI-compatible LLM: hosted (OpenAI, OpenRouter, DeepSeek, Groq, Together, NVIDIA) or local (Ollama, vLLM, llama.cpp). STT/TTS swappable, incl. a fully-local Whisper/Piper path.
- **One `agent.yaml`** — name, personality, voice, knowledge, tools, hours, transfer number, safety instructions.
- **The hardening**, learned answering real calls: phase-gated tools (no regex intent classification), an ASR-correction layer with negation safety, hybrid BM25 + embedding knowledge search, idempotent action execution, and every caller-facing message linted for technical leakage.
- **Actions that land** — `take_message` actually texts/emails the owner (Twilio/Resend, BYO key); webhook for everything else.
- **Observability** — every call writes a structured record (transcript, tools, outcome, per-turn latency) you can review.
- **9 example verticals** — receptionist, restaurant, medical clinic (clinical-safety routing), home-services dispatch (urgent + gas-smell), personal call-screening, multilingual (es/hi/te), fully self-hosted.

## Quickstart

**Works today — no voice keys, no telephony.** Talk to your agent in the terminal, run the evals, and try the self-improvement loop with a single LLM key (or $0 on a local model):

```bash
git clone https://github.com/sekhar197/offhook && cd offhook
npm install && npm run build

node bin/offhook.js init      # wizard: pick a template, paste your key
node bin/offhook.js chat      # talk to your agent (real prompts, search, tools)

npm run verify:safety         # adversarial caller vs your agent — does it hold the line?
npm run eval                  # the full simulated-caller scorecard
node bin/offhook.js improve   # learn from call records; propose a safe, gated edit
```

**Voice & phone.** A LiveKit account + provider keys turn on the browser-mic and SIP paths (`docker compose up` → talk in your browser; point a number at it to answer real calls). See [docs/deploy.md](docs/deploy.md) and [docs/telephony.md](docs/telephony.md) — honest about what's wired and what isn't.

## Status

🚧 **Pre-release, in active development**, extracted from a voice agent answering real phone calls in production since 2025. The text path, the eval harness, and the safety-gated `improve` loop work today; the voice/telephony paths need your LiveKit + provider accounts; a local web dashboard is on the near roadmap. Watch the repo for the launch.

## Scope & governance

Deliberately narrow: **one hardened, safe, self-improving voice agent — done well.** Bug reports very welcome. Feature requests that broaden scope into a multi-tenant SaaS or a visual builder will usually be declined — that's what platforms are for. The durable differentiators here are the open adversarial eval harness, the safety-gated self-improvement, and the production-hardening lessons in [`docs/lessons/`](docs/lessons/).

## License

[Apache-2.0](LICENSE)
