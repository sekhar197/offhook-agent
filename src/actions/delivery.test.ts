import { describe, expect, it, vi } from 'vitest';
import { deliverAction, formatActionMessage, resolveChannel, type DeliveryContext } from './delivery.js';

const MSG = { caller_name: 'Maria Lopez', caller_phone: '5551234567', message: 'Running 10 min late for my 3pm.' };

function ctx(over: Partial<DeliveryContext>): DeliveryContext {
  return { callId: 'c1', correlationId: 'room', agentId: 'dental', businessName: 'Bright Smile', ...over };
}

describe('formatActionMessage', () => {
  it('renders a take_message into subject + body with callback', () => {
    const { subject, body } = formatActionMessage('message.take', MSG, 'Bright Smile');
    expect(subject).toBe('New message from Maria Lopez (Bright Smile)');
    expect(body).toContain('callback 5551234567');
    expect(body).toContain('Running 10 min late');
  });
  it('renders a summary', () => {
    const { subject, body } = formatActionMessage('summary.send', { summary: 'Booked a cleaning.' }, 'Bright Smile');
    expect(subject).toContain('Call summary');
    expect(body).toContain('Booked a cleaning.');
  });
});

describe('resolveChannel', () => {
  it('uses explicit delivery channel', () => {
    expect(resolveChannel(ctx({ delivery: { channel: 'sms', to: '+1', from: '+1', accountSidEnv: 'A', authTokenEnv: 'B' } }))).toBe('sms');
  });
  it('falls back to webhook when a URL is set', () => {
    expect(resolveChannel(ctx({ webhookUrl: 'https://x/y' }))).toBe('webhook');
  });
  it('falls back to console with no config', () => {
    expect(resolveChannel(ctx({}))).toBe('console');
  });
});

describe('deliverAction — sms (Twilio)', () => {
  it('POSTs a form-encoded Twilio message with basic auth', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }));
    const result = await deliverAction('message.take', MSG, ctx({
      delivery: { channel: 'sms', to: '+15557654321', from: '+15550001111', accountSidEnv: 'TW_SID', authTokenEnv: 'TW_TOK' },
      env: { TW_SID: 'ACxxx', TW_TOK: 'secret' } as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }));
    expect(result.status).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('ACxxx:secret').toString('base64')}`);
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get('To')).toBe('+15557654321');
    expect(params.get('From')).toBe('+15550001111');
    expect(params.get('Body')).toContain('Maria Lopez');
  });

  it('fails safe (offer transfer) when creds are missing — no fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await deliverAction('message.take', MSG, ctx({
      delivery: { channel: 'sms', to: '+1', from: '+1', accountSidEnv: 'NOPE', authTokenEnv: 'ALSO_NOPE' },
      env: {} as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }));
    expect(result.status).toBe('failed_offer_transfer');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails safe on a non-2xx Twilio response and does NOT retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"code":21211}', { status: 400 }));
    const result = await deliverAction('message.take', MSG, ctx({
      delivery: { channel: 'sms', to: '+1', from: '+1', accountSidEnv: 'S', authTokenEnv: 'T' },
      env: { S: 'ACx', T: 'tok' } as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }));
    expect(result.status).toBe('failed_offer_transfer');
    expect(fetchImpl).toHaveBeenCalledOnce(); // never double-sends a text
  });
});

describe('deliverAction — email (Resend)', () => {
  it('POSTs JSON to Resend with a bearer key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"id":"e1"}', { status: 200 }));
    const result = await deliverAction('summary.send', { summary: 'Booked a cleaning for Tue.' }, ctx({
      delivery: { channel: 'email', to: 'owner@biz.com', from: 'agent@biz.com', apiKeyEnv: 'RESEND' },
      env: { RESEND: 're_123' } as NodeJS.ProcessEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }));
    expect(result.status).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBe('Bearer re_123');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.to).toBe('owner@biz.com');
    expect(sent.text).toContain('Booked a cleaning');
  });
});

describe('deliverAction — webhook + console', () => {
  it('routes webhook channel through the idempotent executor', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await deliverAction('message.take', MSG, ctx({
      webhookUrl: 'https://hooks.example/offhook',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }));
    expect(result.status).toBe('ok');
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Offhook-Idempotency-Key']).toBe('c1_room_1'); // executor's contract
  });

  it('console channel returns ok without any network', async () => {
    const fetchImpl = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await deliverAction('message.take', MSG, ctx({ fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(result.status).toBe('ok');
    expect(fetchImpl).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
