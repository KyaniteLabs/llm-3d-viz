import type { AppStore, AppState } from "../state";
import { motionPreference } from "./sweep-timing";
import type { Stage3DSurface } from "./stage-api";

/**
 * W2 host lock / W6 fill: under `.app-shell.is-cinema`, status-bar (and method-strip) are CSS-hidden.
 * Cinema/export method line must render via stage overlay or capture compositor — not by re-showing chrome.
 * Implemented as stage-hosted .cinema-method-line under is-cinema (status-bar hidden).
 */
export const CINEMA_METHOD_LINE_HOST = "export-overlay" as const;

const ORBIT_SPEED = 0.00012;
/**
 * After entering cinema, the scope bar hides and the stage expands under the
 * cursor — browsers fire pointerenter on that reflow. Ignore detune until this
 * grace elapses so a click on Cinema [C] does not immediately exit.
 */
const DETUNE_ARM_MS = 600;

export class CinemaMode {
  private readonly stage: Stage3DSurface;
  private readonly store: AppStore;
  private frame: number | null = null;
  private started = 0;
  private reduced = motionPreference()?.matches ?? false;
  private removeMotionListener: (() => void) | null = null;
  /** performance.now() after which pointerenter may exit cinema. */
  private detuneArmedAt = 0;
  private wasCinema = false;

  constructor(stage: Stage3DSurface, store: AppStore) {
    this.stage = stage;
    this.store = store;
    const media = motionPreference();
    if (media) {
      const onChange = (event: MediaQueryListEvent) => {
        this.reduced = event.matches;
        if (this.reduced && this.store.getState().cinemaMode) this.store.update({ cinemaMode: false });
        if (this.reduced) this.stop();
      };
      media.addEventListener?.("change", onChange);
      this.removeMotionListener = () => media.removeEventListener?.("change", onChange);
    }
    this.store.subscribe((state) => this.render(state));
    // Exit controls: floating FAB, keyboard C, Atlas "cinema off".
    // Do NOT exit on pointerenter — reflow after enter was firing false exits
    // and cinema hid all chrome so users could not recover without keyboard.
    this.ensureExitFab();
  }

  private ensureExitFab() {
    let fab = document.querySelector<HTMLButtonElement>("[data-cinema-exit]");
    if (!fab) {
      fab = document.createElement("button");
      fab.type = "button";
      fab.className = "cinema-exit-fab";
      fab.setAttribute("data-cinema-exit", "1");
      fab.setAttribute("aria-label", "Exit cinema mode");
      fab.textContent = "Exit cinema [C]";
      fab.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.store.getState().cinemaMode) this.store.update({ cinemaMode: false });
      });
      document.body.appendChild(fab);
    }
  }

  destroy() {
    this.stop();
    this.removeMotionListener?.();
  }

  private render(state: Readonly<AppState>) {
    const active = state.cinemaMode && !this.reduced;
    if (active && !this.wasCinema) {
      this.detuneArmedAt = performance.now() + DETUNE_ARM_MS;
    }
    this.wasCinema = active;
    document.querySelector(".app-shell")?.classList.toggle("is-cinema", active);
    // FAB is mounted on body; mirror class on <html> for :has-free selectors.
    document.documentElement.classList.toggle("is-cinema", active);
    this.syncMethodOverlay(active);
    this.stage.setCinemaAtmosphere?.(active);
    if (active) this.start();
    else this.stop();
  }

  private start() {
    if (this.frame !== null) return;
    this.started = performance.now();
    const tick = (now: number) => {
      if (this.frame === null) return;
      const elapsed = now - this.started;
      this.stage.orbitTo(elapsed * ORBIT_SPEED);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  toggle() {
    if (this.reduced) return;
    this.store.update({ cinemaMode: !this.store.getState().cinemaMode });
  }

  /** Method line on cinema export frame (status-bar is CSS-hidden under is-cinema). */
  private syncMethodOverlay(active: boolean) {
    const host = this.stage.el ?? this.stage.gd;
    let el = host.querySelector<HTMLElement>("[data-cinema-method]");
    if (!active) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "cinema-method-line";
      el.setAttribute("data-cinema-method", "1");
      el.setAttribute("aria-hidden", "true");
      const style = host.style as CSSStyleDeclaration;
      if (!style.position || style.position === "static") style.position = "relative";
      host.appendChild(el);
    }
    const n = (window as unknown as { __viz?: { visibleCount?: number } }).__viz?.visibleCount;
    const asOf = new Date().toISOString().slice(0, 10);
    el.textContent =
      `Model Observatory · speed × cost × intelligence · sources AA · OpenRouter · Arena · as of ${asOf}` +
      (n != null ? ` · N=${n}` : "");
  }
  /**
   * L9 — cinema export artifact: composite the live stage canvas with an ink-field
   * ground, wordmark (top-left), and method line (bottom) at 2× gallery resolution,
   * return a PNG dataURL. WebGL canvas is capturable because the renderer was
   * created with preserveDrawingBuffer:true. Reduced-motion users still get a PNG.
   */
  captureFrame(): string | null {
    const canvas = (this.stage.el ?? this.stage.gd).querySelector("canvas");
    if (!canvas) return null;
    const SCALE = 2;
    const out = document.createElement("canvas");
    out.width = Math.max(1440, canvas.clientWidth) * SCALE;
    out.height = Math.max(900, canvas.clientHeight) * SCALE;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    // Ink-field ground.
    ctx.fillStyle = "#070C0B";
    ctx.fillRect(0, 0, out.width, out.height);
    // Stage capture (preserveDrawingBuffer keeps the buffer readable here).
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    const mono = `${11 * SCALE}px "IBM Plex Mono", ui-monospace, monospace`;
    // Wordmark top-left.
    ctx.fillStyle = "#E8F1E4";
    ctx.font = mono;
    ctx.textBaseline = "top";
    ctx.fillText("MODEL OBSERVATORY", 24 * SCALE, 20 * SCALE);
    // Method line bottom.
    const n = (window as unknown as { __viz?: { visibleCount?: number } }).__viz?.visibleCount;
    const asOf = new Date().toISOString().slice(0, 10);
    const method = `speed × cost × intelligence · sources AA · OpenRouter · Arena · as of ${asOf}${
      n != null ? ` · N=${n}` : ""
    }`;
    ctx.fillStyle = "#89939E";
    ctx.font = mono;
    ctx.textBaseline = "bottom";
    ctx.fillText(method, 24 * SCALE, out.height - 20 * SCALE);
    // Hairline frame.
    ctx.strokeStyle = "rgba(201,212,196,0.18)";
    ctx.lineWidth = SCALE;
    ctx.strokeRect(SCALE, SCALE, out.width - 2 * SCALE, out.height - 2 * SCALE);
    return out.toDataURL("image/png");
  }

  /** Trigger a PNG download of the composited cinema frame. */
  downloadFrame(): void {
    const url = this.captureFrame();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `model-observatory-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
