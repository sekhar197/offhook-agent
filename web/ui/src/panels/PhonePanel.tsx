import { PhoneCall, Wifi, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { Card, Badge, SectionTitle, Empty } from '../components/ui';

export function PhonePanel() {
  const { data } = usePolling(() => api.phoneStatus(), 5000);
  const provider = data?.provider ?? null;
  const number = data?.phoneNumber;
  const provisioned = !!number;
  // A number is "connected" once its LiveKit inbound trunk is recorded in state.
  const wired = !!data?.livekitTrunkId;

  return (
    <div>
      <SectionTitle hint="provision & connect from the CLI: offhook-agent phone …">Phone</SectionTitle>
      <Card glow style={{ padding: '26px 26px' }}>
        {!provisioned ? (
          <Empty>
            <PhoneCall size={24} style={{ opacity: 0.4, marginBottom: 10 }} /><br />
            No number provisioned yet.<br />
            <span className="num" style={{ fontSize: 12.5, color: 'var(--color-dim)' }}>offhook-agent phone provision</span>
          </Empty>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: wired ? 'rgba(52,211,153,0.12)' : 'rgba(129,140,248,0.12)', border: `1px solid ${wired ? 'rgba(52,211,153,0.3)' : 'rgba(129,140,248,0.3)'}` }}>
              {wired ? <Wifi size={24} style={{ color: 'var(--color-ok)' }} /> : <CheckCircle2 size={24} style={{ color: 'var(--color-iris)' }} />}
            </span>
            <div>
              <div className="num" style={{ fontSize: 24, fontWeight: 600 }}>{number}</div>
              <div style={{ fontSize: 13, color: 'var(--color-dim)', marginTop: 3, textTransform: 'capitalize' }}>
                {provider}{data?.agentName ? ` · dispatches to ${data.agentName}` : ''}
              </div>
            </div>
            <span style={{ marginLeft: 'auto' }}>
              <Badge tone={wired ? 'ok' : 'iris'} dot={wired}>
                {wired ? 'connected to LiveKit' : 'provisioned'}
              </Badge>
            </span>
          </div>
        )}
      </Card>
      {provisioned && !wired && (
        <p style={{ fontSize: 12, color: 'var(--color-faint)', marginTop: 14, lineHeight: 1.5 }}>
          The number is provisioned. offhook-agent hasn't recorded a LiveKit inbound trunk in its local state — if calls already reach your agent, the trunk is wired directly in LiveKit. Run <span className="num">offhook-agent phone connect</span> to have offhook-agent manage and record it.
        </p>
      )}
      {!provisioned && (
        <p style={{ fontSize: 12, color: 'var(--color-faint)', marginTop: 14, lineHeight: 1.5 }}>
          Provisioning buys a real number and points its SIP origination at LiveKit. Run <span className="num">offhook-agent phone connect</span> to wire it, then <span className="num">offhook-agent start</span> to answer calls.
        </p>
      )}
    </div>
  );
}
