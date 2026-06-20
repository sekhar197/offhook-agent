# offhook

> **Building a voice agent is easy. Making it safe and reliable on real calls is the hard part — offhook is the open-source voice agent that tests itself with adversarial callers and improves itself, and provably won't regress its own safety.**

A weekend gets you a voice agent that *talks*. What it doesn't get you is the hard part: knowing it won't invent a price, leak its system prompt, fumble a chest-pain caller, or quietly get worse every time you tweak it. **offhook is the open, self-hostable voice agent built around that hard part** — production-hardened tool-calling, an adversarial eval suite in the repo, and a self-improvement loop that's *gated* so a self-edit can never weaken its own safety.

Point it at whatever you're building — a receptionist, call-screening, a support line, your own experiment. Any LLM (hosted or fully local), swappable STT/TTS, your own infra. It answers real phone calls (Twilio/Telnyx) too — but the reason to reach for it isn't that it talks (lots of things talk). It's that it **tests and improves itself**, so you ship the hard part on day one.

<!-- TODO(launch): replace with the 90s demo cast — see docs/launch/demo-storyboard.md -->

```text
   ██████╗ ███████╗███████╗██╗  ██╗ ██████╗  ██████╗ ██╗  ██╗
  ██╔═══██╗██╔════╝██╔════╝██║  ██║██╔═══██╗██╔═══██╗██║ ██╔╝
  ██║   ██║█████╗  █████╗  ███████║██║   ██║██║   ██║█████╔╝
  ██║   ██║██╔══╝  ██╔══╝  ██╔══██║██║   ██║██║   ██║██╔═██╗
  ╚██████╔╝██║     ██║     ██║  ██║╚██████╔╝╚██████╔╝██║  ██╗
   ╚═════╝ ╚═╝     ╚═╝     ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝

  the open voice agent that tests itself · improves itself · won't break its own safety
```

## From zero to a number that answers

```bash
npm install -g offhook            # or run any command with: npx offhook <cmd>

offhook init                      # wizard: name, model, paste one key → agent.yaml + knowledge/
offhook doctor                    # verify config, knowledge, keys
offhook chat                      # talk to your agent in the terminal — right now, no voice keys

# add a LiveKit account + a telephony key, then:
offhook phone use +19735550142 --provider twilio   # bring your own number…
offhook phone provision --area-code 973 --provider telnyx   # …or buy a fresh one
offhook phone connect             # wires the number → LiveKit → your agent
offhook start                     # the worker answers it. call it.
```

That's the whole path: **install → init → chat → connect a number → answer real calls.** Single-key OpenAI mode means one signup gets you a talking agent; Deepgram/Cartesia/local models are one line away when you want them.

**Which keys do I need, and where do I get them?** Run **`offhook keys`** — a tiered map so you never face six signups at once:

- **Tier 0 — zero keys, fully local.** Ollama + local Whisper + local TTS, nothing leaves your box. `docker compose -f docker-compose.selfhost.yml up`. No accounts to *try* it.
- **Tier 1 — one LLM key** to chat. **Tier 2 — add LiveKit (free)** for browser voice. **Tier 3 — add a carrier** (Twilio/Telnyx) to answer a real phone.

Each line in `offhook keys` shows where to get it and whether it's already set. Copy **[`.env.example`](.env.example)** to `.env` (offhook auto-loads it — gitignored, keys never leave your machine); `offhook doctor` tells you what a given config still needs. The dashboard shows SET/MISSING too, but never stores secrets — deliberate.

## Why offhook (and not the engine underneath it)

offhook runs on [LiveKit](https://github.com/livekit/agents) for media transport — the same way a web app runs on a web server. **LiveKit is the engine; offhook is the agent.** What you'd otherwise build by hand on top of that engine, and what offhook gives you in one config file:

| The hard part | A starter template gives you | offhook gives you |
|---|---|---|
| **Proof it's safe before you ship** | nothing | an open adversarial eval suite — 38 caller personas incl. chest-pain→**911**, gas-smell→**evacuate**, prompt-injection, and system-exfil probes, plus a deterministic leak-corpus that runs key-free in CI. `npm run verify:safety` / `npm test` |
| **An agent that gets better without getting worse** | grep logs | `offhook improve` learns from your real calls and proposes a fix — applied **only if it passes the full safety eval.** Autonomous, but it can't regress its own safety. |
| **An agent that doesn't go off the rails** | a prompt | phase-gated tools (no regex intent classification), an ASR-correction layer with negation safety, hybrid BM25 + embedding knowledge search, and every tool message linted for technical leakage before it reaches the caller |
| **A real phone number** | wire SIP by hand | `offhook phone` — Twilio **or** Telnyx, new **or** bring-your-own number, provisioned + connected for you |
| **Actions that actually happen** | a webhook stub | `take_message` that really texts/emails the owner (Twilio/Resend, BYO key), idempotent so a retry never double-sends |
| **To run it anywhere** | a Dockerfile, maybe | `offhook deploy --target fly\|railway\|render\|k8s\|docker` from one tested image — or fully local/air-gapped |

You could assemble most of this yourself. offhook is the opinionated, tested, production-hardened version so you don't have to — and so you can read the source and trust what it does.

## What's under the hood

A **cascaded** pipeline — STT → LLM → TTS — because the cascade is where the brain lives (tool-calling, ASR correction, caller-safety) and where you keep control. (The research backs this: end-to-end speech-to-speech still can't tool-call reliably — Full-Duplex-Bench-v3 measures ~0.60 Pass@1 on tool use vs a cascade's clean turn-taking. offhook supports a realtime mode as an option; cascaded is the default for a reason, and the README says which.)

- **Any model.** Every OpenAI-compatible LLM — hosted (OpenAI, OpenRouter, DeepSeek, Groq, Together, NVIDIA) or local (Ollama, vLLM, llama.cpp). STT/TTS swappable, including a fully-local Whisper/Piper path. Your data never has to leave your perimeter.
- **One `agent.yaml`** — name, personality, voice, knowledge, tools, hours, transfer number, safety instructions. Editable from the CLI (`offhook config set`) or the dashboard, with every edit re-validated and backed up before it's written.
- **Observability** — every call writes a structured record (transcript, tools, outcome, per-turn latency) you can review in the dashboard or pipe anywhere.
- **7 ready-to-run examples** — receptionist, restaurant, medical clinic (clinical-safety routing), home-services dispatch (urgent + gas-smell), personal call-screening, multilingual (es/hi/te), and a fully self-hosted config.

## The part nobody else leads with: it can improve itself, safely

`offhook improve` reads your real call records, finds what's failing, and proposes an edit to your `agent.yaml` (instructions + vocabulary only — never code). In the default **gated** mode, that edit is applied **only if it passes the full eval including the safety personas.** Autonomous, but it *cannot* ship a change that regresses chest-pain→911, never-give-medical-advice, or no-internal-leak.

```mermaid
flowchart LR
  A([Your real calls]) --> B[Find what's failing]
  B --> C[Propose a config fix]
  C --> D{Re-run the FULL eval<br/>incl. safety personas:<br/>911 · no-medical-advice · gas-leak}
  D -->|safety holds| E([✅ Apply + keep a backup])
  D -->|safety regressed| F([⛔ Blocked — nothing changes])
```

Self-improving agents, voice-eval platforms (Coval, Hamming, Cekura), and eval-gated prompt optimization (DSPy, TextGrad) all exist — offhook doesn't claim to invent self-improvement. Its specific contribution is the **combination**: it's the open, self-hostable *agent itself*, that tests itself with adversarial callers, and improves itself **gated by its own safety suite.** Credit where due; the gate is the part that makes "self-improving" responsible instead of reckless.

## Run the full eval suite (from source)

```bash
git clone https://github.com/sekhar197/offhook && cd offhook
npm install && npm run build

npm run verify:safety             # adversarial caller vs your agent — does it hold the line?
npm run eval                      # the full simulated-caller scorecard
```

Every published number is regenerable by one command; the personas and judge prompts live in the repo, so a skeptic can reproduce or refute them. **Full local walkthrough** (seeding records to try `improve`, the local-model path, recording a demo): [docs/local-testing.md](docs/local-testing.md). **Phone setup, both providers, BYO number:** [docs/telephony.md](docs/telephony.md). **Deploy targets:** [docs/deploy.md](docs/deploy.md).

## Status

🚧 **Pre-release, in active development.** The architecture and turn loop are extracted from a voice agent that has answered real phone calls in production since 2025 — but the *extracted* code in this repo is pre-release: the text path, eval harness, dashboard, config editing, deploy generators, and the safety-gated `improve` loop are tested and work today (369 tests, all account-free); the voice + telephony paths are fully wired but need your LiveKit + provider accounts to run, and **Twilio is exercised in tests while the Telnyx client is implemented to their v2 API and should be validated on a live account.** For an exact, honest breakdown of what's tested vs. what needs live accounts vs. what hasn't yet run on real audio in this repo, see **[docs/testing-status.md](docs/testing-status.md)**. Watch the repo for the launch.

## Scope & governance

Deliberately narrow: **one hardened, safe, self-improving voice agent you run yourself — done well.** Bug reports very welcome. Feature requests that turn it into a multi-tenant SaaS or a visual builder will usually be declined — that's what platforms are for. The durable differentiators are the open adversarial eval suite, the safety-gated self-improvement, and the production-hardening lessons in [`docs/lessons/`](docs/lessons/).

## License

[Apache-2.0](LICENSE)
