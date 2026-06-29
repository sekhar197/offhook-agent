/**
 * OffhookAgent — LiveKit voice.Agent with offhook-agent's brain layered in.
 *
 * What this overrides vs. the stock agent:
 * - `ttsNode`: applies the naturalize + pronunciation text transforms before
 *   synthesis (the human-feel layer), then delegates to the default TTS node.
 * - instructions: the phase-aware micro-prompt (the persona + knowledge +
 *   directives), passed at construction and refreshed per user turn by the
 *   entry hook.
 * - tools: the offhook-agent ToolRegistry, adapted so every call runs through
 *   caller-safety + the executors.
 *
 * The LLM node itself is LiveKit's native streaming path — so barge-in,
 * interruption, metrics, and realtime mode all work uniformly, while the
 * differentiation lives in the seams above.
 */

import { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import type { PhonemeMap } from './pronunciation.js';
import { makeTtsTextTransform } from './tts-transform.js';

export class OffhookAgent extends voice.Agent {
  private phonemes: PhonemeMap;

  constructor(opts: ConstructorParameters<typeof voice.Agent>[0] & { phonemes?: PhonemeMap }) {
    const { phonemes, ...agentOpts } = opts;
    super(agentOpts);
    this.phonemes = phonemes ?? {};
  }

  /** Apply naturalize + pronunciation to the streamed text, then synthesize. */
  override async ttsNode(
    text: ReadableStream<string>,
    modelSettings: voice.ModelSettings,
  ): Promise<ReadableStream<AudioFrame> | null> {
    // No pronunciation overrides → skip the transform entirely and use the
    // default TTS node (the transform would be a no-op). Keeps the audio path
    // minimal for the common case.
    if (Object.keys(this.phonemes).length === 0) {
      return voice.Agent.default.ttsNode(this, text, modelSettings);
    }
    const transform = makeTtsTextTransform(this.phonemes);
    const transformed = text.pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          const out = transform.transform(chunk);
          if (out) controller.enqueue(out);
        },
        flush(controller) {
          const out = transform.flush();
          if (out) controller.enqueue(out);
        },
      }),
    );
    return voice.Agent.default.ttsNode(this, transformed, modelSettings);
  }
}
