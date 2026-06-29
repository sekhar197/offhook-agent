import { type ReactNode, type CSSProperties, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

type Div = { className?: string; style?: CSSProperties; children?: ReactNode };

export function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

/** Base surface. `glow` adds the animated conic ring; `spot` adds hover light. */
export function Card({
  className, style, children, glow, spot, ...rest
}: Div & { glow?: boolean; spot?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('card', glow && 'glow-border', spot && 'spot', className)}
      style={style}
      {...rest}
    >
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>{children}</div>
    </div>
  );
}

/** 3D pointer-tilt wrapper — cursor drives rotateX/rotateY with spring. */
export function TiltCard({ className, style, children, max = 6 }: Div & { max?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  const tX = useTransform(ry, (v) => v);
  const tY = useTransform(rx, (v) => v);

  function onMove(e: React.PointerEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    rx.set((0.5 - py) * max * 2);
    ry.set((px - 0.5) * max * 2);
    ref.current.style.setProperty('--mx', `${px * 100}%`);
  }
  function onLeave() { rx.set(0); ry.set(0); }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: tY, rotateY: tX, transformPerspective: 1000, ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const tones = {
  ok: { bg: 'rgba(52,211,153,0.12)', fg: 'var(--color-ok)', bd: 'rgba(52,211,153,0.3)' },
  bad: { bg: 'rgba(255,93,115,0.12)', fg: 'var(--color-bad)', bd: 'rgba(255,93,115,0.3)' },
  iris: { bg: 'rgba(129,140,248,0.12)', fg: 'var(--color-iris)', bd: 'rgba(129,140,248,0.3)' },
  rose: { bg: 'rgba(251,113,133,0.12)', fg: 'var(--color-rose)', bd: 'rgba(251,113,133,0.3)' },
  warn: { bg: 'rgba(230,195,79,0.12)', fg: 'var(--color-warn)', bd: 'rgba(230,195,79,0.3)' },
  dim: { bg: 'rgba(255,255,255,0.05)', fg: 'var(--color-dim)', bd: 'var(--color-line2)' },
} as const;

export function Badge({ children, tone = 'dim', dot }: { children: ReactNode; tone?: keyof typeof tones; dot?: boolean }) {
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px',
      borderRadius: 999, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em',
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: t.fg, animation: tone === 'ok' ? 'pulse-dot 2s infinite' : undefined }} />}
      {children}
    </span>
  );
}

export function Button({
  children, onClick, tone = 'default', disabled, type = 'button',
}: { children: ReactNode; onClick?: () => void; tone?: 'default' | 'primary' | 'ghost'; disabled?: boolean; type?: 'button' | 'submit' }) {
  const styles: Record<string, CSSProperties> = {
    default: { background: 'var(--color-card2)', border: '1px solid var(--color-line2)', color: 'var(--color-text)' },
    primary: { background: 'linear-gradient(92deg, var(--color-rose), var(--color-iris))', border: '1px solid transparent', color: '#0a0a0f', fontWeight: 600 },
    ghost: { background: 'transparent', border: '1px solid transparent', color: 'var(--color-dim)' },
  };
  return (
    <motion.button
      type={type}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[tone], padding: '9px 16px', borderRadius: 11, fontSize: 13.5,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity .2s',
      }}
    >
      {children}
    </motion.button>
  );
}

export function StatCard({
  label, value, sub, tone = 'iris', icon, index = 0,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof tones; icon?: ReactNode; index?: number }) {
  const t = tones[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card spot style={{ padding: '18px 20px', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="label">{label}</div>
          {icon && (
            <div style={{ color: t.fg, display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: t.bg, border: `1px solid ${t.bd}` }}>
              {icon}
            </div>
          )}
        </div>
        <div className="num" style={{ fontSize: 30, fontWeight: 600, marginTop: 12, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-dim)' }}>{sub}</div>}
      </Card>
    </motion.div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{children}</h2>
      {hint && <span style={{ fontSize: 12.5, color: 'var(--color-faint)' }}>{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-faint)', fontSize: 13.5 }}>
      {children}
    </div>
  );
}

/** Staggered reveal container for lists. */
export function Reveal({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
