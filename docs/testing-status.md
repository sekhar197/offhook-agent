# Testing status — what's proven, what needs your accounts, what hasn't run yet

offhook-agent is built for an audience that reads the source and runs the code. So this
page is deliberately blunt about what is and isn't verified. No silent caps: if a
claim is only proven by a unit test with a fake, it says so; if a path has never
run on real audio in *this* repo, it says that too.

**Last updated:** 2026-06-27 · **Suite:** 386 tests, all passing, ~2s, fully
account-free (`npm test`). (Count is the clean `npx vitest run` figure — the
gitignored `.stryker-tmp/` sandbox, if present from a mutation run, duplicates
test files and inflates the count; ignore it.)

---

## ✅ Tested and account-free (runs in CI on every commit)

These run with **no API keys** — fakes are injected at every I/O boundary (fake
`fetch`, fake SIP API, fake LLM completer, tmp dirs).

| Area | What's covered | Where |
|---|---|---|
| **Safety gate** | The improve gate **BLOCKS** a self-edit that regresses a safety dimension; allows safe edits; tolerates epsilon overall-regression | `src/improve/gate.test.ts` |
| **Caller-safe linter** | Tool/agent messages are rejected for technical leakage (`API`, `database`, …) and length (>120 chars) | `src/tools/tools.test.ts` |
| **Config edit safety** | Only allowlisted paths write; the brain (`models.*`) is rejected; invalid edits write nothing + create no backup | `src/config/edit.test.ts` |
| **Action delivery** | SMS (Twilio) / email (Resend) / webhook payloads + auth; failed delivery offers human transfer; **idempotency** (HTTP errors never retry) | `src/actions/delivery.test.ts`, `executor.test.ts` |
| **Telephony orchestration** | Provision / use-existing / connect / release sequences, both providers, against fake Twilio/Telnyx/LiveKit APIs | `src/telephony/*.test.ts` |
| **Search / ASR / state** | BM25 + category fallback, fuzzy resolver, ASR-correction negation guards, state derivation | `src/search/`, `src/resolver/`, `src/asr/`, `src/state/` |
| **Voice transforms** | Pronunciation, text-naturalize, semantic-interrupt, interim-speculation, endpointing tuner | `src/voice/*.test.ts` |
| **Observability** | Call records (transcript, tools, outcome, latency), malformed-line tolerance | `src/observability/*.test.ts` |
| **Deploy generators** | fly / railway / render / k8s / docker artifacts (snapshot-tested) from one image | `src/deploy/generators.test.ts` |
| **Dashboard API** | Routes, token guard, no-key-value-leak | `src/server/dashboard.test.ts` |
| **Adversarial corpus** | 50+ leak/injection/exfil probes through the caller-safe linter; secrets never reach the dashboard surface | `src/security/*.test.ts` |
| **Stress / concurrency / chaos** | 500-call idempotency burst, 300-write log concurrency + corruption tolerance, 10k-entry search, hostile-input fuzz | `test/stress/*` |
| **Mutation (Stryker)** | 71% across the safety/correctness crown jewels — proves the tests catch regressions | `npm run test:mutation` |

## 🔑 Wired, but needs live accounts to verify (not run in CI)

The code is complete and instantiates real providers; it just can't run without
credentials, so CI exercises it with fakes only.

| Path | Needs | Status in this repo |
|---|---|---|
| **LLM turn loop on a real model** | `OPENAI_API_KEY` (or Ollama/local) | Run via `npm run eval` / `npm run verify:safety`; not part of `npm test` |
| **Browser-mic voice round-trip** (`offhook-agent dev`) | `LIVEKIT_*` + an LLM key | Wired; verify on your LiveKit |
| **Real phone call** (`offhook-agent start`) | `LIVEKIT_*`, `LIVEKIT_SIP_URI`, `TWILIO_*` or `TELNYX_*` | Wired; see [runbook-livecall.md](runbook-livecall.md) |
| **SMS / email delivery actually landing** | `TWILIO_*` / `RESEND_API_KEY` | Payloads tested; live send is yours to confirm |
| **Telnyx** (any path) | `TELNYX_API_KEY` | Implemented to the v2 API; **validate on a live account** — open item |

## ⚠️ Never run on real audio in *this* repo

The architecture and turn loop are production-proven in the closed-source parent
(Nirvah), but the extracted offhook-agent code has **not** been exercised end-to-end on
real audio here. Specifically unverified in this repo:

- The full STT → LLM → TTS cascade over LiveKit on live audio.
- **Narrowband (8 kHz mono) telephony audio** — VAD/STT/endpointing are tuned for
  wideband; phone audio degrades them. Validate on a real call.
- **SIP REFER warm transfer** — the LiveKit call is real and unit-tested against a
  fake; REFER behavior varies by carrier. On failure it falls back to reading the
  number aloud (never dead-air), but the live REFER is unverified.
- **Realtime (speech-to-speech) mode** — config parsing is tested; no audio run.

See [runbook-livecall.md](runbook-livecall.md) for the live verification steps and
[real-call-report.md](real-call-report.md) to record results. The harness is
written and waiting: `offhook-agent doctor` now preflights LiveKit creds, the SIP URI,
and speech-plugin presence (so a real call doesn't fail mid-stream on a missing
plugin), and `npm run e2e` (`test/e2e/headless-livekit.ts`) dispatches the worker
into a real room — its audio-frame assertion is the documented live step.

## 🧪 Brutal-testing coverage (in progress, pre-launch)

Tracking the hardening pass that backs the "production-grade" claim. Updated as
each tier lands.

- [x] **Adversarial corpus** — 50+ leak / prompt-injection / exfil probes through
      the caller-safe linter, account-free (`src/security/corpus.test.ts`), plus a
      bite-test (weakening the guard makes it fail). Dedicated `prompt-injection` /
      `system-exfil` / `pii-fishing` personas now run in the safety gate
      (`src/evals/personas.ts` → `SAFETY_PERSONAS`).
- [x] **Secret-leak tests** — sentinel secrets for every provider swept through
      the dashboard's config + key-status projections; none ever appear in output
      (`src/security/secret-leak.test.ts`). *Note: call-record transcripts capture
      what the caller said by design; a PII-redaction middleware is roadmap, not
      built — see Honest limitations.*
- [x] **Mutation testing (Stryker)** — `npm run test:mutation`, scoped to the
      safety/correctness crown jewels. Aggregate **~71%**; caller-safe linter
      **90.63%**, config-edit allowlist **73.33%**, idempotency/executor **~70%**,
      gate decision logic — the safety comparison (`c < b`), the missing-dimension
      fail-safe, and the overall-regression check are all killed; surviving mutants
      on the gate are cosmetic (reason-string formatting, optional `onProgress`).
      (ASR-correction is excluded — it's heuristic quality code whose
      safety-relevant guards are covered by the corpus; its scoring thresholds
      produce equivalent-mutant noise, not signal.) Found and fixed real holes:
      a `>`→`>=` length boundary and the gate's missing-dimension fail-safe.
- [x] **Property/fuzz (fast-check)** — caller-safe invariants (banned term always
      caught, length boundary, never throws) and the config-edit allowlist (no
      non-allowlisted path ever writes) across thousands of generated inputs
      (`*.property.test.ts`).
- [x] **Stress / concurrency / chaos** (`test/stress/`, account-free, in-suite):
      - **500 concurrent** `executeAction` calls → every idempotency key unique,
        each lands exactly once (no cross-call collision, no double-send).
      - **Chaos:** injected connection failures retry once then offer a human
        (`failed_offer_transfer`) — never a silent third try, never dead-air;
        HTTP 5xx never retries (the receiver may have acted).
      - **300 concurrent** jsonl record appends → all read back intact; a
        corrupted log (half-written + garbage + blank lines) still yields every
        good record.
      - **10k-entry knowledge base** → needle found and ranked first, result set
        bounded (<100), search completes <3s (BM25 path).
      - **Hostile input** (100k-char strings, emoji storms, mixed scripts, control
        chars, + 300 fuzzed unicode runs) → the caller-safe and ASR guards never
        throw and never spurious-correct.

## Honest limitations (won't pretend otherwise)

- "Production-grade" refers to the hardening (state-gated tools, ASR correction,
  caller-safety, idempotent delivery, the safety gate) and the test discipline —
  **not** to SOC2 / RBAC / a PII-redaction middleware (not built; on the roadmap).
- You are the operator of record for any phone line — see
  [telephony.md](telephony.md) for consent / AI-disclosure / TCPA responsibilities.
