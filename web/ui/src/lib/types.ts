// Mirrors the /api/* response shapes served by src/server/dashboard.ts +
// src/observability/call-store.ts. The new UI is a re-skin over the SAME
// contract — keep these aligned with the server, do not invent fields.

export type CallOutcome =
  | 'completed' | 'transferred' | 'caller_hangup' | 'max_turns' | 'error' | 'unknown';

export interface CallSummary {
  callId: string;
  startedAt: string;
  durationMs?: number;
  outcome: CallOutcome;
  turnCount: number;
  toolCallCount: number;
  meanTurnMs?: number;
}

export interface TurnRecord {
  index: number;
  phase?: string;
  caller?: string;
  agent?: string;
  toolsCalled?: string[];
  latencyMs?: number;
}

export interface ToolCallRecord {
  turnIndex: number;
  name: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface CallErrorRecord {
  turnIndex?: number;
  message: string;
  at: string;
}

export interface CallLatency {
  meanTurnMs: number;
  p95TurnMs: number;
  maxTurnMs: number;
  sampled: number;
}

export interface CallRecord {
  callId: string;
  correlationId?: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outcome: CallOutcome;
  turnCount: number;
  toolCallCount: number;
  turns: TurnRecord[];
  tools: ToolCallRecord[];
  errors: CallErrorRecord[];
  latency?: CallLatency;
  summary?: string;
}

// GET /api/scorecard → { available, scorecard? }
// scorecard is src/evals/metrics.ts Scorecard (written by the improve pipeline).
export interface ScorecardEnvelope {
  available: boolean;
  scorecard?: Scorecard;
}
export interface Scorecard {
  totalCalls: number;
  overallPassRate: number;
  byDimension: Record<string, { pass: number; total: number; rate: number }>;
  byPersona: Array<{ personaId: string; passed: number; total: number; rate: number }>;
  failures: Array<{ personaId: string; dimension: string; note: string }>;
}

// GET /api/config → sanitized projection + editable values
export interface ConfigSummary {
  agent: { id: string; businessName: string; agentName: string | null; tone?: string };
  tools: { enabled: string[]; delivery: string };
  aliasCount: number;
  observability: { sink: string; path?: string };
  voiceMode: string;
  editable: Record<string, unknown>;
}

// GET /api/keys-status
export interface KeyStatus {
  envVar: string;
  set: boolean;
  purpose: string;
  optional: boolean;
}

// GET /api/phone/status → src/telephony/types.ts TelephonyState (or {provider:null}).
// There is NO `connected` boolean — a number is provisioned when phoneNumber is
// set, and wired to LiveKit when livekitTrunkId is recorded.
export interface PhoneStatus {
  provider?: string | null;
  phoneNumber?: string;
  phoneNumberSid?: string;
  trunkSid?: string;
  livekitTrunkId?: string;
  livekitDispatchRuleId?: string;
  agentName?: string;
  updatedAt?: string;
}

// PUT /api/config body
export interface ConfigEdit {
  path: string;
  value: unknown;
}

// SSE events from POST /api/improve — mirrors src/improve/pipeline.ts ImproveResult.
export interface ImprovePatch {
  rationale: string;
  edits: Record<string, unknown>;
  targetDimensions: string[];
}
export interface GateResult {
  apply: boolean;
  blockedReason?: string;
  baseline: Scorecard;
  candidate: Scorecard;
}
export interface ImproveResult {
  patch: ImprovePatch;
  applied: boolean;
  mode: 'gated' | 'unguarded';
  gate?: GateResult;
  candidateScorecard?: Scorecard;
  backupPath?: string;
  reason: string;
}
export interface ImproveEvent {
  stage: string;
  result?: ImproveResult;
}

// ── scorecard view helpers (normalize the server shape for display) ──────────
export interface ScoreDim { dimension: string; score: number; passed: boolean }
export function scoreDims(sc?: Scorecard): ScoreDim[] {
  if (!sc?.byDimension) return [];
  return Object.entries(sc.byDimension).map(([dimension, v]) => ({
    dimension,
    score: v.rate,
    passed: v.rate >= 0.8,
  }));
}
