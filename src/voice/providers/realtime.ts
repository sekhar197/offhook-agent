/**
 * Realtime (speech-to-speech) model factory — used only when
 * `voice.mode: realtime`. OpenAI gpt-realtime and Google Gemini Live take
 * audio in and emit audio out; tools still route through offhook's registry,
 * but the text-stage moat (ASR correction, caller-safety) is bypassed — which
 * is why cascaded is the default (see docs/roadmap.md).
 */

import { VoiceProviderError } from './resolve.js';

export type RealtimeProviderName = 'openai' | 'google';

export interface RealtimeSpec {
  provider?: RealtimeProviderName;
  model?: string;
  voice?: string;
}

const REALTIME_KEY_ENV: Record<RealtimeProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

/** Construct a realtime model instance (returns the plugin's RealtimeModel). */
export async function createRealtimeModel(spec: RealtimeSpec, env = process.env): Promise<unknown> {
  const provider = spec.provider ?? 'openai';
  const apiKey = env[REALTIME_KEY_ENV[provider]];
  if (!apiKey) {
    throw new VoiceProviderError(
      `voice.realtime provider '${provider}' needs ${REALTIME_KEY_ENV[provider]} set.`,
    );
  }

  if (provider === 'openai') {
    let mod: Record<string, unknown>;
    try {
      mod = (await import('@livekit/agents-plugin-openai')) as Record<string, unknown>;
    } catch {
      throw new VoiceProviderError('realtime mode needs "@livekit/agents-plugin-openai". Run: npm install @livekit/agents-plugin-openai');
    }
    const realtime = mod.realtime as { RealtimeModel: new (o: Record<string, unknown>) => unknown };
    return new realtime.RealtimeModel({
      apiKey,
      ...(spec.model ? { model: spec.model } : {}),
      ...(spec.voice ? { voice: spec.voice } : {}),
    });
  }

  // google Gemini Live — specifier via variable so tsc treats it as an
  // optional runtime dependency, not a static one.
  const googlePkg = '@livekit/agents-plugin-google';
  let mod: Record<string, unknown>;
  try {
    mod = (await import(googlePkg)) as Record<string, unknown>;
  } catch {
    throw new VoiceProviderError(`realtime mode with Google needs "${googlePkg}". Run: npm install ${googlePkg}`);
  }
  const beta = mod.beta as { realtime: { RealtimeModel: new (o: Record<string, unknown>) => unknown } };
  return new beta.realtime.RealtimeModel({
    apiKey,
    ...(spec.model ? { model: spec.model } : {}),
    ...(spec.voice ? { voice: spec.voice } : {}),
  });
}
