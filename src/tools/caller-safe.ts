/**
 * Caller-safe output guard.
 *
 * Every tool `message` field is read aloud (or paraphrased) to a caller.
 * Two production rules, enforced here as code instead of convention:
 *
 * 1. Max 120 chars — longer messages become >6s TTS monologues.
 * 2. No technical language — these substrings have no business reaching
 *    a caller's ear, ever.
 */

export const MAX_MESSAGE_CHARS = 120;

export const BANNED_SUBSTRINGS = [
  // Infrastructure / implementation leaks — no business reaching a caller's ear.
  'tool', 'system', 'API', 'database', 'Redis', 'technical', 'UUID',
  'search results', 'ordering system', 'function', 'endpoint', 'webhook',
  'payload', 'idempotency',
  // Identity / out-of-character leaks — what a jailbroken or confused model
  // says when it breaks character. Multi-word where possible so word-boundary
  // matching can't false-positive on legitimate business speech (e.g. "as an
  // air conditioner" does NOT match "as an ai"). Driven by the adversarial
  // corpus in src/security/corpus.ts.
  'language model', 'as an AI', 'my instructions', 'my prompt', 'my programming',
  'OpenAI', 'Anthropic', 'GPT', 'LLM',
] as const;

export interface CallerSafetyIssue {
  kind: 'too_long' | 'banned_substring';
  detail: string;
}

/** Check a caller-facing message. Returns [] when safe. */
export function checkCallerSafe(message: string): CallerSafetyIssue[] {
  const issues: CallerSafetyIssue[] = [];
  if (message.length > MAX_MESSAGE_CHARS) {
    issues.push({ kind: 'too_long', detail: `${message.length} chars (max ${MAX_MESSAGE_CHARS})` });
  }
  const lower = message.toLowerCase();
  for (const banned of BANNED_SUBSTRINGS) {
    // Word-boundary match so "tool" doesn't flag "stool", but "API" flags "API".
    const re = new RegExp(`\\b${banned.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(lower)) {
      issues.push({ kind: 'banned_substring', detail: banned });
    }
  }
  return issues;
}

/** Throw if a message is not caller-safe. Use in tool implementations. */
export function assertCallerSafe(message: string): void {
  const issues = checkCallerSafe(message);
  if (issues.length > 0) {
    throw new Error(
      `Caller-unsafe message: ${issues.map(i => `${i.kind}(${i.detail})`).join(', ')} — "${message.slice(0, 60)}..."`,
    );
  }
}
