export function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

export function numberToHex(n: number): string {
  return '0x' + n.toString(16);
}

let networkPrefix = '';

export function setLogPrefix(network: string) {
  networkPrefix = `[${network}]`;
}

export const logger = {
  info: (...args: unknown[]) => console.log(new Date().toISOString(), networkPrefix, ...args),
  warn: (...args: unknown[]) => console.warn(new Date().toISOString(), networkPrefix, 'WARN', ...args),
  error: (...args: unknown[]) => console.error(new Date().toISOString(), networkPrefix, 'ERROR', ...args),
};

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TRANSIENT_NETWORK_CODES = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

// Network-level failures (socket drops, timeouts, DNS blips) are expected with
// a remote RPC provider and must not kill the process — unlike e.g. PGlite
// allocation exhaustion, where exiting and letting systemd restart is the fix.
export function isTransientNetworkError(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
    const code = (e as NodeJS.ErrnoException).code;
    if (code && TRANSIENT_NETWORK_CODES.has(code)) return true;
    if (e instanceof TypeError && e.message === 'fetch failed') return true;
  }
  return false;
}
