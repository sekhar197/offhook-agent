import { Phone } from 'lucide-react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { Card, Badge, SectionTitle, Empty, Reveal } from '../components/ui';
import { ms, dur, ago, clockTime, outcomeTone, outcomeLabel } from '../lib/format';

export function Calls({ onNav }: { onNav: (to: string) => void }) {
  const { data, error } = usePolling(() => api.calls(100), 5000);
  const list = data ?? [];

  return (
    <div>
      <SectionTitle hint={`${list.length} call${list.length === 1 ? '' : 's'} · auto-refresh 5s`}>Call history</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {error ? (
          <Empty>Couldn't load calls — {error}</Empty>
        ) : list.length === 0 ? (
          <Empty><Phone size={20} style={{ opacity: 0.4, marginBottom: 8 }} /><br />No calls recorded yet.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Outcome', 'Call', 'Time', 'Turns', 'Tools', 'Mean', 'Duration', ''].map((h, i) => (
                  <th key={i} className="label" style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-line)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <Reveal key={c.callId} index={i}>
                  <tr
                    onClick={() => onNav(`calls/${c.callId}`)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--color-line)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}><Badge tone={outcomeTone[c.outcome]}>{outcomeLabel(c.outcome)}</Badge></td>
                    <td className="num" style={{ padding: '12px 16px', color: 'var(--color-dim)' }}>{c.callId.slice(0, 10)}</td>
                    <td className="num" style={{ padding: '12px 16px', color: 'var(--color-faint)' }}>{clockTime(c.startedAt)} · {ago(c.startedAt)}</td>
                    <td className="num" style={{ padding: '12px 16px' }}>{c.turnCount}</td>
                    <td className="num" style={{ padding: '12px 16px' }}>{c.toolCallCount}</td>
                    <td className="num" style={{ padding: '12px 16px' }}>{ms(c.meanTurnMs)}</td>
                    <td className="num" style={{ padding: '12px 16px' }}>{dur(c.durationMs)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-faint)', textAlign: 'right' }}>→</td>
                  </tr>
                </Reveal>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
