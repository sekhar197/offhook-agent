/**
 * Local batch STT adapter — fully-local speech-to-text, no provider, no
 * lock-in.
 *
 * The LiveKit OpenAI STT plugin only speaks OpenAI's realtime-transcription
 * WebSocket, which local Whisper servers don't implement. But every local
 * Whisper server (whisper.cpp, faster-whisper/speaches, vLLM-whisper) exposes
 * the OpenAI-compatible BATCH endpoint `POST /v1/audio/transcriptions`. This
 * adapter targets that endpoint and is wrapped with LiveKit's `StreamAdapter`
 * + a VAD, which chunks the mic into utterances and calls us per utterance —
 * giving streaming-style behavior over a batch backend.
 *
 * This is the keystone of offhook's data-sovereignty story: with this, the
 * `openai-compatible` STT provider runs 100% on your own machine.
 */

import { stt as sttNs, mergeFrames, asLanguageCode, type VAD } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { resolveProviderKey, type ResolvedStt } from './resolve.js';

/** Encode PCM16 audio frames as a WAV file buffer (mono/however many channels
 *  the frames carry). Local Whisper servers accept multipart WAV uploads. */
function encodeWav(frames: AudioFrame[]): Buffer {
  const sampleRate = frames[0]?.sampleRate ?? 16000;
  const channels = frames[0]?.channels ?? 1;
  let total = 0;
  for (const f of frames) total += f.data.length;
  const pcm = new Int16Array(total);
  let off = 0;
  for (const f of frames) { pcm.set(f.data, off); off += f.data.length; }
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM chunk size
  header.writeUInt16LE(1, 20);           // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
  header.writeUInt16LE(channels * 2, 32);              // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Non-streaming STT that POSTs an utterance to a local OpenAI-compatible
 *  Whisper server. Wrap with `stt.StreamAdapter(this, vad)` for the pipeline. */
export class LocalBatchSTT extends sttNs.STT {
  label = 'offhook.LocalBatchSTT';
  #baseUrl: string;
  #apiKey: string;
  #model: string;
  #language?: string;

  constructor(opts: { baseUrl: string; apiKey: string; model?: string; language?: string }) {
    super({ streaming: false, interimResults: false });
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#apiKey = opts.apiKey;
    this.#model = opts.model ?? 'whisper-1';
    this.#language = opts.language;
  }

  protected async _recognize(
    buffer: AudioFrame | AudioFrame[],
    _abortSignal?: AbortSignal,
  ): Promise<sttNs.SpeechEvent> {
    const merged = mergeFrames(buffer);
    const wav = encodeWav(Array.isArray(merged) ? merged : [merged]);

    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', this.#model);
    form.append('response_format', 'json');
    if (this.#language) form.append('language', this.#language);

    let text = '';
    try {
      const res = await fetch(`${this.#baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: this.#apiKey && this.#apiKey !== 'not-needed'
          ? { Authorization: `Bearer ${this.#apiKey}` }
          : {},
        body: form,
      });
      if (res.ok) {
        const body = (await res.json()) as { text?: string };
        text = (body.text ?? '').trim();
      }
    } catch {
      // Transient failure → empty transcript; the caller simply gets no turn.
    }

    return {
      type: sttNs.SpeechEventType.FINAL_TRANSCRIPT,
      alternatives: [{
        language: asLanguageCode(this.#language ?? 'en'),
        text,
        startTime: 0,
        endTime: 0,
        confidence: 1,
      }],
    };
  }

  // Streaming is provided by StreamAdapter wrapping this batch STT.
  stream(): never {
    throw new Error('LocalBatchSTT is non-streaming; wrap it with stt.StreamAdapter(stt, vad).');
  }
}

/** Build a streaming-capable local STT: LocalBatchSTT + VAD via StreamAdapter. */
export function createLocalBatchStt(r: ResolvedStt, vad: VAD, env = process.env): sttNs.STT {
  const apiKey = resolveProviderKey(r, env);
  const batch = new LocalBatchSTT({
    baseUrl: r.baseUrl!,
    apiKey,
    ...(r.model ? { model: r.model } : {}),
    ...(r.language ? { language: r.language } : {}),
  });
  return new sttNs.StreamAdapter(batch, vad);
}
