# Languages & accents

offhook-agent is **multilingual by config** — there is no separate "language plugin"
to install. You point STT/LLM/TTS at multilingual models and set the language;
the persona, knowledge, and tools all work in that language.

See runnable examples in [`examples/multilingual/`](../examples/multilingual/):
Spanish (`agent.es.yaml`), Hindi (`agent.hi.yaml`), Telugu (`agent.te.yaml`).

## The hooks (one per layer)

| Layer | Hook | Notes |
|---|---|---|
| Persona / brain | `agent.primaryLanguage: es` | The micro-prompt instructs the LLM to answer in that language and match its rhythm. |
| STT (ears) | `voice.stt.language: es` | A hint for the STT model. **Use a multilingual model** (Whisper-large-v3, Deepgram nova-3) — `base.en` is English-only. |
| TTS (voice) | `voice.tts.voice: <id>` | Pick a voice that speaks the language (OpenAI voices are multilingual; Cartesia/ElevenLabs/Piper have native voices). |
| Knowledge | files in any script | The loader is Unicode-aware — Devanagari, Telugu, CJK, etc. produce stable ids. |
| Turn-taking | `voice.endpointingMaxDelayMs` | Pause patterns differ by culture; tune per deployment (the auto-tuner learns this). |
| ASR correction | `registerPhoneticBackend(lang, fn)` | Per-language phonetic matching for misheard entity names (English ships; others are pluggable — see roadmap). |

## Accents vs. languages — be precise

- **Accents are mostly a model choice, not offhook-agent code.** A multilingual,
  accent-robust STT (Whisper-large-v3, Deepgram nova-3) handles regional accents
  well. The one offhook-agent-specific accent feature is the **per-language phonetic
  backend** for correcting misheard *entity names* (the resolver registry).
- **Languages are config + a capable model.** Set the three hooks above and
  choose models that actually know the language. For lower-resource languages
  (e.g. Telugu), prefer Whisper-large-v3 for STT and a larger or Indic-tuned LLM.

## What works today vs. roadmap

**Works now (by config):** any language your chosen STT/LLM/TTS models support —
Spanish, Hindi, Telugu, and dozens more. Knowledge in any script. Per-language
endpointing.

**Roadmap (honest gaps):**
- **Code-switching** — callers mixing languages mid-sentence (common in India).
  A genuine research frontier; not solved here yet.
- **Non-English phonetic backends** — Hindi/Telugu/Spanish soundex for ASR
  correction of entity names (the registry exists; backends are English-only today).
- Multilingual turn-taking nuances.

The honest one-liner: **offhook-agent speaks whatever your models speak. Set the
language, pick multilingual models, and it works — accent robustness comes from
your STT, and code-switching is on the roadmap.**
