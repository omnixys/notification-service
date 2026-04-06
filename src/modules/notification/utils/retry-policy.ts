export function getRetryDelay(attempt: number): number | null {
  if (attempt >= MAX_ATTEMPTS) {
    return null;
  }
  return RETRY_DELAYS_MS[attempt] ?? null;
}

export const RETRY_DELAYS_MS = [
  0,
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
];

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
