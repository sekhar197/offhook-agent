import { motion, useReducedMotion } from 'framer-motion';

/** Decorative live "voice console" waveform — pure CSS/SVG, no audio. */
export function Waveform({ bars = 48, height = 64, color = 'var(--color-iris)' }: { bars?: number; height?: number; color?: string }) {
  const reduce = useReducedMotion();
  const arr = Array.from({ length: bars });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height }}>
      {arr.map((_, i) => {
        const seed = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        const base = 0.18 + Math.abs(seed) * 0.82;
        const dur = 0.9 + Math.abs(Math.cos(i)) * 1.1;
        return (
          <motion.span
            key={i}
            initial={{ scaleY: base }}
            animate={reduce ? { scaleY: base } : { scaleY: [base * 0.4, base, base * 0.5] }}
            transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', delay: (i % 9) * 0.07 }}
            style={{
              width: 3, height: '100%', borderRadius: 3, transformOrigin: 'center',
              background: i % 3 === 0
                ? 'linear-gradient(180deg, var(--color-rose), var(--color-iris))'
                : color,
              opacity: 0.35 + base * 0.6,
            }}
          />
        );
      })}
    </div>
  );
}
