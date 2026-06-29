import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ShieldCheck, ShieldX, GitBranch, Loader2, CheckCircle2, Ban } from 'lucide-react';
import { runImprove } from '../lib/api';
import { Card, Button, Badge, SectionTitle, Empty } from '../components/ui';
import { pct } from '../lib/format';
import type { ImproveEvent, ImproveResult } from '../lib/types';

const STAGES = ['ingesting', 'proposing', 'gating-baseline', 'gating-candidate', 'decided'] as const;
const STAGE_LABEL: Record<string, string> = {
  ingesting: 'Reading real calls',
  proposing: 'Proposing a safe edit',
  'gating-baseline': 'Scoring the current agent',
  'gating-candidate': 'Scoring the candidate',
  decided: 'Gate decision',
};

export function ImprovePanel() {
  const [log, setLog] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [result, setResult] = useState<ImproveResult | null>(null);
  const [running, setRunning] = useState(false);
  const handle = useRef<{ abort: () => void } | null>(null);

  function start() {
    setLog([]); setResult(null); setCurrent(STAGES[0]); setRunning(true);
    handle.current = runImprove({ mode: 'gated', apply: false }, (ev: ImproveEvent) => {
      if (ev.stage === 'decided') {
        setCurrent(null); setRunning(false);
        if (ev.result) setResult(ev.result);
      } else {
        setCurrent(ev.stage);
        setLog((l) => [...l, ev.stage]);
      }
    });
  }

  return (
    <div>
      <SectionTitle hint="gated · dry-run · no config is written">Self-improvement loop</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 20, alignItems: 'start' }}>
        {/* left: control + pipeline */}
        <Card glow style={{ padding: '22px 24px' }}>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--color-dim)', lineHeight: 1.6 }}>
            offhook-agent learns from real calls, proposes an edit to its own instructions, then runs an adversarial safety suite against both the current agent and the candidate. <strong style={{ color: 'var(--color-text)' }}>Any edit that regresses a safety check is blocked.</strong>
          </p>
          <Button tone="primary" onClick={start} disabled={running}>
            {running ? <><Loader2 size={15} className="spin" /> Running…</> : <><Play size={15} /> Run improve loop</>}
          </Button>

          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STAGES.map((s) => {
              const done = log.includes(s) && current !== s;
              const active = current === s;
              const reached = done || active || (s === 'decided' && !!result);
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', opacity: reached ? 1 : 0.4 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', background: reached ? 'rgba(129,140,248,0.14)' : 'var(--color-card2)', border: `1px solid ${reached ? 'rgba(129,140,248,0.35)' : 'var(--color-line)'}` }}>
                    {active ? <Loader2 size={12} className="spin" style={{ color: 'var(--color-iris)' }} /> : reached ? <CheckCircle2 size={12} style={{ color: 'var(--color-iris)' }} /> : <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--color-faint)' }} />}
                  </span>
                  <span style={{ fontSize: 13, color: reached ? 'var(--color-text)' : 'var(--color-faint)' }}>{STAGE_LABEL[s]}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* right: verdict */}
        <div>
          <AnimatePresence mode="wait">
            {!result && !running && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card style={{ padding: 40, textAlign: 'center' }}>
                  <GitBranch size={28} style={{ color: 'var(--color-faint)', marginBottom: 12 }} />
                  <Empty>Run the loop to see the gate's verdict.</Empty>
                </Card>
              </motion.div>
            )}
            {running && !result && (
              <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card style={{ padding: 40, textAlign: 'center' }}>
                  <Loader2 size={28} className="spin" style={{ color: 'var(--color-iris)', marginBottom: 12 }} />
                  <div style={{ fontSize: 13.5, color: 'var(--color-dim)' }}>{current ? STAGE_LABEL[current] : 'Working…'}</div>
                </Card>
              </motion.div>
            )}
            {result && <Verdict key="verdict" result={result} />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Verdict({ result }: { result: ImproveResult }) {
  const blocked = !result.applied;
  const accent = blocked ? 'var(--color-bad)' : 'var(--color-ok)';
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
      <Card glow style={{ padding: '26px 26px 24px', borderColor: blocked ? 'rgba(255,93,115,0.35)' : 'rgba(52,211,153,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <motion.span
            initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 16 }}
            style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: blocked ? 'rgba(255,93,115,0.14)' : 'rgba(52,211,153,0.14)', border: `1px solid ${accent}` }}
          >
            {blocked ? <Ban size={24} style={{ color: accent }} /> : <ShieldCheck size={24} style={{ color: accent }} />}
          </motion.span>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: accent }}>
              {blocked ? 'BLOCKED' : 'APPLIED'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-dim)' }}>{blocked ? 'safety gate rejected the self-edit' : 'safe edit accepted'}</div>
          </div>
          <span style={{ marginLeft: 'auto' }}><Badge tone={result.mode === 'gated' ? 'iris' : 'warn'}>{result.mode}</Badge></span>
        </div>

        {result.reason && (
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text)', background: 'var(--color-card2)', border: '1px solid var(--color-line)', borderRadius: 12, padding: '12px 15px', marginBottom: 16 }}>
            {result.reason}
          </div>
        )}

        {result.gate && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <ScoreMini label="current" v={result.gate.baseline?.overallPassRate} />
            <ScoreMini label="candidate" v={result.gate.candidate?.overallPassRate} accent={blocked ? accent : undefined} />
          </div>
        )}

        {result.patch?.rationale && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>proposed edit</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-dim)', lineHeight: 1.55 }}>{result.patch.rationale}</div>
            {result.patch.targetDimensions?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {result.patch.targetDimensions.map((d) => <Badge key={d} tone="dim">{d.replace(/_/g, ' ')}</Badge>)}
              </div>
            )}
          </div>
        )}

        {blocked && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-bad)' }}>
            <ShieldX size={14} /> The agent's config on disk was left untouched.
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function ScoreMini({ label, v, accent }: { label: string; v?: number; accent?: string }) {
  return (
    <div style={{ background: 'var(--color-card2)', border: '1px solid var(--color-line)', borderRadius: 12, padding: '12px 14px' }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 22, fontWeight: 600, color: accent ?? 'var(--color-text)' }}>{v != null ? pct(v) : '—'}</div>
    </div>
  );
}
