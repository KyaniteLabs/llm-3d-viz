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
}
