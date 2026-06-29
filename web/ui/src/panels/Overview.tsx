import { motion } from 'framer-motion';
import { Phone, Timer, Wrench, Activity, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { Card, StatCard, Badge, SectionTitle, Empty, Reveal } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { ms, dur, ago, outcomeTone, outcomeLabel, pct } from '../lib/format';
import { scoreDims, type ScoreDim } from '../lib/types';

export function Overview({ onNav }: { onNav: (to: string) => void }) {
  const calls = usePolling(() => api.calls(50), 5000);
  const score = usePolling(() => api.scorecard(), 5000);

  const list = calls.data ?? [];
  const totalCalls = list.length;
  const meanLatency = list.filter((c) => c.meanTurnMs != null).reduce((a, c, _, arr) => a + (c.meanTurnMs ?? 0) / arr.length, 0);
  const totalTools = list.reduce((a, c) => a + c.toolCallCount, 0);
  const completed = list.filter((c) => c.outcome === 'completed').length;
  const resolveRate = totalCalls ? completed / totalCalls : undefined;
  const overall = score.data?.available ? score.data.scorecard?.overallPassRate : undefined;
  const dims = scoreDims(score.data?.scorecard);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* hero */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <Card glow spot style={{ padding: '30px 32px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 540 }}>
              <Badge tone="ok" dot>live · self-hosted</Badge>
              <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', margin: '16px 0 8px', lineHeight: 1.1 }}>
                Your voice agent, <span className="grad">watching itself</span>.
              </h1>
              <p style={{ color: 'var(--color-dim)', fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
                Every call, transcript, and self-improvement run — gated so a self-edit can never regress the agent's own safety.
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', justifyContent: 'flex-end' }}>
              <Waveform bars={42} height={84} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* stat bento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
        <StatCard index={0} label="Calls logged" value={totalCalls} tone="rose" icon={<Phone size={16} />} sub={totalCalls ? `${completed} completed` : 'no calls yet'} />
        <StatCard index={1} label="Mean turn latency" value={meanLatency ? ms(meanLatency) : '—'} tone="iris" icon={<Timer size={16} />} sub="caller-final → reply" />
        <StatCard index={2} label="Tool calls" value={totalTools} tone="warn" icon={<Wrench size={16} />} sub="across all calls" />
        <StatCard index={3} label="Resolve rate" value={resolveRate != null ? pct(resolveRate) : '—'} tone="ok" icon={<Activity size={16} />} sub={overall != null ? `eval pass ${pct(overall)}` : 'completed / total'} />
      </div>

      {/* recent calls + safety */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <Card style={{ padding: '20px 22px' }}>
          <SectionTitle hint={<button onClick={() => onNav('calls')} style={{ background: 'none', border: 'none', color: 'var(--color-iris)', fontSize: 12.5, display: 'inline-flex', gap: 4, alignItems: 'center' }}>all calls <ArrowUpRight size={13} /></button>}>
            Recent calls
          </SectionTitle>
          {list.length === 0 ? (
            <Empty>No calls yet — run <span className="num" style={{ color: 'var(--color-dim)' }}>offhook-agent start</span> and dial in.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.slice(0, 6).map((c, i) => (
                <Reveal key={c.callId} index={i}>
                  <button
                    onClick={() => onNav(`calls/${c.callId}`)}
                    style={{ width: '100%', textAlign: 'left', background: 'var(--color-card2)', border: '1px solid var(--color-line)', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 14 }}
                  >
                    <Badge tone={outcomeTone[c.outcome]}>{outcomeLabel(c.outcome)}</Badge>
                    <span className="num" style={{ fontSize: 12.5, color: 'var(--color-dim)' }}>{c.callId.slice(0, 8)}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--color-faint)' }} className="num">
                      <span>{c.turnCount} turns</span>
                      <span>{ms(c.meanTurnMs)}</span>
                      <span>{dur(c.durationMs)}</span>
                      <span style={{ width: 56, textAlign: 'right' }}>{ago(c.startedAt)}</span>
                    </span>
                  </button>
                </Reveal>
              ))}
            </div>
          )}
        </Card>

        <SafetyCard available={!!score.data?.available} overall={overall} dims={dims} onNav={onNav} />
      </div>
    </div>
  );
}

function SafetyCard({ available, overall, dims, onNav }: { available: boolean; overall?: number; dims?: ScoreDim[]; onNav: (to: string) => void }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = overall != null ? (overall <= 1 ? overall : overall / 100) : 0;
  return (
    <Card glow style={{ padding: '22px 22px 24px' }}>
      <SectionTitle hint={<ShieldCheck size={15} style={{ color: 'var(--color-ok)' }} />}>Safety gate</SectionTitle>
      {!available ? (
        <Empty>Run <span className="num">offhook-agent improve</span> to generate a scorecard.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-line2)" strokeWidth="9" />
              <motion.circle
                cx="70" cy="70" r={r} fill="none" stroke="url(#scoregrad)" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={c}
                initial={{ strokeDashoffset: c }}
                animate={{ strokeDashoffset: c * (1 - v) }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              />
              <defs>
                <linearGradient id="scoregrad" x1="0" y1="0" x2="140" y2="140">
                  <stop stopColor="#fb7185" /><stop offset="1" stopColor="#34d399" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', flexDirection: 'column' }}>
              <div className="num grad" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{pct(overall)}</div>
              <div className="label" style={{ marginTop: 4 }}>overall</div>
            </div>
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {(dims ?? []).slice(0, 4).map((d) => (
              <div key={d.dimension} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: 'var(--color-dim)' }}>{d.dimension.replace(/_/g, ' ')}</span>
                <span className="num" style={{ color: (d.passed ?? d.score >= 0.8) ? 'var(--color-ok)' : 'var(--color-bad)' }}>{pct(d.score)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onNav('scorecard')} style={{ background: 'none', border: 'none', color: 'var(--color-iris)', fontSize: 12.5, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            full scorecard <ArrowUpRight size={13} />
          </button>
        </div>
      )}
    </Card>
  );
}
