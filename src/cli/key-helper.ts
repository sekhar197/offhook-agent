/**
 * Browser-assisted key entry — the "feels automatic" part of `offhook-agent init`.
 *
 * We CAN'T log into a developer's provider account and scrape their key (no API,
 * security/ToS). What we can do: open the exact key page for them, then read the
 * key straight off their clipboard after they copy it — so they hit Enter
 * instead of pasting. LiveKit/Twilio have CLIs that genuinely auto-fetch creds;
 * those are handled separately when the CLI is present.
 */
import { spawn, execFileSync } from 'node:child_process';

/** Open a URL in the default browser, non-blocking, best-effort. */
export function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch { /* a headless box has no browser — the URL is printed anyway */ }
}

/** Read the clipboard, best-effort. Returns trimmed text or null. */
export function readClipboard(): string | null {
  try {
    if (process.platform === 'darwin') return execFileSync('pbpaste', { encoding: 'utf8' }).trim() || null;
    if (process.platform === 'win32') return execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard'], { encoding: 'utf8' }).trim() || null;
    // linux: try xclip then xsel
    for (const [bin, args] of [['xclip', ['-selection', 'clipboard', '-o']], ['xsel', ['--clipboard', '--output']]] as const) {
      try { return execFileSync(bin, args, { encoding: 'utf8' }).trim() || null; } catch { /* try next */ }
    }
    return null;
  } catch {
    return null;
  }
}

/** Does an external CLI exist on PATH? (for LiveKit `lk` / Twilio auto-fetch) */
export function hasCli(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A clipboard value that plausibly looks like an API key (not a sentence). */
export function looksLikeKey(s: string | null): s is string {
  if (!s) return false;
  return s.length >= 16 && s.length <= 200 && !/\s/.test(s);
}
