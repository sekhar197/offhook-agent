# Telephony — answering a real phone number

offhook answers real phone calls through **LiveKit SIP**. A phone number from a
trunking provider (Twilio, Telnyx, …) points at your LiveKit server's SIP
endpoint; LiveKit bridges the call into a room; the offhook worker joins and
runs the agent. The caller hears your agent; no code on the call path changes
between browser and phone — the brain is identical.

```
Caller dials → Twilio/Telnyx SIP trunk → LiveKit SIP → LiveKit Room
  → offhook worker (STT → LLM → TTS) → back out to the caller
```

## What you need

- A **LiveKit** deployment (Cloud has SIP built in; self-hosted runs the SIP
  service).
- A **phone number** from a SIP trunking provider (Twilio/Telnyx tested).
- The worker running and registered (see [deploy.md](deploy.md)).

## Setup (one time)

1. **Provider number → LiveKit SIP.** In Twilio/Telnyx, create a SIP trunk that
   sends inbound calls to your LiveKit SIP URI. (LiveKit Cloud shows the URI in
   its dashboard; self-hosted, it's your SIP service address.)
2. **LiveKit inbound trunk + dispatch rule.** Create an inbound trunk for the
   number and a dispatch rule that routes calls to a room the worker will pick
   up. The LiveKit SIP docs cover the exact `lk sip` commands; offhook does not
   reinvent this — it uses LiveKit's standard SIP setup.
3. **Caller ID.** offhook reads the caller's number from the SIP participant
   (`sip.phoneNumber` attribute, with an identity-pattern fallback) and offers
   it back as the callback number when taking a message — so the caller doesn't
   have to recite digits.

## The real-call test checklist

With the worker running and a number wired, **dial it from a cell phone** and
confirm, end to end:

- [ ] The agent answers and **discloses it's an automated assistant** (on by
      default; see `aiDisclosure` in the config).
- [ ] A knowledge question is answered from your `knowledge/` (it searches
      before saying it doesn't have something).
- [ ] "Take a message" → you give a name + message → it reads the name back,
      confirms, and the message **actually arrives** (SMS/email/webhook per your
      `tools.delivery` — see [deploy.md](deploy.md)).
- [ ] Background noise / a mumbled word doesn't derail it.
- [ ] The call ends cleanly and a **call record** is written (see your
      `observability` sink — `call-records.jsonl` by default).

Run this once per release. The [eval harness](../README.md) proves the *brain*
on every commit; this proves the *audio pipeline* on real telephony.

## Honest limitations (v0.1)

- **Warm transfer to a human is not yet connected.** When the caller asks for a
  person, the agent invokes `transfer_to_human`, which currently **logs the
  reason and the transfer number** rather than bridging the call via SIP REFER.
  Until REFER is wired, configure `transferPhone` and have the agent read the
  number, or route through your provider. Live SIP-REFER transfer is on the
  near roadmap.
- **Narrowband audio.** Phone calls are 8 kHz mono. offhook defaults to
  turn-taking that holds up on that, but validate on a real call — studio-audio
  assumptions don't transfer.

## You are the operator of record

offhook is software; **you** run the phone line. That means call-recording
consent (two-party-consent states), AI-disclosure laws (some jurisdictions
require a bot to identify itself — offhook does by default), and TCPA for any
outbound use are **your responsibility**. This is not legal advice. See
`docs/legal-considerations.md` if present, and disclose by default.
