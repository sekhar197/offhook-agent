/**
 * Async provider factories — lazy-import the LiveKit plugin and construct the
 * STT/TTS/VAD/realtime instance from a resolved descriptor.
 *
 * Plugins are imported on demand so a deployment installs only what it uses
 * (`npm i @livekit/agents-plugin-deepgram` etc). A missing plugin produces an
 * actionable install hint rather than an opaque module-not-found.
 */

import type { stt as sttNs, tts as ttsNs, VAD } from '@livekit/agents';
import {
  resolveProviderKey,
  VoiceProviderError,
  type ResolvedStt,
  type ResolvedTts,
} from './resolve.js';

async function importPlugin(pkg: string, forWhat: string): Promise<Record<string, unknown>> {
  try {
    return (await import(pkg)) as Record<string, unknown>;
  } catch {
    throw new VoiceProviderError(
      `${forWhat} needs the plugin "${pkg}", which isn't installed. ` +
      `Run:  npm install ${pkg}`,
    );
  }
}

/**
 * Build an STT instance. OpenAI-plugin-backed providers (openai, groq,
 * openai-compatible) construct via the OpenAI plugin with a baseURL swap;
 * others use their dedicated plugin.
 */
export async function createStt(r: ResolvedStt, env = process.env, vad?: VAD): Promise<sttNs.STT> {
  const apiKey = resolveProviderKey(r, env);
  const mod = await importPlugin(r.plugin, `voice.stt provider '${r.provider}'`);

  if (r.viaOpenAiPlugin) {
    const STT = mod.STT as new (opts: Record<string, unknown>) => sttNs.STT;
    return new STT({
      apiKey,
      ...(r.baseUrl ? { baseURL: r.baseUrl } : {}),
      ...(r.model ? { model: r.model } : {}),
      ...(r.language ? { language: r.language } : {}),
      // Realtime-transcription STT models (e.g. gpt-realtime-whisper) need a
      // VAD to commit audio at end-of-speech.
      ...(vad ? { vad } : {}),
    });
  }

  const STT = mod.STT as new (opts: Record<string, unknown>) => sttNs.STT;
  return new STT({
    apiKey,
    ...(r.model ? { model: r.model } : {}),
    ...(r.language ? { language: r.language } : {}),
  });
}

/** Build a TTS instance (same OpenAI-plugin vs dedicated-plugin split). */
export async function createTts(r: ResolvedTts, env = process.env): Promise<ttsNs.TTS> {
  const apiKey = resolveProviderKey(r, env);
  const mod = await importPlugin(r.plugin, `voice.tts provider '${r.provider}'`);
  const TTS = mod.TTS as new (opts: Record<string, unknown>) => ttsNs.TTS;

  return new TTS({
    apiKey,
    ...(r.viaOpenAiPlugin && r.baseUrl ? { baseURL: r.baseUrl } : {}),
    ...(r.model ? { model: r.model } : {}),
    ...(r.voice ? { voice: r.voice } : {}),
  });
}

/** Build the Silero VAD (local; the only VAD today). Loaded by the worker. */
export async function createVad(): Promise<VAD> {
  const mod = await importPlugin('@livekit/agents-plugin-silero', 'voice activity detection');
  const Silero = mod.VAD as { load: () => Promise<VAD> };
  return Silero.load();
}
