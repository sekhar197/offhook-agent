import { ArrowLeft, Wrench, AlertTriangle, Quote } from 'lucide-react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { Card, Badge, StatCard, Empty, Reveal } from '../components/ui';
import { ms, dur, clockTime, outcomeTone, outcomeLabel } from '../lib/format';

export function CallDetail({ id, onNav }: { id: string; onNav: (to: string) => void }) {
  const { data: call, error } = usePolling(() => api.call(id), 5000);

  return (
    <div>
      <button onClick={() => onNav('calls')} style={{ background: 'none', border: 'none', color: 'var(--color-dim)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 18 }}>
        <ArrowLeft size={15} /> Back to calls
      </button>

      {error || !call ? (
        <Card style={{ padding: 24 }}><Empty>{error ?? 'Loading…'}</Empty></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Badge tone={outcomeTone[call.outcome]} dot>{outcomeLabel(call.outcome)}</Badge>
            <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{call.callId.slice(0, 14)}</span>
            <span className="num" style={{ fontSize: 12.5, color: 'var(--color-faint)' }}>{clockTime(call.startedAt)}</span>
          </div>

          {call.summary && (
            <Card glow style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <Quote size={18} style={{ color: 'var(--color-iris)', flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--color-text)' }}>{call.summary}</p>
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <StatCard index={0} label="Turns" value={call.turnCount} tone="rose" />
            <StatCard index={1} label="Mean turn" value={ms(call.latency?.meanTurnMs)} tone="iris" sub={`p95 ${ms(call.latency?.p95TurnMs)}`} />
            <StatCard index={2} label="Tools" value={call.toolCallCount} tone="warn" />
            <StatCard index={3} label="Duration" value={dur(call.durationMs)} tone="ok" />
          </div>

          {call.errors?.length > 0 && (
            <Card style={{ padding: '14px 18px', borderColor: 'rgba(255,93,115,0.3)' }}>
              <div className="label" style={{ color: 'var(--color-bad)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={13} /> {call.errors.length} error{call.errors.length === 1 ? '' : 's'}
              </div>
              {call.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12.5, color: 'var(--color-dim)' }}>{e.turnIndex != null ? `turn ${e.turnIndex}: ` : ''}{e.message}</div>
              ))}
            </Card>
          )}

          <div>
            <div className="label" style={{ marginBottom: 12 }}>Transcript</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {call.turns.map((t, i) => (
                <Reveal key={t.index} index={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {t.caller && <Bubble who="caller" text={t.caller} />}
                    {t.agent && <Bubble who="agent" text={t.agent} tools={t.toolsCalled} latencyMs={t.latencyMs} />}
                  </div>
                </Reveal>
              ))}
              {call.turns.length === 0 && <Empty>No transcript captured.</Empty>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ who, text, tools, latencyMs }: { who: 'caller' | 'agent'; text: string; tools?: string[]; latencyMs?: number }) {
  const agent = who === 'agent';
  return (
    <div style={{ display: 'flex', justifyContent: agent ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '76%' }}>
        <div className="label" style={{ marginBottom: 4, textAlign: agent ? 'left' : 'right', color: agent ? 'var(--color-iris)' : 'var(--color-rose)' }}>{agent ? 'agent' : 'caller'}</div>
        <div style={{
          padding: '11px 15px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55,
          background: agent ? 'var(--color-card2)' : 'rgba(251,113,133,0.08)',
          border: `1px solid ${agent ? 'var(--color-line)' : 'rgba(251,113,133,0.22)'}`,
          borderTopLeftRadius: agent ? 4 : 14, borderTopRightRadius: agent ? 14 : 4,
        }}>
          {text}
        </div>
        {(tools?.length || latencyMs != null) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', justifyContent: agent ? 'flex-start' : 'flex-end' }}>
            {tools?.map((t) => <Badge key={t} tone="warn"><Wrench size={11} /> {t}</Badge>)}
            {latencyMs != null && <span className="num" style={{ fontSize: 11, color: 'var(--color-faint)' }}>{ms(latencyMs)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
