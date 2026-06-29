# Standalone clip — "yes, it really hands off to a human" (~25s)

A short, self-contained proof that offhook-agent does a **real SIP transfer** to a live
human. Post it as the reply/second tweet under the launch video, or drop it into
the long walkthrough. It is deliberately NOT in the 90s launch video — transfer
isn't the wedge, and it bloats the front half.

**Why it's convincing:** one continuous shot, no cuts. The viewer sees the
**terminal fire the REFER** and the **second phone ring** at the *same moment* —
obviously unfaked.

---

## Setup (off-camera)
```bash
cd ~/Documents/offhook-agent
# Transfer target must be a SECOND phone you can film ringing — NOT the one you call from.
offhook-agent config set tools.transferPhone "+1XXXXXXXXXX"   # your second phone / a Google Voice line
offhook-agent start                                            # leave running in a visible terminal
```

**In frame, side by side:**
- **Phone A** — the one you *call from* (on speaker).
- **Phone B** — the **transfer target**, screen on, visible. This is the phone that must ring.
- **Terminal** — running `offhook-agent start`, so the REFER log is visible.

---

## The shot (one take, ~25s)

**📞 YOU CALL Phone A. Wait for Ava to greet, then SAY:**
> *"Hi — this is Bob. I'm a friend of Sekhar's and it's a bit urgent. Can you put me through to him?"*

**🤖 AVA SHOULD SAY:**
> *"Sure — connecting you now, one moment."*

**👀 AT THIS MOMENT, on camera, simultaneously:**
- The **terminal** prints the REFER line: `[transfer] REFER → +1XXXXXXXXXX`
- **Phone B starts ringing.** (Put it on speaker so the mic catches the ringback.)

**📞 ANSWER Phone B. Say "hello" on both phones** — they're bridged. Hold for a
beat so the viewer hears both ends connected. Done.

---

## 🎙️ Optional narration (record silent, add after — or just let it play raw)
> "When a caller needs a person, offhook-agent places a real SIP transfer. The agent
> fires the REFER, the human's phone rings, and the call is bridged — a live
> handoff, not a voicemail, not a demo trick."

---

## On-screen caption (for silent autoplay)
`real SIP REFER → a human's phone actually rings`

## Notes
- If the REFER errors, Ava does **not** claim it connected — she degrades to "I
  can't connect you directly right now, but I can take a message." (That honesty
  is itself a good thing to show, but for *this* clip you want the success take.)
- Restore after: `offhook-agent config set tools.transferPhone "<your real value>"` (or
  `git checkout agent.yaml` if you backed it up).
