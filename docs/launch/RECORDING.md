# Recording the safety-gate demo

Two deliverables, two methods. Do both — they serve different jobs:

| | What | Method | Where it goes |
|---|---|---|---|
| **A. README clip** | a short, looping GIF of the CLI blocking an unsafe self-edit | **VHS** (scripted, reproducible, no key) | embedded in `README.md` |
| **B. Launch video** | a ~90-sec narrated take, optionally with a real phone call | screen recording (QuickTime/OBS) | Show HN, LinkedIn, an `<video>` in the README |

---

## A. The README GIF (reproducible, no API key) — do this first

The clip in the README is generated from `docs/launch/safety-gate.tape` with
[VHS](https://github.com/charmbracelet/vhs). Because it runs the demo in
**deterministic mode**, it produces the *identical* money-shot every time, with
no API key — so anyone (you, CI, a contributor) can regenerate it from source.

**1. Install VHS** (one-time; it's a Go binary, fine on Apple Silicon/Rosetta):
```bash
brew install vhs        # macOS
# or: see github.com/charmbracelet/vhs#installation
```
`ffmpeg` is already on your machine (VHS uses it).

**2. Generate the GIF:**
```bash
cd ~/Documents/offhook-agent
vhs docs/launch/safety-gate.tape      # writes docs/launch/safety-gate.gif
```
That's it — the tape `cd`s in, forces `OFFHOOK_AGENT_DEMO_DETERMINISTIC=1`, types
`npm run demo:safety-gate`, and holds on the `⛔ BLOCKED` verdict.

**3. Verify:** open `docs/launch/safety-gate.gif`. You should see the dimension
table (overall 90% → 95%, `no_phantom_claims` 100% → 60%) and the red
**⛔ BLOCKED — safety regression** line. The README already embeds it.

**Tweaks** (edit `safety-gate.tape`): `Set FontSize`, `Set Width/Height`,
`Set Theme` (`vhs themes` lists them), `Set TypingSpeed`. Re-run `vhs` to
regenerate.

> ⚠️ **Generate the GIF before you push the README**, or the image link is
> broken. (Until then the README shows a missing-image icon — fine pre-launch.)

---

## B. The 90-second launch video (the narrated take for Show HN / LinkedIn)

This one tells the **whole story** — that offhook-agent is a *complete, self-hostable
voice agent* that improves itself, not just a gate. Three acts: it answers a real
call → it learns from that call and proposes a fix → it refuses any fix that
regresses safety. Use the **live** runs here (real model + your phone).

### Setup (do once)
- **Terminal:** big font (18–22pt), clean dark theme, window ~1280×800, nothing
  else on screen.
- **Recorder:** QuickTime → *New Screen Recording* (macOS, zero install), or
  [OBS](https://obsproject.com) for webcam-in-corner. To film the phone too, mirror
  it (QuickTime *New Movie Recording* → select iPhone) so it's on screen.
- **Key:** `OPENAI_API_KEY` in `~/Documents/offhook-agent/.env` (the demo + `improve`
  auto-load it).

### Act 1 — choose how the agent runs (the self-host proof)
The strongest flex is **fully local** — no cloud, no key, nothing leaves your box
(SaaS players structurally can't do this). Costs you a local stack to be up:
```bash
# fully local: Ollama + local Whisper + local TTS
docker compose -f docker-compose.selfhost.yml up      # then a Tier-0 config
```
Or record on your **already-working cloud stack** (faster): Deepgram + Cartesia +
your Twilio number. Either way:
```bash
offhook-agent start      # keep this terminal ON SCREEN — it logs the call live
```
Now call your number from your phone (on screen too): Ava answers → leave a
message → ask to transfer → it hands off (`[transfer] REFER → …`). Narrate:
*"A real phone call, answered by an agent running entirely on my own machine and
models."*

### Act 2 — it learns from that call and proposes a fix
```bash
# seed a couple of failing calls (or use the real call-records.jsonl from Act 1)
cat > call-records.jsonl <<'EOF'
{"callId":"c1","startedAt":"2026-06-27T15:00:00Z","outcome":"completed","turnCount":2,"toolCallCount":0,"turns":[{"index":0,"caller":"how much is a cleaning?","agent":"it's forty dollars"}],"tools":[],"errors":[]}
{"callId":"c2","startedAt":"2026-06-27T15:10:00Z","outcome":"caller_hangup","turnCount":2,"toolCallCount":0,"turns":[{"index":0,"caller":"do you do crowns?","agent":"yes, about three hundred"}],"tools":[],"errors":[]}
EOF
offhook-agent improve -c agent.yaml      # dry-run: ingest → cluster → propose → gate → verdict
```
Narrate: *"It read those calls, found it invented prices, and proposed a fix to
its own instructions — then re-ran the full safety eval before deciding."*

### Act 3 — it refuses a fix that regresses safety (the wedge)
```bash
npm run demo:safety-gate           # the gate blocking a higher-scoring-but-unsafe edit
```
Land on **⛔ BLOCKED — safety regression**. Say it: *"This edit scored higher
overall — a metric-maximizing loop ships it. The gate refused. Nothing changed.
That's the part nobody else has."*

### Tips
- ~90s total: Act 1 ~35s, Act 2 ~30s, Act 3 ~25s. Trim aggressively.
- Do **2–3 takes** of Act 3 (live numbers vary; the *block* is reliable — if a run
  blocks on `overall` instead of a safety dim, re-run).
- Caption the key line on screen for silent autoplay on LinkedIn/X.
- One-line thesis to open or close on: *"A complete voice agent — on your own infra
  and models — that improves itself, and can't make itself less safe."*

### Export & embed
- Export **MP4, 1080p**.
- **GitHub README `<video>`:** drag the `.mp4` into a GitHub issue/PR comment (don't
  submit) → GitHub gives a `user-images.githubusercontent.com/...mp4` URL → paste:
  ```html
  <video src="https://user-images.githubusercontent.com/…/demo.mp4" controls width="820"></video>
  ```
  (MP4 plays inline on github.com; the GIF above covers non-GitHub renderers.)
- **Show HN / LinkedIn:** upload the MP4 directly; link the repo + paper in the
  first comment (`docs/launch/show-hn.md`).

---

## Pre-publish checklist
- [ ] `vhs docs/launch/safety-gate.tape` run → `safety-gate.gif` exists and looks right
- [ ] README renders the GIF (preview locally / on a branch)
- [ ] Launch MP4 recorded, captioned, exported
- [ ] (optional) MP4 embedded in README via the githubusercontent URL
- [ ] `npm run demo:safety-gate` still prints the block (deterministic + live) — re-verify before posting
