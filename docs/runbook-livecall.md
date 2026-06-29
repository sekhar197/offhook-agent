# Runbook — verifying a real phone call, end to end

This is the live verification the CI suite can't do for you: stand up a real
number, dial it from a cell phone, and confirm the whole audio path works on your
infrastructure. Run it once per release and record the result in
[real-call-report.md](real-call-report.md).

> Why this exists: the [eval harness](../README.md) proves the *brain* on every
> commit; this proves the *audio pipeline* on real telephony. The two are
> different things — a green test suite does not mean a real call works. See
> [testing-status.md](testing-status.md) for exactly what's unverified until you
> run this.

## Prerequisites (your accounts)

```bash
export OPENAI_API_KEY=sk-...                 # or your LLM provider + Ollama/local
export LIVEKIT_URL=wss://your.livekit.cloud
export LIVEKIT_API_KEY=...
export LIVEKIT_API_SECRET=...
export LIVEKIT_SIP_URI=sip:your.sip.livekit.cloud   # LiveKit Cloud has SIP built in

# pick ONE provider:
export TWILIO_ACCOUNT_SID=AC...   ;  export TWILIO_AUTH_TOKEN=...
# …or…
export TELNYX_API_KEY=KEY...
```

Optional production-quality voice (otherwise single-key OpenAI STT/TTS is used):
`DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`. For delivery to actually land:
`TWILIO_*` (SMS) or `RESEND_API_KEY` (email).

## Step 0 — preflight

```bash
offhook-agent doctor      # config, knowledge, LLM reachability, voice-provider keys,
                    # plugin presence, LiveKit reachability, SIP URI
```

Fix anything it flags before spending money on a number.

## Step 1 — get a number answering

**Twilio:**
```bash
offhook-agent phone provision --area-code 973 --provider twilio   # or: phone use +1...  --provider twilio
offhook-agent phone connect
offhook-agent start        # leave this running; it answers the number
```

**Telnyx** (⚠️ the open validation item — first live exercise of the Telnyx client):
```bash
offhook-agent phone provision --area-code 973 --provider telnyx    # or: phone use +1... --provider telnyx
offhook-agent phone connect
offhook-agent start
```

`offhook-agent phone status` shows what's provisioned; state lives in the gitignored
`.offhook-agent/telephony.json`.

## Step 2 — dial it from a real cell phone, run the checklist

- [ ] It answers and **discloses it's an automated assistant** (default; `aiDisclosure`).
- [ ] A **knowledge question** is answered from your `knowledge/` (it searches before saying it doesn't have something).
- [ ] **"Take a message"** → give a name + message → it reads the name back, confirms, and the message **actually arrives** (SMS/email/webhook per `tools.delivery`).
- [ ] **"Talk to a person"** → SIP REFER transfer fires (or it cleanly reads the number aloud if REFER fails — never dead-air).
- [ ] **Barge-in:** interrupt mid-sentence — it stops and listens.
- [ ] **Narrowband reality:** a mumbled word / background noise doesn't derail it (8 kHz mono is harsher than your laptop mic).
- [ ] The call **ends cleanly** and a **call record** is written (`call-records.jsonl` by default).

## Step 3 — record + tear down

```bash
tail -1 call-records.jsonl | jq      # confirm the record (transcript, tools, latency)
offhook-agent phone release                # release the number + trunks when done
```

Write up the result in [real-call-report.md](real-call-report.md) — including
anything that *didn't* hold, so the next release knows.

## Known places real audio can surprise you (vs. unit tests)

- **VAD/STT on 8 kHz mono** behaves differently than on wideband — endpointing may
  fire early/late. Tune `voice.endpointingMaxDelayMs` (1500–3000ms) on a real line.
- **SIP REFER** support varies by carrier; if it fails the agent reads the number.
- A **missing LiveKit plugin** throws at `offhook-agent start`, not at `doctor` time
  unless preflight catches it — install the STT/TTS plugin you configured.
- **Realtime mode** (`voice.mode: realtime`) bypasses the ASR-correction and
  caller-safety text layer — only flip it on after you've validated cascaded.
