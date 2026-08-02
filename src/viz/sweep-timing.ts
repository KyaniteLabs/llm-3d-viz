export const SWEEP_DURATION_MS = 400;

/** Progress is derived from elapsed wall-clock time, never from frame count. */
export function timingProgress(start: number, now: number, duration = SWEEP_DURATION_MS): number {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / duration));
}
