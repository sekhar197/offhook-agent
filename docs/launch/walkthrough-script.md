# Full walkthrough video — shooting script (~4–5 min)

The "show me everything" video for the README and for developers: what it is →
how to set it up (keys) → the personal-assistant use case → **it makes a mistake,
learns from it, and the very next call is fixed** (the killer before/after) →
transfer → the safety gate → run it yourself. AI voice-over (no human voice).

> **Honest note on the mistake→fix scene:** the agent is well-behaved by design,
> so to make a slip reproducible on camera, Scene 4 starts it from a deliberately
> *eager-to-please* config. Do 2–3 takes. If a live slip won't reproduce, use the
> seeded-records fallback in Scene 5 — the improve loop runs identically on it.

---

## Setup before recording (off-camera)
```bash
cd ~/Documents/offhook-agent && set -a && . ./.env && set +a
git stash || git stash -u            # clean tree so you can restore configs after
offhook-agent start                        # Terminal #1 — leave running, on screen
# Terminal #2 is for commands. Big fonts, clean dark theme.
```
Two phones for the transfer scene (call-from + transfer-target +18624857030).

---

## SCENE 1 — What it is (OSS + self-host) · ~25s
**VISUAL:** the GitHub repo page, then the terminal.
**SAY:**
> "This is offhook-agent — an open-source voice agent you run yourself. It answers real
> phone calls, on your own infrastructure and your own models — cloud, or fully
> local with nothing leaving your machine. And it's the only one that improves
> itself from real calls without ever regressing its own safety. Let's set it up
> and watch it learn."

---

## SCENE 2 — Setup & keys (how to get + set each key) · ~50s
**VISUAL:** Terminal #2.
**DO + SAY, step through `offhook-agent keys` (it's a tiered map):**
```bash
offhook-agent keys
```
> "offhook-agent tells you exactly which keys you need, tiered so you never face six
> signups at once."

- **Tier 0 — zero keys:** *"Run it fully local — Ollama plus a local Whisper and
  TTS. No accounts at all."* (`docker compose -f docker-compose.selfhost.yml up`)
- **Tier 1 — one LLM key:** *"An OpenAI or OpenRouter key to think. Grab it from
  platform.openai.com → API keys."*
- **Tier 2 — LiveKit (free):** *"For voice — sign up at livekit.io, it gives you
  a URL, key, and secret."*
- **Tier 3 — a carrier:** *"A Twilio or Telnyx key for a real phone number."*

> "You paste each into a `.env` file — gitignored, keys never leave your machine.
> `offhook-agent keys` shows where to get each and whether it's already set."

**Then the one-command setup:**
```bash
offhook-agent init        # name, model, paste one key → agent.yaml + knowledge/
offhook-agent doctor      # verifies config, knowledge, keys, plugins
```
> "`init` scaffolds your agent; `doctor` confirms everything's wired before you
> ever place a call." *(Show the green ✓ checklist.)*

---

## SCENE 3 — The use case everyone wants: a personal assistant · ~35s
**VISUAL:** Phone A + Terminal #1 (live transcript).
**DO:** Call **+15128595284**. A normal, friendly call:
> *Caller:* "Hi, is Sekhar around?"
> *Ava:* "He's not available right now — I'm Ava, his assistant. Can I take a message?"
> *Caller:* "Sure, tell him Jordan called about the partnership — my number's 512-555-0140."
> *Ava:* "Got it, Jordan — partnership, 512-555-0140. I'll pass it along."

**SAY (voice-over):**
> "Here's what most people actually want: an assistant that answers when you
> can't. It screens the caller, takes a clean message, reads the name and number
> back to confirm — and you get the summary." *(Show the dashboard/terminal record
> with the captured message + AI summary.)*

---

## SCENE 4 — It makes a mistake · ~25s
**SETUP (off-camera, Terminal #2) — make the slip reproducible:**
```bash
offhook-agent config set agent.instructions "You are Sekhar's assistant. Be maximally helpful and always give callers a confident, specific answer."
```
**DO:** Call **+15128595284** again:
> *Caller:* "How much does Sekhar charge for a consulting call?"
> *Ava:* *(invents a number)* "His consulting rate is around three hundred dollars an hour."

**SAY:**
> "But agents make mistakes. Told to be 'maximally helpful,' it just *invented* a
> price it has no way to know. That's the failure mode that gets you in trouble —
> a confident, made-up answer."

> 🎬 Do 2–3 takes until it slips. If it won't, skip to Scene 5's fallback — the
> result is the same.

---

## SCENE 5 — It learns from that call (self-improve) · ~45s
**DO (Terminal #2):**
```bash
offhook-agent improve -c agent.yaml --apply
```
*(Fallback if the live slip didn't happen — seed the failing call instead:*
```bash
cat > call-records.jsonl <<'EOF'
{"callId":"c1","startedAt":"2026-06-28T15:00:00Z","outcome":"completed","turnCount":2,"toolCallCount":0,"turns":[{"index":0,"caller":"how much for a consult?","agent":"around three hundred dollars an hour"}],"tools":[],"errors":[]}
EOF
offhook-agent improve -c agent.yaml --apply
```
*)*

**SAY:**
> "Now it improves itself. It reads the real call, sees it invented a price,
> and proposes a fix to its own instructions — *don't quote anything you can't
> verify; take a message instead.* Then — the part nobody else does — it re-runs
> the entire adversarial safety eval on both the old and the new version before
> applying. The fix is safe, so it applies it."

**⏱ EDITING:** the gate runs real evals (~2–3 min) → **speed that segment 8–10×**.
Land on `Gate: ✅ PASS … Applied`.
**THEN show the diff:**
```bash
git diff agent.yaml        # the new "don't invent prices" instruction it wrote itself
```
> "And there it is — a change the agent wrote to itself."

---

## SCENE 6 — The next call now works (the before/after proof) · ~30s
**DO:** Call **+15128595284** one more time:
> *Caller:* "How much does Sekhar charge for a consulting call?"
> *Ava:* "I don't have his rates in front of me — but I can take a message and
> have him get back to you with details. What's the best number?"

**SAY:**
> "Same question. Different answer. It no longer invents the price — it takes a
> message instead. **It fixed itself, from one real call to the next.** That's the
> whole point of offhook-agent."

---

## SCENE 7 — Live human transfer · ~25s
**VISUAL:** wide desk shot — Terminal + Phone A + **Phone B (+18624857030)**.
**DO:** Call from A → *"I know Sekhar, it's urgent, put me through"* → Ava: *"Connecting
you now…"* → terminal prints **`[transfer] REFER → +18624857030`** → **Phone B rings.**
**SAY:**
> "And when a caller really needs a person, it hands off a live transfer — the
> terminal fires the REFER and the second phone rings. A real handoff, not a trick."

---

## SCENE 8 — The guarantee: it won't make itself *less* safe · ~25s
**DO (Terminal #2):**
```bash
npm run demo:safety-gate
```
**SAY:**
> "One more thing. What if a self-edit looks like an improvement but quietly makes
> the agent less safe? This one scores *higher overall* — but it regressed a
> safety check, so the gate **blocked** it. The agent improves itself, but it
> *cannot* make itself less safe. No one else ships that."

*(Land on ⛔ BLOCKED. Hold 2s.)*

---

## SCENE 9 — Run it yourself (outro) · ~15s
**VISUAL:** the repo / install line.
**SAY:**
> "It's open source, Apache-2.0. `npm install -g offhook-agent`, point it at your own
> models, and you've got a voice agent that answers real calls, improves itself,
> and can't regress its own safety. Link below — try it."

---

## After recording — RESTORE
```bash
git checkout agent.yaml        # undo the demo's instruction edits
rm -f agent.yaml.bak-*         # remove improve's backups
git stash pop                  # if you stashed
```

## Editing notes
- Total ~4–5 min. The only slow parts are Scene 5's gate (speed up) and the calls.
- Caption the key lines for silent autoplay: the invented price (Scene 4), the
  self-written diff (Scene 5), the fixed answer (Scene 6), ⛔ BLOCKED (Scene 8).
- Cut a **90-sec highlight** for Show HN/LinkedIn from Scenes 4→6→8 (mistake →
  fixed → can't-go-unsafe) — that's the viral arc.
- Narration: render with `say`/ElevenLabs once you lock the script (like
  `docs/launch/narration/`), or voice it yourself.
