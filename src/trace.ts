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
