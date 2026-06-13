/**
 * Build a LiveKit AgentSession from agent.yaml.
 *
 * Cascaded mode (default): STT + LLM + TTS + VAD as separate providers, with
 * endpointing clamped to the hard 1500-3000ms bound and barge-in enabled.
 * Realtime mode: a single S2S model in the `llm` slot (no STT/TTS); tools
 * still route through the registry.
 */

import { voice, type llm as llmNs } from '@livekit/agents';
import type { AgentConfig } from '../config/agent-config.js';
import { llmConfigInput } from '../config/agent-config.js';
import { resolveLlm } from '../llm/provider.js';
import {
  resolveStt,
  resolveTts,
  createStt,
  createTts,
  createVad,
  createVoiceLlm,
  createRealtimeModel,
} from './providers/index.js';
import { ENDPOINTING_BOUNDS } from './endpointing-tuner.js';
import type { VoiceToolUserData } from './tools-adapter.js';

function clampEndpointing(ms: number): number {
  return Math.min(ENDPOINTING_BOUNDS.maxMs, Math.max(ENDPOINTING_BOUNDS.minMs, ms));
}

/** Map the config's turn-detection choice to a LiveKit turn-detection mode.
 *  `semantic` (Smart Turn v3) is wired in B6; until then it falls back to the
 *  STT-endpoint path so configs that request it still run. */
function turnDetectionMode(choice: AgentConfig['voice']['turnDetection']): 'stt' | 'vad' {
  // 'livekit' (model) and 'semantic' (smart-turn) attach detector plugins in
  // a later wave; v0.1 uses STT endpointing, which is robust on telephony.
  return choice === 'stt-endpoint' ? 'stt' : 'stt';
}

export async function buildSession(
  config: AgentConfig,
  userData: VoiceToolUserData,
  env = process.env,
): Promise<voice.AgentSession<VoiceToolUserData>> {
  const vad = await createVad();

  const turnHandling = {
    endpointing: { maxDelay: clampEndpointing(config.voice.endpointingMaxDelayMs) },
    interruption: { enabled: true },
  };

  if (config.voice.mode === 'realtime') {
    const realtime = (await createRealtimeModel(config.voice.realtime, env)) as llmNs.RealtimeModel;
    return new voice.AgentSession<VoiceToolUserData>({
      vad,
      llm: realtime,
      userData,
      turnDetection: turnDetectionMode(config.voice.turnDetection),
      turnHandling,
      maxToolSteps: 5,
    });
  }

  // Cascaded
  const [stt, tts, llm] = await Promise.all([
    createStt(resolveStt(config.voice.stt), env, vad),
    createTts(resolveTts(config.voice.tts), env),
    createVoiceLlm(resolveLlm(llmConfigInput(config)), env),
  ]);

  return new voice.AgentSession<VoiceToolUserData>({
    vad,
    stt,
    llm,
    tts,
    userData,
    turnDetection: turnDetectionMode(config.voice.turnDetection),
    turnHandling,
    maxToolSteps: 5,
  });
}
