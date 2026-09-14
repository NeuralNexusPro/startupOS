/** Deliberately excludes free-form SDK messages, request bodies and arbitrary metadata. */
export interface PluginLogRecord {
  level: 'debug' | 'info' | 'warn' | 'error';
  stage: string;
  safeCode?: string;
  eventId?: string;
  sessionId?: string;
  flowId?: string;
  diagnosticId?: string;
  error?: unknown;
}
export interface PluginSdkLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  trace(...args: unknown[]): void;
}
export interface PluginLogPort {
  write(record: PluginLogRecord): void;
  /** Host-created SDK adapter; plugins need only a type import from the SDK. */
  sdkLogger?: PluginSdkLogger;
}
export interface PluginLogSink { write(pluginId: string, connectorId: string, record: PluginLogRecord): void }

export function writePluginLog(log: PluginLogPort | undefined, record: PluginLogRecord): void {
  try { log?.write(record); } catch { /* Diagnostics must never affect execution. */ }
}

/** SDK strings may contain whole messages. Keep only Error objects or explicit error codes. */
export function createPluginSdkLogger(log: PluginLogPort | undefined, stage = 'sdk') {
  const write = (level: PluginLogRecord['level'], input: unknown[]) => {
    const args: unknown[] = [];
    let remaining = 32;
    const collect = (value: unknown, depth: number): void => {
      if (remaining-- <= 0) return;
      if (!Array.isArray(value)) { args.push(value); return; }
      // ponytail: three array wrappers and 32 entries cover SDK LoggerProxy; expand only for a proven SDK shape.
      if (depth >= 3) return;
      for (let index = 0; index < value.length && remaining > 0; index += 1) {
        collect(Object.getOwnPropertyDescriptor(value, String(index))?.value, depth + 1);
      }
    };
    for (let index = 0; index < input.length && remaining > 0; index += 1) collect(input[index], 0);
    const error = args.find(value => value instanceof Error) ?? args.filter((value): value is string => typeof value === 'string').slice(0, 8).map(value => value.slice(0, 1024)).join(' ');
    const code = args.flatMap(value => {
      if (!value || typeof value !== 'object') return [];
      const descriptor = Object.getOwnPropertyDescriptor(value, 'code');
      return typeof descriptor?.value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(descriptor.value) ? [descriptor.value] : [];
    })[0];
    writePluginLog(log, { level, stage, ...(error ? { error } : {}), ...(code ? { safeCode: code } : {}) });
  };
  return {
    debug: (...args: unknown[]) => write('debug', args),
    info: (...args: unknown[]) => write('info', args),
    warn: (...args: unknown[]) => write('warn', args),
    error: (...args: unknown[]) => write('error', args),
    trace: (...args: unknown[]) => write('debug', args),
  };
}

function field(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9_.:@/-]{1,160}$/.test(value) ? value : undefined;
}

/** Never serialize arbitrary Error properties (HTTP libraries attach requests and credentials). */
export function sanitizePluginLog(record: PluginLogRecord) {
  const result: Record<string, unknown> = {
    level: ['debug', 'info', 'warn', 'error'].includes(record.level) ? record.level : 'error',
    stage: field(record.stage) ?? 'unknown',
  };
  for (const key of ['safeCode', 'eventId', 'sessionId', 'flowId', 'diagnosticId'] as const) {
    const value = field(record[key]);
    if (value) result[key] = value;
  }
  if (record.error) result['error'] = summarizeError(record.error);
  return result;
}

function summarizeError(error: unknown, depth = 0): Record<string, unknown> {
  if (typeof error === 'string') error = new Error(error);
  if (!error || typeof error !== 'object') return { name: 'UnknownError' };
  const read = (key: string): unknown => Object.getOwnPropertyDescriptor(error, key)?.value;
  const rawMessage = read('message');
  const message = typeof rawMessage === 'string' ? rawMessage.slice(0, 8192) : undefined;
  const rawCode = read('code');
  const code = (typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(rawCode) ? rawCode : undefined) ?? (typeof message === 'string' ? message.match(/^(CHANNEL_[A-Z_]+|PLUGIN_[A-Z_]+)$/)?.[1] : undefined);
  const parsedStatus = typeof message === 'string' ? message.match(/(?:HTTP[ /:]*(?:\d\.\d\s+)?|status(?: code)?[ :=]+|^)([45]\d\d)\b/i)?.[1] : undefined;
  const status = read('status') ?? read('statusCode') ?? (parsedStatus ? Number(parsedStatus) : undefined);
  // Keep recognizable transport/model categories. Arbitrary provider text can echo user content.
  const reason = typeof message === 'string'
    ? message.match(/\b(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EACCES|ENOSPC|EPIPE|timeout|timed out|unauthorized|authentication failed|insufficient (?:balance|quota)|rate limit|fetch failed|socket hang up|Agent not initialized|Agent destroyed)\b/i)?.[0]
    : undefined;
  const stack = read('stack');
  const frames = typeof stack === 'string' ? stack.slice(0, 8192).split('\n').filter(line => /^\s+at /.test(line)).slice(0, 6).map(line => {
    // Stack function names/paths can contain query credentials; retain function label only.
    const fn = line.match(/^\s+at ([A-Za-z0-9_.$<>]+)/)?.[1] ?? '<frame>';
    const location = line.match(/[/\\]([A-Za-z0-9_.-]+):([0-9]+):([0-9]+)\)?$/);
    return location ? `${fn.slice(0, 100)} (${location[1]?.slice(0, 100)}:${location[2]}:${location[3]})` : fn.slice(0, 100);
  }) : undefined;
  const cause = read('cause');
  return { name: error instanceof Error ? 'Error' : 'SdkError', ...(code ? { code } : {}),
    ...(typeof status === 'number' ? { status } : {}), ...(reason ? { reason } : {}),
    ...(frames?.length ? { stack: frames } : {}), ...(cause && depth < 2 ? { cause: summarizeError(cause, depth + 1) } : {}) };
}
