import { useEffect, useState } from 'react';
import { Save, RotateCcw, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Button, Badge, SectionTitle, Empty } from '../components/ui';
import type { ConfigSummary, ConfigEdit } from '../lib/types';

// human labels for the allowlisted edit paths
const LABELS: Record<string, string> = {
  'agent.agentName': 'Agent name', 'agent.greeting': 'Greeting', 'agent.tone': 'Tone',
  'agent.instructions': 'Instructions', 'agent.aiDisclosure': 'AI disclosure', 'agent.timezone': 'Timezone',
  'business.address': 'Business address', 'business.phone': 'Business phone',
  'tools.enabled': 'Enabled tools', 'tools.transferPhone': 'Transfer phone', 'tools.webhookUrl': 'Webhook URL',
  'voice.endpointingMaxDelayMs': 'Endpointing max delay (ms)', 'voice.allowInterruptions': 'Allow interruptions',
};

export function ConfigPanel() {
  const [cfg, setCfg] = useState<ConfigSummary | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Config is NOT auto-refreshed — it's user-driven and polling would clobber edits.
  useEffect(() => {
    api.config().then((c) => { setCfg(c); setDraft({ ...c.editable }); }).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <Card style={{ padding: 24 }}><Empty>{err}</Empty></Card>;
  if (!cfg) return <Card style={{ padding: 24 }}><Empty>Loading…</Empty></Card>;

  const paths = Object.keys(cfg.editable);
  const changed = paths.filter((p) => JSON.stringify(draft[p]) !== JSON.stringify(cfg.editable[p]));

  async function save() {
    setSaving(true); setStatus(null);
    const edits: ConfigEdit[] = changed.map((p) => ({ path: p, value: draft[p] }));
    try {
      const res = await api.saveConfig(edits);
      if (res.ok) {
        setStatus({ ok: true, msg: `Saved ${edits.length} change${edits.length === 1 ? '' : 's'}.${res.backupPath ? ' Prior config backed up.' : ''}` });
        const fresh = await api.config();
        setCfg(fresh); setDraft({ ...fresh.editable });
      } else {
        setStatus({ ok: false, msg: res.error ?? 'Save rejected.' });
      }
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionTitle hint={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Lock size={12} /> only the safe surface is editable</span>}>
        Agent config
      </SectionTitle>

      <Card style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <Meta k="agent" v={cfg.agent.businessName} />
        <Meta k="voice mode" v={cfg.voiceMode} />
        <Meta k="delivery" v={cfg.tools.delivery} />
        <Meta k="aliases" v={String(cfg.aliasCount)} />
        <Meta k="observability" v={cfg.observability.sink} />
      </Card>

      <Card style={{ padding: '8px 0' }}>
        {paths.length === 0 ? <Empty>No editable fields.</Empty> : paths.map((p, i) => (
          <Field key={p} path={p} value={draft[p]} dirty={changed.includes(p)} last={i === paths.length - 1}
            onChange={(v) => setDraft((d) => ({ ...d, [p]: v }))} />
        ))}
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
        <Button tone="primary" onClick={save} disabled={saving || changed.length === 0}>
          <Save size={15} /> {saving ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
        </Button>
        {changed.length > 0 && (
          <Button tone="ghost" onClick={() => setDraft({ ...cfg.editable })}><RotateCcw size={14} /> Revert</Button>
        )}
        {status && <Badge tone={status.ok ? 'ok' : 'bad'}>{status.msg}</Badge>}
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{v || '—'}</div>
    </div>
  );
}

function Field({ path, value, dirty, last, onChange }: { path: string; value: unknown; dirty: boolean; last: boolean; onChange: (v: unknown) => void }) {
  const label = LABELS[path] ?? path;
  const border = last ? 'none' : '1px solid var(--color-line)';
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-bg)', border: `1px solid ${dirty ? 'var(--color-iris)' : 'var(--color-line2)'}`,
    borderRadius: 10, padding: '9px 12px', color: 'var(--color-text)', fontSize: 13, fontFamily: 'inherit',
  };

  let control;
  if (typeof value === 'boolean') {
    control = (
      <button onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 999, border: '1px solid var(--color-line2)', background: value ? 'var(--color-iris)' : 'var(--color-card2)', position: 'relative', transition: 'background .2s' }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left .2s' }} />
      </button>
    );
  } else if (typeof value === 'number') {
    control = <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ...inputStyle, width: 160 }} className="num" />;
  } else if (Array.isArray(value)) {
    control = <input value={value.join(', ')} onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} style={inputStyle} />;
  } else if (path === 'agent.instructions') {
    control = <textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />;
  } else {
    control = <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  }

  return (
    <div style={{ padding: '14px 20px', borderBottom: border, display: 'grid', gridTemplateColumns: '200px 1fr', gap: 18, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}>
          {label}{dirty && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--color-iris)' }} />}
        </div>
        <div className="num" style={{ fontSize: 10.5, color: 'var(--color-faint)', marginTop: 2 }}>{path}</div>
      </div>
      <div>{control}</div>
    </div>
  );
}
