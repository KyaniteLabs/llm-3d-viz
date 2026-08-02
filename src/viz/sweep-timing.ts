export const SWEEP_DURATION_MS = 400;

/** Progress is derived from elapsed wall-clock time, never from frame count. */
export function timingProgress(start: number, now: number, duration = SWEEP_DURATION_MS): number {
  if (duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / duration));
}

/**
 * Run a wall-clock-driven animation loop. The caller owns the returned cancel
 * function; progress is sampled from performance.now(), never inferred from
 * the number of frames delivered by the browser.
 */
export function scheduleSweep(onProgress: (progress: number) => void, duration = SWEEP_DURATION_MS): () => void {
  const started = performance.now();
  let frame: number | null = null;
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const progress = timingProgress(started, now, duration);
    onProgress(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}
