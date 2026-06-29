# offhook-agent

> **Self-improving AI agents are easy to build now — OpenAI even ships a cookbook for it. Gating them on *safety* is the missing piece. offhook-agent is the open reference implementation: a voice agent that improves itself from real calls, where any self-edit that regresses an adversarial safety check (chest-pain→911, no-leak, no-phantom-claims) is blocked before it ships.**

A weekend gets you a voice agent that *talks*. What it doesn't get you is the hard part: knowing it won't invent a price, leak its system prompt, fumble a chest-pain caller, or quietly get worse every time it (or you) tweaks it. **offhook-agent is the open, self-hostable voice agent built around that hard part** — production-hardened tool-calling, an adversarial eval suite in the repo, and a self-improvement loop that's *gated by that suite*, so a self-edit which weakens a safety check is blocked before it ships.

Point it at whatever you're building — a receptionist, call-screening, a support line, your own experiment. **It's a complete voice agent — real phone calls (Twilio/Telnyx), knowledge search, human transfer, message-taking — that runs entirely on _your_ infrastructure and _your_ models** (any LLM hosted or fully local, swappable STT/TTS, air-gapped with zero telemetry if you want — nothing the SaaS players can offer). Lots of things talk; the reason to reach for *this* one is that it **tests and improves itself, gated so it can't regress its own safety.**

📄 **The methodology behind it** — *Safety-Gated Self-Improvement for Production Voice Agents* — is written up as a preprint: [`paper/safety-gated-self-improvement.md`](paper/safety-gated-self-improvement.md). This repo is its open reference implementation: every claim in the paper is something you can run here and reproduce or refute.

<p align="center">
  <img src="docs/launch/safety-gate.gif" alt="The offhook-agent safety gate rejecting a self-edit that scored higher overall because it regressed a safety check" width="820">
</p>

> <sub>**Above — the safety gate, _one guarantee inside a complete, self-hostable voice agent_:** `npm run demo:safety-gate` shows a self-edit that scored *higher overall* but regressed a safety check getting **blocked** (the case a naive self-improvement loop would ship). Reproducible with **no API key**; regenerate from source with `vhs docs/launch/safety-gate.tape`. The full agent — answering real calls on your own infra/models, then improving itself — is what the rest of this README (and the [launch video](docs/launch/RECORDING.md)) shows.</sub>

```text
   ██████╗ ███████╗███████╗██╗  ██╗ ██████╗  ██████╗ ██╗  ██╗
  ██╔═══██╗██╔════╝██╔════╝██║  ██║██╔═══██╗██╔═══██╗██║ ██╔╝
  ██║   ██║█████╗  █████╗  ███████║██║   ██║██║   ██║█████╔╝
  ██║   ██║██╔══╝  ██╔══╝  ██╔══██║██║   ██║██║   ██║██╔═██╗
  ╚██████╔╝██║     ██║     ██║  ██║╚██████╔╝╚██████╔╝██║  ██╗
   ╚═════╝ ╚═╝     ╚═╝     ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝

  the open voice agent that tests itself · improves itself · blocks self-edits that regress safety
```

## From zero to a number that answers

```bash
npm install -g offhook-agent            # or run any command with: npx offhook-agent <cmd>

offhook-agent init                      # wizard: name, model, paste one key → agent.yaml + knowledge/
offhook-agent doctor                    # verify config, knowledge, keys
offhook-agent chat                      # talk to your agent in the terminal — right now, no voice keys

# add a LiveKit account + a telephony key, then:
offhook-agent phone use +19735550142 --provider twilio   # bring your own number…
offhook-agent phone provision --area-code 973 --provider telnyx   # …or buy a fresh one
offhook-agent phone connect             # wires the number → LiveKit → your agent
offhook-agent start                     # the worker answers it. call it.
```

That's the whole path: **install → init → chat → connect a number → answer real calls.** Single-key OpenAI mode means one signup gets you a talking agent; Deepgram/Cartesia/local models are one line away when you want them.

**Which keys do I need, and where do I get them?** Run **`offhook-agent keys`** — a tiered map so you never face six signups at once:

- **Tier 0 — zero keys, fully local.** Ollama + local Whisper + local TTS, nothing leaves your box. `docker compose -f docker-compose.selfhost.yml up`. No accounts to *try* it.
- **Tier 1 — one LLM key** to chat. **Tier 2 — add LiveKit (free)** for browser voice. **Tier 3 — add a carrier** (Twilio/Telnyx) to answer a real phone.

Each line in `offhook-agent keys` shows where to get it and whether it's already set. Copy **[`.env.example`](.env.example)** to `.env` (offhook-agent auto-loads it — gitignored, keys never leave your machine); `offhook-agent doctor` tells you what a given config still needs. The dashboard shows SET/MISSING too, but never stores secrets — deliberate.

## Why offhook-agent (and not the engine underneath it)

offhook-agent runs on [LiveKit](https://github.com/livekit/agents) for media transport — the same way a web app runs on a web server. **LiveKit is the engine; offhook-agent is the agent.** What you'd otherwise build by hand on top of that engine, and what offhook-agent gives you in one config file:

| The hard part | A starter template gives you | offhook-agent gives you |
|---|---|---|
| **Proof it's safe before you ship** | nothing | an open adversarial eval suite — 38 caller personas (6 run as the mandatory safety gate) incl. chest-pain→**911**, gas-smell→**evacuate**, prompt-injection, and system-exfil probes, plus a deterministic leak-corpus that runs key-free in CI. `npm run verify:safety` / `npm test` |
| **An agent that gets better without getting worse** | grep logs | `offhook-agent improve` learns from your real calls and proposes a fix — applied **only if it passes the full safety eval.** Autonomous in gated mode, but a self-edit that regresses any safety check is blocked before it ships. |
| **An agent that doesn't go off the rails** | a prompt | phase-gated tools (no regex intent classification), an ASR-correction layer with negation safety, hybrid BM25 + embedding knowledge search, and every tool message linted for technical leakage before it reaches the caller |
| **A real phone number** | wire SIP by hand | `offhook-agent phone` — Twilio **or** Telnyx, new **or** bring-your-own number, provisioned + connected for you |
| **Actions that actually happen** | a webhook stub | `take_message` that really texts/emails the owner (Twilio/Resend, BYO key), idempotent so a retry never double-sends |
| **To run it anywhere** | a Dockerfile, maybe | `offhook-agent deploy --target fly\|railway\|render\|k8s\|docker` from one tested image — or fully local/air-gapped |

You could assemble most of this yourself. offhook-agent is the opinionated, tested, production-hardened version so you don't have to — and so you can read the source and trust what it does.

## What's under the hood

A **cascaded** pipeline — STT → LLM → TTS — because the cascade is where the brain lives (tool-calling, ASR correction, caller-safety) and where you keep control. (The research backs this: end-to-end speech-to-speech still can't tool-call reliably — Full-Duplex-Bench-v3 measures ~0.60 Pass@1 on tool use vs a cascade's clean turn-taking. offhook-agent supports a realtime mode as an option; cascaded is the default for a reason, and the README says which.)

- **Any model.** Every OpenAI-compatible LLM — hosted (OpenAI, OpenRouter, DeepSeek, Groq, Together, NVIDIA) or local (Ollama, vLLM, llama.cpp). STT/TTS swappable, including a fully-local Whisper/Piper path. Your data never has to leave your perimeter.
- **One `agent.yaml`** — name, personality, voice, knowledge, tools, hours, transfer number, safety instructions. Editable from the CLI (`offhook-agent config set`) or the dashboard, with every edit re-validated and backed up before it's written.
- **Observability** — every call writes a structured record (transcript, tools, outcome, per-turn latency) you can review in the dashboard or pipe anywhere.
- **7 ready-to-run examples** — receptionist, restaurant, medical clinic (clinical-safety routing), home-services dispatch (urgent + gas-smell), personal call-screening, multilingual (es/hi/te), and a fully self-hosted config.

## The part nobody else leads with: it can improve itself, safely

`offhook-agent improve` reads your real call records, finds what's failing, and proposes an edit to your `agent.yaml` (instructions + vocabulary only — never code). In the default **gated** mode, that edit is applied **only if it passes the full eval including the safety personas.** It's defense-in-depth: the proposer is hard-constrained never to *suggest* a change that weakens safety, and even if one slipped through, the gate **blocks** any change that regresses chest-pain→911, never-give-medical-advice, or no-internal-leak before it ships.

```mermaid
flowchart LR
  A([Your real calls]) --> B[Find what's failing]
  B --> C[Propose a config fix]
  C --> D{Re-run the FULL eval<br/>incl. safety personas:<br/>911 · no-medical-advice · gas-leak}
  D -->|safety holds| E([✅ Apply + keep a backup])
  D -->|safety regressed| F([⛔ Blocked — nothing changes])
```

### How offhook-agent relates to what's already out there

Every ingredient here already exists in open source — offhook-agent's contribution is the **specific glue**, and we credit prior art precisely (don't take our word for the gap; check the repos):

- **Voice substrate.** [Pipecat](https://github.com/pipecat-ai/pipecat), [LiveKit Agents](https://github.com/livekit/agents), and [Dograh](https://github.com/dograh-hq/dograh) (the no-code OSS Vapi/Retell alternative) own the *build-a-voice-agent* category. offhook-agent runs on LiveKit; it is **not** trying to out-build them.
- **The self-improvement loop is a known, public pattern.** OpenAI's [self-evolving-agent cookbook](https://developers.openai.com/cookbook/examples/partners/self_evolving_agents/autonomous_agent_retraining) (Nov 2025) ships runnable code for it; [Cekura](https://www.cekura.ai/blogs/self-improving-voice-agents-closing-eval-loop) ships the exact diagnose→edit→re-validate loop (paid SaaS, gated on *quality/overfitting*); DSPy / TextGrad / GEPA are the optimizers. offhook-agent does **not** claim to invent self-improvement.
- **Adversarial safety evals are commodity.** DeepTeam, [garak](https://github.com/NVIDIA/garak), [promptfoo](https://github.com/promptfoo/promptfoo), and [Future AGI](https://github.com/future-agi/future-agi)'s 18 scanners all cover this attack surface. But each is a *standalone tool you point at an agent.*

**What's missing — and what offhook-agent is:** none of the above wires an **adversarial-*safety* eval as a blocking gate on the agent's own self-edits**, constrained to a config surface disjoint from the safety kernel. OpenAI's own cookbook flags the gap in plain text ("you'd want additional guardrails and a human-in-the-loop"). offhook-agent is that missing safety layer — open, in the agent, with the method written up in the [preprint](paper/safety-gated-self-improvement.md) so it's reproducible and creditable even if a larger player ships the same combination tomorrow.

**The guarantee, and how it's proven (3 layers, run them yourself):**
*A self-edit can raise overall quality and still be **blocked** if it regresses any safety dimension.* That rule is a pure function in [`src/improve/gate.ts`](src/improve/gate.ts), and the proof is independently reproducible:
1. **Unit (deterministic, no key):** `gate.test.ts` asserts a candidate with a *higher overall score but a regressed safety dimension* is blocked — and is mutation-tested.
2. **End-to-end (no key):** `pipeline.test.ts` runs the whole loop and asserts a regressing patch is blocked and `agent.yaml` is left untouched, even with `--apply`.
3. **Live (your LLM key):** `npm run demo:safety-gate` scores the real agent vs. an edited one on the adversarial personas and shows the block on an actual model. With no key it falls back to a deterministic run of the same money-shot.

## Run the full eval suite (from source)

```bash
git clone https://github.com/sekhar197/offhook-agent && cd offhook-agent
npm install && npm run build

npm run verify:safety             # adversarial caller vs your agent — does it hold the line?
npm run eval                      # the full simulated-caller scorecard
```

Every published number is regenerable by one command; the personas and judge prompts live in the repo, so a skeptic can reproduce or refute them. **Full local walkthrough** (seeding records to try `improve`, the local-model path, recording a demo): [docs/local-testing.md](docs/local-testing.md). **Phone setup, both providers, BYO number:** [docs/telephony.md](docs/telephony.md). **Deploy targets:** [docs/deploy.md](docs/deploy.md).

## Status

🚧 **Pre-release, in active development.** The architecture and turn loop are extracted from a voice agent that has answered real phone calls in production since 2025 — but the *extracted* code in this repo is pre-release: the text path, eval harness, dashboard, config editing, deploy generators, and the safety-gated `improve` loop are tested and work today (386 tests, all account-free); the voice + telephony paths are fully wired but need your LiveKit + provider accounts to run, and **Twilio is exercised in tests while the Telnyx client is implemented to their v2 API and should be validated on a live account.** For an exact, honest breakdown of what's tested vs. what needs live accounts vs. what hasn't yet run on real audio in this repo, see **[docs/testing-status.md](docs/testing-status.md)**. Watch the repo for the launch.

## Scope & governance

Deliberately narrow: **one hardened, safe, self-improving voice agent you run yourself — done well.** Bug reports very welcome. Feature requests that turn it into a multi-tenant SaaS or a visual builder will usually be declined — that's what platforms are for. The durable differentiators are the open adversarial eval suite, the safety-gated self-improvement, and the production-hardening lessons in [`docs/lessons/`](docs/lessons/).

## License

[Apache-2.0](LICENSE)
