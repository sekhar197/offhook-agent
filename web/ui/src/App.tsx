import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Phone, GitBranch, SlidersHorizontal, KeyRound, ShieldCheck, PhoneCall } from 'lucide-react';
import { useHashRoute } from './lib/hooks';
import { Overview } from './panels/Overview';
import { Calls } from './panels/Calls';
import { CallDetail } from './panels/CallDetail';
import { ImprovePanel } from './panels/ImprovePanel';
import { ScorecardPanel } from './panels/ScorecardPanel';
import { ConfigPanel } from './panels/ConfigPanel';
import { KeysPanel } from './panels/KeysPanel';
import { PhonePanel } from './panels/PhonePanel';
import { cx } from './components/ui';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'improve', label: 'Improve', icon: GitBranch },
  { id: 'scorecard', label: 'Scorecard', icon: ShieldCheck },
  { id: 'config', label: 'Config', icon: SlidersHorizontal },
  { id: 'keys', label: 'Keys', icon: KeyRound },
  { id: 'phone', label: 'Phone', icon: PhoneCall },
] as const;

export function App() {
  const [route, nav] = useHashRoute();
  const section = route[0];

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopNav active={section} onNav={nav} />
      <main style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '28px 24px 64px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={section + (route[1] ?? '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {section === 'overview' && <Overview onNav={nav} />}
            {section === 'calls' && (route[1] ? <CallDetail id={route[1]} onNav={nav} /> : <Calls onNav={nav} />)}
            {section === 'improve' && <ImprovePanel />}
            {section === 'scorecard' && <ScorecardPanel />}
            {section === 'config' && <ConfigPanel />}
            {section === 'keys' && <KeysPanel />}
            {section === 'phone' && <PhonePanel />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function TopNav({ active, onNav }: { active: string; onNav: (to: string) => void }) {
  return (
    <header className="glass" style={{
      position: 'sticky', top: 0, zIndex: 20,
      borderLeft: 'none', borderRight: 'none', borderTop: 'none',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', gap: 22 }}>
        <button onClick={() => onNav('overview')} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>off<span className="grad">hook</span><span style={{ opacity: 0.5, fontWeight: 600 }}>-agent</span></span>
        </button>

        <nav style={{ display: 'flex', gap: 2, marginLeft: 8, overflowX: 'auto' }}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const on = active === id;
            return (
              <button
                key={id}
                onClick={() => onNav(id)}
                className={cx('navlink')}
                style={{
                  position: 'relative', background: 'none', border: 'none',
                  color: on ? 'var(--color-text)' : 'var(--color-faint)',
                  padding: '8px 12px', fontSize: 13.5, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 9,
                  transition: 'color .2s',
                }}
              >
                <Icon size={15} strokeWidth={2} />
                <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                {on && (
                  <motion.span
                    layoutId="navpill"
                    style={{ position: 'absolute', inset: 0, borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-line)', zIndex: -1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--color-ok)', animation: 'pulse-dot 2s infinite' }} />
          <span style={{ fontSize: 12, color: 'var(--color-dim)' }} className="num">127.0.0.1</span>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#fb7185" /><stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#lg)" opacity="0.16" />
      <rect x="2.5" y="2.5" width="27" height="27" rx="8.5" stroke="url(#lg)" strokeWidth="1" opacity="0.5" />
      <path d="M9 19.5c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="11" cy="20.5" r="2.4" fill="#fb7185" />
      <circle cx="21" cy="20.5" r="2.4" fill="#818cf8" />
    </svg>
  );
}
