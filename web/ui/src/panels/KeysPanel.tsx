import { KeyRound, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { Card, Badge, SectionTitle, Empty, Reveal } from '../components/ui';

export function KeysPanel() {
  const { data } = usePolling(() => api.keys(), 5000);
  const keys = data ?? [];
  const setCount = keys.filter((k) => k.set).length;

  return (
    <div>
      <SectionTitle hint={`${setCount}/${keys.length} set · values are never shown`}>API keys</SectionTitle>
      <Card style={{ padding: '8px 0' }}>
        {keys.length === 0 ? (
          <Empty><KeyRound size={20} style={{ opacity: 0.4, marginBottom: 8 }} /><br />No keys referenced by this config.</Empty>
        ) : keys.map((k, i) => (
          <Reveal key={k.envVar} index={i}>
            <div style={{ padding: '14px 20px', borderBottom: i < keys.length - 1 ? '1px solid var(--color-line)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: k.set ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${k.set ? 'rgba(52,211,153,0.3)' : 'var(--color-line2)'}` }}>
                {k.set ? <Check size={15} style={{ color: 'var(--color-ok)' }} /> : <X size={15} style={{ color: 'var(--color-faint)' }} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{k.envVar}</div>
                <div style={{ fontSize: 12, color: 'var(--color-faint)' }}>{k.purpose}</div>
              </div>
              {k.optional && <Badge tone="dim">optional</Badge>}
              <Badge tone={k.set ? 'ok' : 'warn'}>{k.set ? 'set' : 'missing'}</Badge>
            </div>
          </Reveal>
        ))}
      </Card>
      <p style={{ fontSize: 12, color: 'var(--color-faint)', marginTop: 14, lineHeight: 1.5 }}>
        Keys live in your environment (<span className="num">.env</span> / shell), never in this dashboard. offhook-agent only reports whether each variable is set.
      </p>
    </div>
  );
}
