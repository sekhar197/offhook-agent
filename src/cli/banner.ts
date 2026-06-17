/**
 * Branded CLI banner — the welcome shown on `offhook` / `offhook help`.
 * ANSI-art wordmark with the ember→saffron gradient. Degrades to plain text
 * when stdout isn't a TTY or NO_COLOR is set.
 */

const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
const fg = (r: number, g: number, b: number, s: string) => useColor ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : s;
const dim = (s: string) => useColor ? `\x1b[2m${s}\x1b[0m` : s;
const em = (s: string) => fg(240, 162, 58, s); // saffron accent

// ANSI Shadow wordmark, assembled per-letter so it's verifiable.
const O = [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '];
const F = ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '██║     ', '╚═╝     '];
const H = ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'];
const K = ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'];
const LETTERS = [O, F, F, H, O, O, K];

// Vertical ember→saffron gradient, one color per row.
const SHADES: Array<[number, number, number]> = [
  [232, 99, 58], [234, 110, 57], [236, 122, 56], [238, 140, 57], [240, 162, 58], [240, 162, 58],
];

function wordmark(): string {
  return [0, 1, 2, 3, 4, 5]
    .map((row) => '  ' + fg(...SHADES[row], LETTERS.map((l) => l[row]).join('')))
    .join('\n');
}

export function banner(): string {
  return `
${wordmark()}

  ${em('the open, safety-first voice agent')}
  ${dim('it tests itself · it improves itself · it won\'t break its own safety')}

  ${dim('Commands')}
    ${em('init')}       set up an agent in this folder
    ${em('chat')}       talk to your agent in the terminal (no voice keys)
    ${em('verify')}     run the adversarial safety check  (npm run verify:safety)
    ${em('eval')}       the full simulated-caller scorecard  (npm run eval)
    ${em('improve')}    learn from real calls — applied only if it passes the safety gate
    ${em('dashboard')}  local web UI: call logs, transcripts, scorecard, improve
    ${em('start')}      answer real phone calls (needs LiveKit + provider keys)
    ${em('doctor')}     verify config, knowledge, and keys

  ${dim('v0.1 · Apache-2.0 ·')} ${em('github.com/sekhar197/offhook')}
`;
}

export function printBanner(): void {
  console.log(banner());
}
