/**
 * Action delivery — make take_message / send_summary actually land.
 *
 * The webhook executor (executor.ts) is the universal, extensible contract,
 * but standing up a receiver just to get a text is friction that blocks real
 * adoption. So offhook ships built-in delivery channels that work with one
 * BYO key and zero extra dependencies (plain HTTP):
 *
 *   console  — log the message (dev default)
 *   webhook  — POST via the idempotent executor (executor.ts)
 *   sms      — Twilio REST API (the owner gets a text)
 *   email    — Resend REST API (the owner gets an email)
 *
 * SMS/email are sent exactly once and never auto-retried: a duplicate text is
 * worse than a clean failure, and the agent offers a human on failure. The
 * webhook path keeps its idempotency-keyed safe retry (that receiver dedupes).
 */
import { executeAction, type ActionResult } from './executor.js';
import { traceLog } from '../trace.js';

export type DeliveryChannel = 'console' | 'webhook' | 'sms' | 'email';

export interface SmsDelivery {
  channel: 'sms';
  to: string;
  from: string;
  accountSidEnv: string;
  authTokenEnv: string;
}
export interface EmailDelivery {
  channel: 'email';
  to: string;
  from: string;
  apiKeyEnv: string;
  subject?: string;
}
export interface SimpleDelivery { channel: 'console' | 'webhook'; }
export type DeliveryConfig = SimpleDelivery | SmsDelivery | EmailDelivery;

export interface DeliveryContext {
  callId: string;
  correlationId: string;
  agentId?: string;
  businessName?: string;
  /** Webhook URL (used by the webhook channel and as the implicit fallback). */
  webhookUrl?: string;
  /** Explicit channel config; when absent, derived from webhookUrl. */
  delivery?: DeliveryConfig;
  /** Injectable for tests. */
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Render an action into a human-readable subject + body for SMS/email. */
export function formatActionMessage(
  actionType: string,
  payload: Record<string, unknown>,
  businessName?: string,
): { subject: string; body: string } {
  const at = businessName ? ` (${businessName})` : '';
  if (actionType === 'message.take') {
    const name = String(payload.caller_name ?? 'A caller');
    const phone = payload.caller_phone ? ` — callback ${String(payload.caller_phone)}` : '';
    const msg = String(payload.message ?? '');
    return {
      subject: `New message from ${name}${at}`,
      body: `New message${at}\nFrom: ${name}${phone}\n\n${msg}`,
    };
  }
  if (actionType === 'summary.send') {
    return {
      subject: `Call summary${at}`,
      body: `Call summary${at}\n\n${String(payload.summary ?? '')}`,
    };
  }
  // Unknown action: deliver a compact JSON-ish line, still caller-never-sees-it.
  return {
    subject: `Action: ${actionType}${at}`,
    body: `${actionType}${at}\n\n${Object.entries(payload).map(([k, v]) => `${k}: ${String(v)}`).join('\n')}`,
  };
}

/** Resolve which channel to use: explicit config, else webhook if a URL is set,
 *  else console. */
export function resolveChannel(ctx: DeliveryContext): DeliveryChannel {
  if (ctx.delivery) return ctx.delivery.channel;
  if (ctx.webhookUrl) return 'webhook';
  return 'console';
}

function ok(): ActionResult {
  return { status: 'ok', attempts: 1, idempotencyKey: '' };
}
function fail(httpStatus?: number): ActionResult {
  return { status: 'failed_offer_transfer', attempts: 1, idempotencyKey: '', errorReason: 'http_error', ...(httpStatus ? { httpStatus } : {}) };
}

async function sendSms(
  cfg: SmsDelivery,
  actionType: string,
  payload: Record<string, unknown>,
  ctx: DeliveryContext,
): Promise<ActionResult> {
  const env = ctx.env ?? process.env;
  const sid = env[cfg.accountSidEnv];
  const token = env[cfg.authTokenEnv];
  if (!sid || !token) {
    traceLog('warn', 'delivery_misconfigured', { call_id: ctx.callId }, { channel: 'sms', missing: !sid ? cfg.accountSidEnv : cfg.authTokenEnv });
    return fail();
  }
  const { body } = formatActionMessage(actionType, payload, ctx.businessName);
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: cfg.to, From: cfg.from, Body: body }).toString(),
      signal: controller.signal,
    });
    if (res.ok) {
      traceLog('info', 'action_delivered', { call_id: ctx.callId, agent_id: ctx.agentId }, { channel: 'sms', action: actionType });
      return ok();
    }
    traceLog('warn', 'delivery_failed', { call_id: ctx.callId }, { channel: 'sms', http_status: res.status });
    return fail(res.status);
  } catch {
    traceLog('warn', 'delivery_failed', { call_id: ctx.callId }, { channel: 'sms', reason: 'network' });
    return fail();
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail(
  cfg: EmailDelivery,
  actionType: string,
  payload: Record<string, unknown>,
  ctx: DeliveryContext,
): Promise<ActionResult> {
  const env = ctx.env ?? process.env;
  const apiKey = env[cfg.apiKeyEnv];
  if (!apiKey) {
    traceLog('warn', 'delivery_misconfigured', { call_id: ctx.callId }, { channel: 'email', missing: cfg.apiKeyEnv });
    return fail();
  }
  const { subject, body } = formatActionMessage(actionType, payload, ctx.businessName);
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 8000);
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: cfg.to, subject: cfg.subject ?? subject, text: body }),
      signal: controller.signal,
    });
    if (res.ok) {
      traceLog('info', 'action_delivered', { call_id: ctx.callId, agent_id: ctx.agentId }, { channel: 'email', action: actionType });
      return ok();
    }
    traceLog('warn', 'delivery_failed', { call_id: ctx.callId }, { channel: 'email', http_status: res.status });
    return fail(res.status);
  } catch {
    traceLog('warn', 'delivery_failed', { call_id: ctx.callId }, { channel: 'email', reason: 'network' });
    return fail();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver one action over the resolved channel. This is the function the voice
 * entry wires as ctx.executeAction, replacing the inline webhook-or-console.
 */
export async function deliverAction(
  actionType: string,
  payload: Record<string, unknown>,
  ctx: DeliveryContext,
): Promise<ActionResult> {
  const channel = resolveChannel(ctx);
  switch (channel) {
    case 'console': {
      const { body } = formatActionMessage(actionType, payload, ctx.businessName);
      // eslint-disable-next-line no-console
      console.log(`[action → console] ${actionType}\n${body}`);
      return ok();
    }
    case 'webhook': {
      if (!ctx.webhookUrl) return fail();
      return executeAction({
        actionType, payload, webhookUrl: ctx.webhookUrl,
        callId: ctx.callId, correlationId: ctx.correlationId,
        ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
        ...(ctx.timeoutMs ? { timeoutMs: ctx.timeoutMs } : {}),
        ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
      });
    }
    case 'sms':
      return sendSms(ctx.delivery as SmsDelivery, actionType, payload, ctx);
    case 'email':
      return sendEmail(ctx.delivery as EmailDelivery, actionType, payload, ctx);
  }
}
