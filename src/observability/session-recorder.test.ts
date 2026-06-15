import { describe, expect, it } from 'vitest';
import { CallRecorder, type CallRecord, type CallSink } from './call-record.js';
import { attachSessionRecorder } from './session-recorder.js';

/** Minimal stand-in for a LiveKit AgentSession's event surface. */
class FakeSession {
  private handlers = new Map<string, Array<(ev: unknown) => void>>();
  on(event: string, listener: (ev: unknown) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(listener);
    this.handlers.set(event, list);
    return this;
  }
  emit(event: string, ev: unknown): void {
    for (const h of this.handlers.get(event) ?? []) h(ev);
  }
}

function setup(): { session: FakeSession; captured: CallRecord[]; rec: CallRecorder } {
  const captured: CallRecord[] = [];
  const sink: CallSink = (r) => { captured.push(r); };
  let t = 0;
  const rec = new CallRecorder({ callId: 'v1', correlationId: 'room' }, { now: () => (t += 1), sink });
  const session = new FakeSession();
  attachSessionRecorder(session, rec);
  return { session, captured, rec };
}

describe('attachSessionRecorder', () => {
  it('pairs caller+agent items into turns with tools and latency', async () => {
    const { session, captured } = setup();

    // Greeting: assistant item with no preceding caller.
    session.emit('conversation_item_added', { item: { role: 'assistant', textContent: 'Thanks for calling!' } });
    // Caller speaks.
    session.emit('conversation_item_added', { item: { role: 'user', textContent: 'do you do whitening' } });
    // A tool runs, LLM latency reported, then the agent replies.
    session.emit('function_tools_executed', { functionCalls: [{ name: 'answer_from_knowledge' }] });
    session.emit('metrics_collected', { metrics: { type: 'llm_metrics', ttftMs: 240 } });
    session.emit('conversation_item_added', { item: { role: 'assistant', textContent: 'We do — it is 45 minutes.' } });

    session.emit('close', { reason: 'job_shutdown', error: null });
    await Promise.resolve();

    expect(captured).toHaveLength(1);
    const r = captured[0]!;
    expect(r.turnCount).toBe(2);
    // greeting turn: agent only
    expect(r.turns[0]).toMatchObject({ agent: 'Thanks for calling!' });
    expect(r.turns[0]!.caller).toBeUndefined();
    // paired turn: caller + agent + tools + latency
    expect(r.turns[1]).toMatchObject({
      caller: 'do you do whitening',
      agent: 'We do — it is 45 minutes.',
      toolsCalled: ['answer_from_knowledge'],
      latencyMs: 240,
    });
    expect(r.outcome).toBe('completed');
  });

  it('derives caller_hangup from participant_disconnected', async () => {
    const { session, captured } = setup();
    session.emit('conversation_item_added', { item: { role: 'user', textContent: 'hello?' } });
    session.emit('close', { reason: 'participant_disconnected', error: null });
    await Promise.resolve();
    expect(captured[0]!.outcome).toBe('caller_hangup');
  });

  it('derives transferred when transfer_to_human fired', async () => {
    const { session, captured } = setup();
    session.emit('function_tools_executed', { functionCalls: [{ name: 'transfer_to_human' }] });
    session.emit('conversation_item_added', { item: { role: 'assistant', textContent: 'Connecting you now.' } });
    session.emit('close', { reason: 'job_shutdown', error: null });
    await Promise.resolve();
    expect(captured[0]!.outcome).toBe('transferred');
    expect(captured[0]!.tools.map(t => t.name)).toContain('transfer_to_human');
  });

  it('records errors and reports an error outcome', async () => {
    const { session, captured } = setup();
    session.emit('error', { error: new Error('TTS provider 503') });
    session.emit('close', { reason: 'error', error: new Error('TTS provider 503') });
    await Promise.resolve();
    const r = captured[0]!;
    expect(r.outcome).toBe('error');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toBe('TTS provider 503');
  });

  it('finish() safety net flushes once even if close never fires', async () => {
    const { session, captured, rec } = setup();
    void rec; // recorder is wired via the adapter
    session.emit('conversation_item_added', { item: { role: 'user', textContent: 'hi' } });
    const handle = attachSessionRecorder(session, new CallRecorder({ callId: 'safety' }, { now: () => 1, sink: (r) => captured.push(r) }));
    await handle.finish('unknown');
    // close never fired for this recorder; the explicit finish still flushed.
    expect(captured.some(r => r.callId === 'safety')).toBe(true);
  });
});
