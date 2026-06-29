# 90-second demo storyboard (LOCKED) — "ready in minutes · won't break its own safety"

The one viral artifact. A terminal screencast (no face, no voiceover needed —
captions carry it). Two acts, matched to the README:

- **Act 1 (~0:00–0:35) — the adoption hook:** zero → a real number answering, in
  a handful of commands. *"A voice agent, ready in minutes, on your own infra."*
- **Act 2 (~0:35–1:25) — the differentiator + money shot:** it improves itself
  from real calls, and the **gate blocks an unsafe self-edit.** *"Autonomous ≠
  reckless."*

Act 1 is why a dev tries it. Act 2 is why they remember it and share it.

**Tools:** record the terminal with [asciinema](https://asciinema.org) (crisp,
embeddable, copy-pastable) or a plain screen recording. Add captions in
CapCut/iMovie. Target 80–95 seconds. End with a still card.

**Hook line (pinned caption / thumbnail):**
> *A production-grade phone agent you stand up in minutes — that improves itself from real calls and refuses to ship a change that breaks its own safety evals.*

---

## ACT 1 — ready in minutes (the hook)

**0:00–0:10 — install + init.**
Show, fast (cut the waiting):
```
npm install -g offhook-agent
offhook-agent init        # name, model, paste one key
offhook-agent chat        # → a real, tool-using exchange in the terminal
```
Caption: *"Open-source phone agent. One key, one config file. Talking in the terminal already — no voice setup yet."*

**0:10–0:25 — put a phone number on it.**
```
offhook-agent phone use +1973••••••• --provider twilio   # or provision a fresh one
offhook-agent phone connect
offhook-agent start        # the worker answers it
```
Caption: *"Bring your own number — Twilio or Telnyx — or buy one. Connect it to LiveKit. Done."*

**0:25–0:35 — it answers a real call.**
Show a phone dialing it + the live transcript scrolling in the worker logs (agent
greets with its AI disclosure, answers a knowledge question, takes a message).
Caption: *"That's a real call. Minutes from `npm install`, on your infra, your provider."*

---

## ACT 2 — and it won't break its own safety (the money shot)

**0:35–0:45 — a real failure.**
Show a `call-records.jsonl` line / transcript snippet where the agent fumbled
(invented a price, hesitated on an emergency). Caption: *"Real calls. Real misses. Normally you'd hand-read transcripts and guess at a prompt fix."*

**0:45–0:57 — `offhook-agent improve` proposes a fix.**
Run it. Show `ingesting… proposing…`, then the **proposed patch** — rationale +
the `instructions` diff. Caption: *"It reads the calls, finds the pattern, and proposes an edit to the config — never the code."*

**0:57–1:07 — the gate runs.**
Show `gating-baseline… gating-candidate…` and `overall 82% → 91%`. Caption: *"Then it re-runs the FULL eval — including the safety callers: chest-pain → 911, gas-smell → evacuate, prompt-injection."*

**1:07–1:18 — THE MONEY SHOT: blocked.**
Run the staged unsafe variant. Show:
```
Gate: ⛔ BLOCK — safety regression on no_phantom_claims: 60% < baseline 100%
(no change written; agent.yaml untouched)
```
Caption: *"A 'better' edit that would weaken a safety behavior? Blocked. Autonomous ≠ reckless."*

**1:18–1:25 — the safe one ships.**
Run the good variant: `Gate: ✅ PASS … Applied (gated). backup: agent.yaml.bak.…` Caption: *"A safe improvement passes, applies itself, keeps a backup. Provably safe."*

**1:25–1:32 — end card (still).**
> **offhook-agent** — a production-grade voice agent. Your infra. Your provider. Ready in minutes.
> It answers real calls · it tests itself · it improves itself · it can't break its own safety.
> `github.com/sekhar197/offhook-agent` · built by Sekhar Makkapati · sekharmakkapati.com

---

## Staging the two gate outcomes (deterministic, repeatable)

The gate's verdict comes from the LLM-driven eval — so for a clean, repeatable
recording, stage it rather than gamble live:

1. **Seed call records** with a couple of realistic failing calls in
   `call-records.jsonl`.
2. **The BLOCK take:** craft a candidate `instructions` edit that trades a safety
   behavior for "helpfulness" (e.g. softening the 911 / no-medical-advice rule).
   Run the gate; it regresses a safety dimension and blocks. (The unit test
   `pipeline.test.ts → "BLOCKS a patch that regresses a safety dimension"` proves
   this deterministically — you can show that passing test on screen as proof.)
3. **The PASS take:** a genuinely additive edit (e.g. "if unsure of a price, say
   you'll check") that fixes the failure without touching safety. Gate passes.

Record both, cut them together. If a live run is too slow/noisy on camera, scope
it with `OFFHOOK_AGENT_EVAL_ONLY` or a small persona subset, or screen-record the
deterministic test as the "proof" intercut.

**Act 1 note:** if a live phone call is awkward to film, the browser-mic path
(`offhook-agent dev`) is a clean substitute for the "it answers" beat — same brain,
easier to capture on one screen. Redact the real number on screen either way.

## Where it goes

- The **README** top (asciinema embed or GIF).
- The **Show HN** post (first comment) and the **LinkedIn launch post**.
- The **launch essay** as the opening visual.
