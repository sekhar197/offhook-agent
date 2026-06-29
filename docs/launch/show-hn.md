# Launch copy — Show HN, GitHub, LinkedIn

All three lead with the **safety-gated self-improvement** wedge, not the
voice-agent category. The repo is the reference implementation; the paper is the
citable methodology. Pick the title, post the text, link the paper.

---

## Show HN

### Title options (pick one — keep it about the wedge, not "a voice agent")

1. `Show HN: A voice agent that improves itself but can't regress its own safety`
2. `Show HN: Safety-gated self-improvement for voice agents (open source + paper)`
3. `Show HN: offhook-agent – self-improving phone agent, gated so it can't get less safe`

*Recommended: #1. It states the one novel thing and the tension in nine words.*

### Post body

Hi HN — I'm Sekhar. I build voice agents that answer real phone calls, and the
scariest part has never been making them talk. It's what happens when you let
them *improve themselves*.

The obvious loop is easy to build: read the failed calls, have an LLM propose a
prompt edit, ship it if a score goes up. The problem is that the behaviors that
matter most — telling a caller with chest pain to call 911, refusing to read
back someone else's stored info, not breaking character when an attacker says
"ignore your instructions" — fire on a tiny fraction of calls. An edit can
improve the common case, regress one of those rare safety cases, and your
aggregate metric *goes up*. A naive self-improvement loop will happily ship a
less-safe agent and report a win.

offhook-agent is built so that can't happen. Two ideas do the work:

1. **A bounded editable surface.** When the agent improves itself, it can only
   touch two declarative fields — its free-text instructions and pronunciation
   hints. It physically cannot edit the code-level safety prompt, its tools, or
   its model. The worst a self-edit can do is change phrasing.

2. **An adversarial safety gate.** Every proposed self-edit is run against a
   fixed suite of attack/safety callers (prompt-injection, system-prompt
   exfiltration, fishing for other callers' data, a chest-pain caller, a
   gas-leak caller). The accept/reject rule is a pure function with two hard
   conditions: no safety dimension may regress, and overall quality may not drop.
   Safety wins ties — so a candidate with a *higher* overall pass-rate but a
   regressed safety dimension is **blocked**. That exact case is in the test
   suite.

I want to be precise about what's new and what isn't. Self-improving agents,
LLM-as-judge eval, eval-gated prompt optimization (DSPy, TextGrad), and voice
eval platforms (Coval, Hamming, Cekura) all already exist — I credit them in the
README and the paper. What I haven't seen open-sourced is the *combination*: the
agent itself, self-hostable, improving from its own real calls, under a
guarantee that it can't regress its own safety. The methodology is written up as
a preprint in the repo (`paper/`), and because the gate is a pure function, the
core guarantee is an exhaustively-tested fact rather than a marketing claim.

It's a cascaded STT→LLM→TTS pipeline (cascade because end-to-end
speech-to-speech still can't tool-call reliably — Full-Duplex-Bench-v3 measures
~0.60 Pass@1 on tool use). Any OpenAI-compatible LLM, hosted or fully local;
swappable STT/TTS; runs air-gapped if you want. Apache-2.0.

Honest status: the text path, eval harness, and the safety-gated improve loop
are tested and work today (account-free, ~370 tests). The voice + telephony
paths are fully wired but need your own LiveKit/carrier accounts to run live —
there's an exact tested-vs-needs-accounts breakdown in `docs/testing-status.md`,
because I'd rather you find that there than in an issue.

I'd genuinely like this attacked. If you can construct a self-edit that gets
past the gate and makes the agent less safe, that's the most useful bug report I
could get.

Repo: https://github.com/sekhar197/offhook-agent
Paper: https://github.com/sekhar197/offhook-agent/blob/main/paper/safety-gated-self-improvement.md

### First comment (post immediately after — pre-empts the top objections)

A few things I expect people to (fairly) push on:

- **"Isn't this just another LiveKit wrapper?"** It runs on LiveKit for media
  transport the way a web app runs on a web server — LiveKit is the engine, this
  is the agent. The differentiator isn't the transport; it's the eval suite and
  the gate, which are independent of it.
- **"The gate is only as good as the judge."** Correct, and it's in the
  Limitations section. Four of five judge dimensions are LLM-scored; I mitigate
  with skeptical/default-FAIL prompting, and the single most attack-relevant
  check (technical leakage in spoken output) is computed deterministically in
  code so it can't be argued away. The persona suite is a floor, not a proof of
  completeness.
- **"Near-zero adoption, why should I care?"** Fair. It's pre-release. I'm
  posting because I want the methodology and the gate attacked while it's small,
  not after.

---

## GitHub "About" / social preview (one line)

> The open voice agent that improves itself from real calls — and provably can't
> regress its own safety. Reference implementation of safety-gated
> self-improvement (paper included).

---

## LinkedIn post

I open-sourced the part of voice-AI that scares me most: letting an agent
improve itself.

The easy version of that loop will quietly make your agent *less safe* — because
"improve" usually means "raise an average," and the behaviors that matter most
(send a chest-pain caller to 911, don't leak another caller's data, don't break
character for an attacker) happen on a handful of calls. Improve the common
case, regress a rare safety case, and the average still goes up. The loop ships
it and calls it a win.

offhook-agent is built so it can't. The agent can only edit a narrow, declarative
surface — never its safety kernel — and every self-edit must clear an
adversarial safety suite before it ships. A change that raises overall quality
but regresses any safety dimension gets blocked. Because the decision rule is a
pure function, that guarantee is tested, not asserted.

I wrote up the methodology as a preprint and shipped the reference
implementation alongside it (Apache-2.0). I'd love for people who think about AI
safety and production reliability to try to break the gate.

Repo + paper in the comments. 👇

---

## Notes for posting (not part of the copy)

- Post Show HN on a weekday morning US-Eastern; reply to every substantive
  comment within the first 2 hours — engagement in the first hour is what
  decides the thread.
- **Before posting, fill the paper's §5.3 with a real `npm run eval` run** so
  "the methodology is in the repo" survives someone actually opening it.
- Promote `offhook-agent@latest` on npm at the same moment (currently published under
  the `next` tag).
- Have the 90s demo ready (`docs/launch/demo-storyboard.md`): the viral moment
  is the gate *visibly blocking* a safety-regressing self-edit.
