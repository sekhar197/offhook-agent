# Evals & benchmarking

A voice agent's quality claims need receipts. offhook ships a four-tier
eval framework; each tier answers a different question.

## Tier 1 — unit tests (per-commit CI, no API keys)

*"Did a change break a core behavior?"*

~180 deterministic tests over search, the entity resolver, ASR-correction
guards (negation/greeting safety, verbatim dedup, confidence gates), the
state machine, prompt-builder invariants (byte-stable cached prefix), the
caller-safety guard, and the action executor's retry/idempotency contract
(verified against a real HTTP server). Run: `npm test`.

## Tier 2 — golden conversation scenarios (per-commit CI, no API keys)

*"Does a multi-turn flow still hold together?"*

Scripted multi-turn scenarios driving the turn loop with recorded tool
calls — interruption recovery, silence re-engagement, transfer triggers,
refusal handling, pagination. **Lands with the Milestone B turn loop**
(the harness is ported from a production suite of 21 scenarios).

## Tier 3 — LLM-judged simulated calls (nightly; costs API money)

*"Is the agent actually good on the phone?"*

An LLM plays caller personas — the interrupter, the mumbler, the
topic-switcher, the nonsense caller, non-native phrasing — against the
real agent loop. An LLM judge scores each call on:

- task completion (did the caller get what they needed?)
- search-before-deny (never claimed something unavailable without searching)
- caller safety (no technical language, no >120-char monologues)
- no phantom claims (nothing invented)

Output is the **published scorecard**, regenerated per release. Lands with
Milestone B; runs via the nightly-evals workflow already in CI.

## Tier 4 — audio-level evals (roadmap)

*"Does ASR correction survive real accents?"*

TTS-generated accented audio fixtures pushed through real STT, end to end.

## Latency benchmarks

Two distinct measurements — don't conflate them:

1. **Core hot path** (`npm run bench`, deterministic, no network):
   search/resolver/prompt-build latency, retrieval accuracy (hit@1/hit@3),
   and a 10k-entry stress run. Results: [benchmarks.md](benchmarks.md).
   The core must stay invisible next to the models.
2. **Pipeline TTFT** (Milestone B, live deployment): caller-stops-speaking →
   first-audio-back, broken down into STT-final / LLM-first-token /
   first-TTS-frame. This is the number callers feel, and it depends on the
   models you configure — which is why it's measured per deployment, and
   why the published table states its exact model config.

## Model choice and latency

offhook is model-agnostic (any OpenAI-compatible endpoint — hosted or
local; see the `models.llm` section of agent.yaml). Latency guidance:

- Fast hosted inference (Groq, NVIDIA NIM) or a small local model on a GPU
  can beat the default TTFT.
- A large local model on CPU will feel laggy on the phone, even though it
  works. Run the Milestone B TTFT harness against your own config before
  going live — the agent's human-feel layer can hide ~1s of thinking, not 5.
