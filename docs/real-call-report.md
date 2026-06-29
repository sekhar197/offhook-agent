# Real-call verification report

Fill this in each time you run the [live-call runbook](runbook-livecall.md). Commit
it (redact the actual phone number). An empty report below means the live audio
path has **not** yet been verified in this repo — see [testing-status.md](testing-status.md).

> Status: ⬜ **not yet run** — awaiting a live LiveKit + provider account.

---

## Run template (copy per run)

**Date:** YYYY-MM-DD
**Tester:**
**Provider:** Twilio | Telnyx
**LiveKit deploy:** Cloud | self-hosted (version)
**Models:** LLM ____ · STT ____ · TTS ____ · mode: cascaded | realtime
**Number:** +1•••••••••• (redacted)
**offhook-agent version:** `offhook-agent --version`

| # | Check | Result | Notes (latency, audio quality, anything off) |
|---|---|---|---|
| 0 | `offhook-agent doctor` clean | ⬜ | |
| 1 | Answers + AI disclosure | ⬜ | |
| 2 | Knowledge question answered (searched first) | ⬜ | |
| 3 | Take-a-message → name read back → **delivery landed** | ⬜ | |
| 4 | "Talk to a person" → SIP REFER (or clean number read-back) | ⬜ | |
| 5 | Barge-in interrupts mid-sentence | ⬜ | |
| 6 | Mumble / background noise doesn't derail | ⬜ | |
| 7 | Clean hang-up + call record written | ⬜ | |

**Measured latency** (from the call record / TTFT receipts): ____ ms first-token, ____ ms first-audio.

**Verdict:** ✅ pass | ⚠️ pass-with-issues | ❌ fail
**Follow-ups filed:**

---

## Telnyx live-validation (the open item)

The Telnyx client is implemented to the v2 API but has not been exercised on a
live account. First successful Telnyx run, record here:

**Date:** ___ · **Result:** ⬜ · **Notes:**
