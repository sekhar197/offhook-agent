/**
 * Generic action executor — the side-effect boundary.
 *
 * Tools with real-world effects (take_message, send_summary, custom actions)
 * go through this executor, which POSTs to the deployment's webhook with the
 * production-proven safety contract:
 *
 * - Idempotency key: `{callId}_{correlationId}_{attemptNumber}` — receivers
 *   MUST dedupe on it. Documented so users can implement their own receiver.
 * - Retry ONLY for connection-level errors (ECONNREFUSED, DNS) where the
 *   server never received the request, so retrying cannot duplicate side
 *   effects. On the first attempt, timeouts and generic network errors are
 *   also retried once (likely transient; idempotency key is the safety net).
 * - After 2 failed attempts → status 'failed_offer_transfer': the caller
 *   should be offered a human instead of a third silent retry.
 */

import { traceLog } from '../trace.js';

export type ActionErrorReason =
  | 'connection_refused'
  | 'dns_error'
  | 'timeout_error'
  | 'network_error'
  | 'http_error';

export interface ActionRequest {
  /** Stable action type, e.g. 'message.take', 'summary.send'. */
  actionType: string;
  payload: Record<string, unknown>;
  webhookUrl: string;
  callId: string;
  correlationId: string;
  agentId?: string;
  /** Request timeout per attempt (ms). */
  timeoutMs?: number;
  /** Injectable fetch (tests / delivery layer). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface ActionResult {
  status: 'ok' | 'failed' | 'failed_offer_transfer';
  httpStatus?: number;
  /** Response body (parsed JSON when possible). */
  response?: unknown;
  attempts: number;
  idempotencyKey: string;
  errorReason?: ActionErrorReason;
}

export function classifyError(err: unknown): ActionErrorReason {
  const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code
    ?? (err as { code?: string })?.code;
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') return 'connection_refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_error';
  if (err instanceof Error && err.name === 'AbortError') return 'timeout_error';
  return 'network_error';
}

// Connection-level errors where the server never received the request,
// so retrying is safe (no risk of duplicate side effects).
// On first attempt, also retry timeout and generic network errors.
export function isRetryable(reason: ActionErrorReason, attempt: number): boolean {
  if (reason === 'connection_refused' || reason === 'dns_error') return true;
  if (attempt === 1 && (reason === 'timeout_error' || reason === 'network_error')) return true;
  return false;
}

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

export async function executeAction(req: ActionRequest): Promise<ActionResult> {
  const timeoutMs = req.timeoutMs ?? 5000;
  const doFetch = req.fetchImpl ?? fetch;
  let lastReason: ActionErrorReason | undefined;
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const idempotencyKey = `${req.callId}_${req.correlationId}_${attempt}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await doFetch(req.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Offhook-Agent-Idempotency-Key': idempotencyKey,
          'X-Offhook-Agent-Action': req.actionType,
        },
        body: JSON.stringify({
          action: req.actionType,
          idempotency_key: idempotencyKey,
          call_id: req.callId,
          agent_id: req.agentId,
          payload: req.payload,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // non-JSON response body is fine
      }

      if (res.ok) {
        traceLog('info', 'action_executed', {
          call_id: req.callId, correlation_id: req.correlationId, agent_id: req.agentId,
        }, { action: req.actionType, attempt, http_status: res.status });
        return { status: 'ok', httpStatus: res.status, response: body, attempts: attempt, idempotencyKey };
      }

      // HTTP errors (4xx/5xx) reached the server — never blind-retry them;
      // the receiver may have acted before failing.
      traceLog('warn', 'action_http_error', {
        call_id: req.callId, correlation_id: req.correlationId, agent_id: req.agentId,
      }, { action: req.actionType, attempt, http_status: res.status });
      return {
        status: attempt >= MAX_ATTEMPTS ? 'failed_offer_transfer' : 'failed',
        httpStatus: res.status,
        response: body,
        attempts: attempt,
        idempotencyKey,
        errorReason: 'http_error',
      };
    } catch (err) {
      lastReason = classifyError(err);
      traceLog('warn', 'action_attempt_failed', {
        call_id: req.callId, correlation_id: req.correlationId, agent_id: req.agentId,
      }, { action: req.actionType, attempt, reason: lastReason });

      if (isRetryable(lastReason, attempt) && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      break;
    }
  }

  return {
    status: 'failed_offer_transfer',
    attempts: attempt,
    idempotencyKey: `${req.callId}_${req.correlationId}_${attempt}`,
    errorReason: lastReason,
  };
}
