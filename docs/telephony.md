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

## Setup — automated (recommended)

offhook provisions and connects the number for you. Set your credentials —
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `LIVEKIT_URL/API_KEY/API_SECRET`, and
`LIVEKIT_SIP_URI` (your LiveKit SIP endpoint) — then:

```bash
# Buy a NEW number (choose your provider — no lock-in):
offhook phone provision --area-code 973 --provider twilio   # or --provider telnyx
# …OR bring an EXISTING number you already own on that provider:
offhook phone use +19735550142 --provider twilio

offhook phone connect          # creates the LiveKit inbound trunk + dispatch rule
offhook start                  # the worker answers it
offhook phone status           # what's provisioned   ·   offhook phone release  # tear down
```

The same options are in the dashboard's **Phone** panel (`offhook dashboard`):
pick the provider, provision a new number *or* connect an existing one. Twilio
is fully exercised in tests; the Telnyx client is implemented to Telnyx's v2 API
and should be validated on a live account. Provisioned IDs live in a gitignored
`.offhook/telephony.json`.

## Setup — manual

If you'd rather wire it by hand: create a provider SIP trunk pointed at your
LiveKit SIP URI, then a LiveKit inbound trunk + dispatch rule (the `lk sip`
commands) routing to the worker's agent name. offhook reads the caller's number
from the SIP participant (`sip.phoneNumber` attribute, with an identity-pattern
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

## Honest limitations

- **Warm transfer** is wired via SIP REFER: when the caller asks for a person,
  `transfer_to_human` REFERs the caller's SIP leg to `transferPhone`. If the
  REFER fails (carrier quirk, missing leg, non-phone session) it falls back to
  the agent reading the number aloud — never dead air. REFER behaviour varies by
  carrier; validate on a real call.
- **Narrowband audio.** Phone calls are 8 kHz mono. offhook defaults to
  turn-taking that holds up on that, but validate on a real call — studio-audio
  assumptions don't transfer.

## You are the operator of record

offhook is software; **you** run the phone line. That means call-recording
consent (two-party-consent states), AI-disclosure laws (some jurisdictions
require a bot to identify itself — offhook does by default), and TCPA for any
outbound use are **your responsibility**. This is not legal advice. See
`docs/legal-considerations.md` if present, and disclose by default.
