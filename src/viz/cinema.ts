import type { AppStore, AppState } from "../state";
import { motionPreference } from "./sweep-timing";
import type { Stage3DSurface } from "./stage-api";

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
    // Prefer el (Stage API); gd is the same root for both Plotly and Three.
    const pointerRoot = this.stage.el ?? this.stage.gd;
    pointerRoot.addEventListener("pointerenter", () => {
      if (!this.store.getState().cinemaMode) return;
      // Accidental enter from cinema layout expansion — ignore until armed.
      if (performance.now() < this.detuneArmedAt) return;
      this.store.update({ cinemaMode: false });
    });
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
}
