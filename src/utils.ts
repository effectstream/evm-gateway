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
