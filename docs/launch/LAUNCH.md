# offhook-agent — launch package & runbook

Everything needed to launch, in order. The **wedge** every asset leads with:
*an open voice agent that improves itself from real calls and provably can't
regress its own safety.* Not "another voice agent."

---

## The assets (all in-repo, ready)

| Asset | Where | State |
|---|---|---|
| **Positioning README** | [`README.md`](../../README.md) | ✅ leads with "the missing safety gate"; credits prior art; 3-layer evidence; numbers verified |
| **Methodology paper** | [`paper/safety-gated-self-improvement.md`](../../paper/safety-gated-self-improvement.md) | ✅ real scorecard + live-block; related-work updated (Future AGI / OpenAI cookbook / DGM); SESR benchmark referenced |
| **The money-shot demo** | [`demo/safety-gate.ts`](../../demo/safety-gate.ts) → `npm run demo:safety-gate` | ✅ **deterministic (no key) by default** + live with a key — prints the gate blocking an unsafe self-edit |
| **SESR benchmark spec** | [`docs/benchmark/self-edit-safety-regression.md`](../benchmark/self-edit-safety-regression.md) | ✅ spec v0.1 — the "first-to-define" artifact |
| **90-sec storyboard** | [`demo-storyboard.md`](demo-storyboard.md) | ✅ |
| **Show HN / LinkedIn copy** | [`show-hn.md`](show-hn.md) | ✅ leads with the wedge + pre-empts objections |
| **Eval scorecard** | [`docs/scorecard.md`](../scorecard.md) | ✅ 90% overall, real run |

Proven live this cycle: inbound calls, message + AI summary persisted to the
dashboard, **call transfer** (announce + ringback), and the **safety-gate
blocking a regressing self-edit** — plus the agent **honestly refusing to claim a
connection** when transfer failed (the safety brand, on a real call). A 3-agent
audit then confirmed the gate is fully baked and every README/paper number is
backed (test count corrected 369→**386**, mutation 91→**90.63%**, persona count
clarified, "provably won't regress" → mechanism language).

**The claim's evidence, 3 layers (a skeptic runs all three):** (1) deterministic
unit test (`gate.test.ts` — higher-overall-but-safety-regressed is blocked,
mutation-killed); (2) end-to-end integration test (`pipeline.test.ts` — full loop
blocks, `agent.yaml` untouched, even with `--apply`); (3) the demo, live on a
model or deterministic with no key.

---

## Step 1 — Record the demo (the launch's centerpiece)

The viral moment is the gate rejecting an edit that looks like an improvement.

```bash
cd ~/Documents/offhook-agent
npm run demo:safety-gate                       # deterministic money-shot, NO key needed
OPENAI_API_KEY=… npm run demo:safety-gate      # …or the live adversarial run on a real model
```

Screen-record the terminal. It will:
1. Print the proposed "be more helpful" self-edit.
2. Score baseline vs. candidate (live on a model, or the deterministic gate rule).
3. Print **⛔ BLOCKED — safety regression…** with the dimension table — and note
   the candidate scored *higher overall* (the case a naive loop would ship).

~90 seconds, one take. Narrate the storyboard beats ([demo-storyboard.md](demo-storyboard.md)).
**Record the live run** if you want the "on a real model" punch (numbers vary per
run; the block is reliable); the deterministic mode is what anyone — and CI —
reproduces with no key.
Optionally also show a real **phone call** (Ava answering + a transfer) as the B-roll
that proves it's a real agent, not a script.

## Step 2 — Promote the package on npm

```bash
npm dist-tag add offhook-agent@<version> latest    # currently published under `next`
```
So `npm i -g offhook-agent` gets the telephony build.

## Step 3 — Post (the visibility event)

- **Show HN** — title + body + first comment are in [`show-hn.md`](show-hn.md). Post a
  weekday morning US-Eastern; reply to every substantive comment in the first 2 hrs.
- **LinkedIn** — post copy in the same file; repo + paper in the comments.
- Link the **paper** from both — it's the credibility anchor no competitor has.

---

## What's yours, not the code's (non-delegable)

- **Record + post** the demo and the launch threads (above).
- **arXiv**: the preprint is drafted; first cs submission may need an endorsement —
  line one up. Fill any remaining numbers from a fresh `npm run eval` if you re-run.
- **EB-1A attorney**: the still-open, highest-leverage immigration step — the OSS
  premise is researched (weak-standalone), so the move is the attorney + the
  authorship/judging pillars, not more code. See the memory note.

## Explicitly NOT doing (scope held)

Outbound calling, connectors, calendar/interview onboarding, more carriers. All
re-confirmed as the crowded/consumer trap. The wedge is the safety loop. Ship that.
