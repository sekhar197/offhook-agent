# 90-second demo storyboard — "the agent that won't break its own safety"

The one viral artifact. A terminal screencast (no face, no voiceover needed —
captions carry it). The money shot is the **gate blocking an unsafe self-edit.**

**Tools:** record the terminal with [asciinema](https://asciinema.org) (crisp,
embeddable, copy-pastable) or a plain screen recording. Add captions in
CapCut/iMovie. Target 75–95 seconds. End with a still card.

**Hook line (pinned caption / thumbnail):**
> *A voice agent that improves itself from real calls — and refuses to ship a change that breaks its own safety evals.*

---

## Beats

**0:00–0:08 — the setup (caption only).**
Caption: *"offhook is an open-source phone agent. It also tests itself, and improves itself. Watch the part nobody else does."*
Show the repo / a one-line `offhook chat` exchange so viewers see it's a real agent.

**0:08–0:20 — a real failure.**
Show a `call-records.jsonl` line or a transcript snippet where the agent fumbled (e.g. invented a price, or hesitated on an emergency). Caption: *"Real calls. Real misses. Normally you'd hand-read transcripts and guess at a prompt fix."*

**0:20–0:35 — `offhook improve` proposes a fix.**
Run it. Show the staged output: `ingesting… proposing…`, then the **proposed patch** — the rationale + the `instructions` diff. Caption: *"It reads the calls, finds the pattern, and proposes an edit to the config — never the code."*

**0:35–0:50 — the gate runs.**
Show `gating-baseline… gating-candidate…` and the scorecard line: `overall 82% → 91%`. Caption: *"Then it re-runs the FULL eval — including the safety callers: chest-pain → 911, gas-smell → evacuate, prompt-injection."*

**0:50–1:05 — THE MONEY SHOT: blocked.**
Run the staged unsafe variant. Show:
```
Gate: ⛔ BLOCK — safety regression on no_phantom_claims: 60% < baseline 100%
(no change written; agent.yaml untouched)
```
Caption: *"A 'better' edit that would weaken a safety behavior? Blocked. Autonomous ≠ reckless."*

**1:05–1:18 — the safe one ships.**
Run the good variant: `Gate: ✅ PASS … Applied (gated). backup: agent.yaml.bak.…` Caption: *"A safe improvement passes, applies itself, and keeps a backup. Fully autonomous, provably safe."*

**1:18–1:30 — end card (still).**
> **offhook** — the open, safety-first voice agent.
> It tests itself. It improves itself. It can't break its own safety.
> `github.com/sekhar197/offhook` · built by Sekhar Makkapati · sekharmakkapati.com

---

## How to stage the two gate outcomes (deterministic, repeatable)

The gate's verdict comes from the eval, which is LLM-driven — so for a clean,
repeatable recording, stage it rather than gamble live:

1. **Seed call records** with a couple of real (or realistic) failing calls in
   `call-records.jsonl`.
2. **The BLOCK take:** craft a candidate `instructions` edit that trades a
   safety behavior for "helpfulness" (e.g. softening the 911 / no-medical-advice
   rule). Run the gate; it regresses a safety dimension and blocks. (The unit
   test `pipeline.test.ts → "BLOCKS a patch that regresses a safety dimension"`
   proves this deterministically — you can show that passing test on screen as
   proof, too.)
3. **The PASS take:** a genuinely additive edit (e.g. "if unsure of a price, say
   you'll check") that fixes the failure without touching safety. Gate passes.

Record both, cut them together. If a live run is too slow/noisy on camera,
scope it with `OFFHOOK_EVAL_ONLY` or a small persona subset, or screen-record
the deterministic test as the "proof" intercut.

## Where it goes

- The **README** top (asciinema embed or GIF).
- The **Show HN** post (first comment) and the **LinkedIn launch post**.
- The **launch essay** as the opening visual.
