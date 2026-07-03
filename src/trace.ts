/**
 * Structured JSON trace logging. One line per event; ship to any log drain.
 */

export type TraceLevel = 'info' | 'warn' | 'error';

interface TraceContext {
  call_id?: string;
  correlation_id?: string;
  agent_id?: string;
  turn_id?: string;
  provider?: string;
}

export function traceLog(
  level: TraceLevel,
  event: string,
  context: TraceContext = {},
  data: Record<string, unknown> = {},
): void {
  // OFFHOOK_AGENT_TRACE=0 silences info/warn traces (errors always print).
  // The chat REPL sets this so structured JSON never interleaves with the
  // human conversation; workers/servers keep full tracing by default.
  if (process.env.OFFHOOK_AGENT_TRACE === '0' && level !== 'error') return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
    ...data,
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
