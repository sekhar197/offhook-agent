/**
 * OffhookAgent — LiveKit voice.Agent with offhook's brain layered in.
 *
 * What this overrides vs. the stock agent:
 * - `ttsNode`: applies the naturalize + pronunciation text transforms before
 *   synthesis (the human-feel layer), then delegates to the default TTS node.
 * - instructions: the phase-aware micro-prompt (the persona + knowledge +
 *   directives), passed at construction and refreshed per user turn by the
 *   entry hook.
 * - tools: the offhook ToolRegistry, adapted so every call runs through
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
