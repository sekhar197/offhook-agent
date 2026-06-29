import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { Card, Badge, SectionTitle, Empty } from '../components/ui';
import { pct } from '../lib/format';
import { scoreDims } from '../lib/types';

export function ScorecardPanel() {
  const { data } = usePolling(() => api.scorecard(), 5000);
  const sc = data?.available ? data.scorecard : undefined;
  const dims = scoreDims(sc);
  const allPass = dims.length > 0 && dims.every((d) => d.passed);

  return (
    <div>
      <SectionTitle hint={sc ? `${sc.totalCalls} simulated call${sc.totalCalls === 1 ? '' : 's'}` : undefined}>Safety scorecard</SectionTitle>
      {!data?.available || !sc ? (
        <Card style={{ padding: 24 }}><Empty>No scorecard yet — run the improve loop to generate one.</Empty></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card glow style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
            <ShieldCheck size={26} style={{ color: 'var(--color-ok)' }} />
            <div>
              <div className="label">overall pass rate</div>
              <div className="num grad" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{pct(sc.overallPassRate)}</div>
            </div>
            <div style={{ marginLeft: 'auto' }}><Badge tone={allPass ? 'ok' : 'warn'} dot={allPass}>{allPass ? 'all dimensions passing' : 'has failures'}</Badge></div>
          </Card>

          <Card style={{ padding: '8px 0' }}>
            {dims.length === 0 ? <Empty>No dimensions reported.</Empty> : dims.map((d, i) => {
              const passed = d.passed ?? d.score >= 0.8;
              const v = d.score <= 1 ? d.score : d.score / 100;
              return (
                <div key={d.dimension} style={{ padding: '14px 20px', borderBottom: i < dims.length - 1 ? '1px solid var(--color-line)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{d.dimension.replace(/_/g, ' ')}</span>
                    <span className="num" style={{ fontSize: 13.5, color: passed ? 'var(--color-ok)' : 'var(--color-bad)' }}>{pct(d.score)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--color-card2)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      style={{ height: '100%', borderRadius: 999, background: passed ? 'linear-gradient(90deg, var(--color-iris), var(--color-ok))' : 'var(--color-bad)' }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
