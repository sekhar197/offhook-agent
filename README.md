# offhook

> **Don't build a voice agent. Deploy one.**

A complete, production-hardened AI voice agent that answers phone calls — bring your own keys, one command to talk to it in your browser, one config file to make it yours. Phone connectivity optional, with the SIP layer already solved.

Frameworks give you Lego bricks. Platforms give you a SaaS. **offhook gives you the finished agent**, with a year of production lessons baked into its defaults — and documented, decision by decision, in [`docs/lessons/`](docs/lessons/).

## Status

🚧 **Pre-release.** v0.1 is in active development, extracted from a voice agent that has been answering real phone calls in production since 2025. Watch the repo for the launch release.

## What's coming in v0.1

- **Cascaded pipeline**: Deepgram STT → LLM → Cartesia TTS over LiveKit, with a single-key mode (OpenAI for all three stages) so one signup gets you to a first conversation
- **Any LLM**: every OpenAI-compatible endpoint works — hosted (OpenAI, OpenRouter, NVIDIA NIM/Nemotron, DeepSeek, Groq, Together) or local (Ollama, vLLM, LM Studio, llama.cpp) — one `models.llm` block in agent.yaml
- **`agent.yaml`**: one config file — name, personality, voice, knowledge folder, tools, hours, transfer number
- **Conversation state machine**: phase-gated tools, no regex intent classification
- **ASR correction layer**: phonetic/alias resolution over your knowledge entities, with negation safety
- **Knowledge retrieval**: hybrid BM25 + embedding search over any docs you drop in `knowledge/`
- **Idempotent action execution**: for tools with real-world side effects
- **Output guardrails**: every caller-facing message linted for technical leakage
- **Published eval scorecard**: LLM-simulated callers (interrupters, mumblers, topic-switchers) graded on task completion and caller safety — regenerated every release ([eval framework](docs/evals.md))
- **Latency receipts**: measured TTFT breakdown, not vibes — core hot-path numbers are already published and reproducible via `npm run bench` ([benchmarks](docs/benchmarks.md))

## Quickstart

**Today — text test mode.** Chat with your configured agent in the terminal: real prompts, real knowledge search, real tools, any LLM. One key (or zero, with Ollama), no voice keys:

```bash
git clone https://github.com/sekhar197/offhook && cd offhook
npm install && npm run build

node bin/offhook.js init     # wizard: pick a template, paste your key
node bin/offhook.js doctor   # verifies config, knowledge, keys, endpoint
node bin/offhook.js chat     # talk to your agent
```

**With v0.1 — voice.** `docker compose up` → browser mic session, then optional phone connectivity (the same `npx offhook` flow, no clone needed).

## Scope & governance

This is an **opinionated project**, deliberately narrow in scope: one hardened voice agent, done well. Issues and bug reports are very welcome. Feature requests that broaden scope (multi-tenant platforms, visual builders, every LLM provider under the sun) will usually be declined — that's what frameworks are for.

## License

[Apache-2.0](LICENSE)
