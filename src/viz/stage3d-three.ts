/**
 * Three.js 3D hero stage (docs/v1/r3f-stage-contract.md).
 * Vanilla TS — no React/R3F.
 *
 * Default product axes: x=cost (log), y=intelligence (linear, data min–max), z=speed (log).
 * Scene is Three Y-up with that assignment. Metrics on X/Y/Z are remappable via
 * AxisMapping so cost definition (and other metrics) need not be permanently chosen.
 * Visual target: Plotly-parity cube + grid + ticks; monochrome heat (design system).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Model } from "../data/models";
import {
  DEFAULT_AXIS_MAPPING,
  buildAxisDomain,
  densityMarkerScale,
  hasMappedAxes,
  modelToSceneCoords,
  normalizeAxisMapping,
  type AxisDomain,
  type AxisMapping,
} from "../lib/axis-metrics";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier, ridgeOrder } from "../lib/pareto";
import {
  isSingleton,
  pointEncoding,
  type PresentationMode,
  type SemanticPointClass,
} from "./palette";
import { markChannels, type SceneGlyphKind } from "./mark-encoding";
import { familyIdOf, groupByFamily } from "../lib/family";
import { displayName } from "../lib/display-name";
import type { Stage3DSurface, StageCamera, StageRenderOptions, StageFitMode } from "./stage-api";

const DESIGN_SYSTEM_TOKEN_FALLBACKS = {
  filament: "#E8F1E4",
  filamentDim: "#C9D4C4",
  slateCyan: "#3D5560",
  textWarm: "#E7E2D8",
  textMuted: "#89939E",
  inkField: "#070C0B",
  fontMono: '"IBM Plex Mono", "Geist Mono", ui-monospace, monospace',
} as const;

/** Scene half-extent of the data cube (cube spans [-S, S] on each axis). */
const S = 1;
const EYE_Y_FLOOR = 0.15;

type GlyphKind = SceneGlyphKind | "box" | "box-open";

type LabelSpec = {
  text: string;
  world: THREE.Vector3;
  kind: "title" | "tick" | "mark";
  priority?: number;
};

/** Slight transparency on dim slate so occluded frontier marks read through. */
function semanticOpacity(hex: string): number {
  const h = hex.toLowerCase();
  // dominated slate family stays more transparent
  if (h.startsWith("#3") || h.startsWith("#4") || h.startsWith("#5") || h.startsWith("#6") || h.startsWith("#7") || h.startsWith("#8") || h.startsWith("#9")) {
    return 0.82;
  }
  return 1;
}


export class Stage3DThree implements Stage3DSurface {
  public readonly el: HTMLDivElement;
  public readonly gd: HTMLDivElement;

  private readonly heatEncoding: boolean;
  private presentationMode: PresentationMode = "curve";
  private highlightFamilyId: string | null = null;
  private soloFamily = false;
  private hasUserOrbited = false;
  private lastFitKey = "";
  private keyboardBound = false;
  private readonly tokens: {
    filament: string;
    filamentDim: string;
    slateCyan: string;
    textWarm: string;
    textMuted: string;
    inkField: string;
    fontMono: string;
  };

  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pointsGroup = new THREE.Group();
  private readonly ridgeLine: THREE.Line;
  private readonly trailsGroup = new THREE.Group();
  private readonly axisGroup = new THREE.Group();
  /** Decide mode: visible intelligence-floor plane(s) in the data cube. */
  private readonly floorPlaneGroup = new THREE.Group();
  private readonly labelRoot: HTMLDivElement;
  private labelSpecs: LabelSpec[] = [];

  /** Product camera: default x=cost, y=intel, z=speed (same as scene). */
  private cameraState: StageCamera = {
    // Corner view of the cube — all three axes readable (Plotly-like hero).
    eye: { x: -2.35, y: 1.55, z: 2.15 },
    up: { x: 0, y: 1, z: 0 },
    center: { x: 0, y: 0, z: 0 },
  };
  private axisMapping: AxisMapping = { ...DEFAULT_AXIS_MAPPING };
  private domains: { x: AxisDomain; y: AxisDomain; z: AxisDomain } | null = null;
  private modelIds: string[] = [];
  private pointMeshes: THREE.Mesh[] = [];
  private hoverId: string | null = null;
  private animFrame: number | null = null;
  private resizeObs: ResizeObserver | null = null;

  constructor(
    container: HTMLElement,
    heatEncoding = true,
    options: { debugBadge?: boolean } = {},
  ) {
    this.heatEncoding = heatEncoding;
    const styles = getComputedStyle(document.documentElement);
    const resolveToken = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    this.tokens = {
      filament: resolveToken("--filament", DESIGN_SYSTEM_TOKEN_FALLBACKS.filament),
      filamentDim: resolveToken("--filament-dim", DESIGN_SYSTEM_TOKEN_FALLBACKS.filamentDim),
      slateCyan: resolveToken("--slate-cyan", DESIGN_SYSTEM_TOKEN_FALLBACKS.slateCyan),
      textWarm: resolveToken("--text-warm", DESIGN_SYSTEM_TOKEN_FALLBACKS.textWarm),
      textMuted: resolveToken("--text-muted", DESIGN_SYSTEM_TOKEN_FALLBACKS.textMuted),
      inkField: resolveToken("--ink-field", DESIGN_SYSTEM_TOKEN_FALLBACKS.inkField),
      fontMono: resolveToken("--font-mono", DESIGN_SYSTEM_TOKEN_FALLBACKS.fontMono),
    };

    this.el = document.createElement("div");
    this.el.className = "stage-3d-canvas stage-3d-three";
    this.el.style.touchAction = "none";
    container.appendChild(this.el);
    this.gd = this.el;

    if (options.debugBadge) {
      const badge = document.createElement("div");
      badge.className = "stage-backend-badge";
      badge.textContent = "STAGE · THREE";
      badge.setAttribute("data-stage-backend", "three");
      badge.style.cssText = `position:absolute;top:0.55rem;left:0.65rem;z-index:4;
        font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em;
        color:${this.tokens.filament};border:1px solid rgba(232,241,228,0.45);
        padding:0.28rem 0.45rem;background:rgba(7,12,11,0.82);pointer-events:none;`;
      this.el.appendChild(badge);
    }

    this.scene.background = new THREE.Color(this.tokens.inkField);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new THREE.Color(this.tokens.inkField), 1);
    this.el.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D model benchmark stage plotting speed, cost, and intelligence. Use the model table in the console for accessible data.",
    );
    this.renderer.domElement.tabIndex = 0;

    this.scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.labelRoot = document.createElement("div");
    this.labelRoot.className = "stage-3d-axis-labels";
    this.labelRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:var(--font-mono);z-index:2;";
    this.el.appendChild(this.labelRoot);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 7;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("start", () => {
      this.hasUserOrbited = true;
    });
    this.controls.addEventListener("change", () => {
      if (this.camera.position.y < EYE_Y_FLOOR) this.camera.position.y = EYE_Y_FLOOR;
      this.cameraState.eye = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      };
      this.paintLabels();
    });

    this.scene.add(this.pointsGroup);
    this.scene.add(this.trailsGroup);
    this.scene.add(this.axisGroup);
    this.floorPlaneGroup.visible = false;
    this.scene.add(this.floorPlaneGroup);

    const ridgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#F4D58A"),
      transparent: false,
      opacity: 1,
      linewidth: 2,
    });
    this.ridgeLine = new THREE.Line(new THREE.BufferGeometry(), ridgeMat);
    this.scene.add(this.ridgeLine);

    this.applyCameraState();
    this.buildAxes();
    this.bindPointer();
    this.bindResize(container);
    this.startLoop();

    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this.showReloadPrompt();
      },
      false,
    );

    (this.gd as any).__stageBackend = "three";
    (this.gd as any).__setPointAppearance = (colors: string[], sizes: number[]) =>
      this.setPointAppearance(colors, sizes);
  }

  private showReloadPrompt() {
    if (this.el.querySelector(".webgl-lost-prompt")) return;
    const prompt = document.createElement("div");
    prompt.className = "webgl-lost-prompt";
    prompt.style.cssText = "position:absolute;inset:0;z-index:9;";
    prompt.innerHTML = `
      <div style="width:100%;height:100%;background:rgba(7,12,11,0.95);display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:var(--font-mono);color:var(--color-text);">
        <p style="margin-bottom:1rem;letter-spacing:0.1em;">WEBGL CONTEXT LOST</p>
        <button type="button" id="webgl-reload-btn" style="background:var(--filament);color:var(--ink-field);border:none;padding:0.5rem 1rem;cursor:pointer;font-family:var(--font-mono);">RELOAD GRAPH</button>
      </div>`;
    this.el.appendChild(prompt);
    prompt.querySelector("#webgl-reload-btn")?.addEventListener("click", () => window.location.reload());
  }

  private bindResize(container: HTMLElement) {
    const resize = () => {
      const w = Math.max(1, this.el.clientWidth || container.clientWidth || 300);
      const h = Math.max(1, this.el.clientHeight || container.clientHeight || 300);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.paintLabels();
    };
    resize();
    this.resizeObs = new ResizeObserver(resize);
    this.resizeObs.observe(this.el);
    this.resizeObs.observe(container);
  }

  private startLoop() {
    const tick = () => {
      this.animFrame = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private applyCameraState() {
    const { eye, center } = this.cameraState;
    const y = Math.max(eye.y, EYE_Y_FLOOR);
    this.camera.position.set(eye.x, y, eye.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center.x, center.y, center.z);
    this.controls?.target.set(center.x, center.y, center.z);
    this.controls?.update();
  }

  public setCamera(camera: Partial<StageCamera> | StageCamera) {
    const next = camera as StageCamera;
    this.cameraState = {
      eye: { ...this.cameraState.eye, ...(next.eye || {}) },
      up: { ...this.cameraState.up, ...(next.up || {}) },
      center: { ...this.cameraState.center, ...(next.center || {}) },
    };
    if (this.cameraState.eye.y < EYE_Y_FLOOR) this.cameraState.eye.y = EYE_Y_FLOOR;
    this.applyCameraState();
    this.controls.update();
    this.paintLabels();
  }

  public orbitTo(angleRad: number) {
    const radius = 3.1;
    const height = 1.45;
    const phase = (Math.PI * 5) / 4;
    this.setCamera({
      eye: {
        x: radius * Math.cos(angleRad + phase),
        y: height,
        z: radius * Math.sin(angleRad + phase),
      },
      up: { x: 0, y: 1, z: 0 },
      center: { x: 0, y: 0, z: 0 },
    });
  }

  /** Map a model through the current axis domains into the cube [-S, S]³. */
  private modelToScene(model: Model): THREE.Vector3 | null {
    if (!this.domains) return null;
    const coords = modelToSceneCoords(model, this.axisMapping, this.domains, S);
    if (!coords) return null;
    return new THREE.Vector3(coords.x, coords.y, coords.z);
  }

  /** Map a raw tick value on a scene axis into a world coordinate on that axis. */
  private tickToSceneAxis(axis: "x" | "y" | "z", value: number): number {
    if (!this.domains) return 0;
    const domain = this.domains[axis];
    const unit =
      domain.scale === "log"
        ? (() => {
            const v = Math.max(value <= 0 ? domain.floor : value, domain.floor);
            const logV = Math.log10(v);
            const logMin = Math.log10(domain.min);
            const logMax = Math.log10(domain.max);
            return logMax === logMin ? 0.5 : (logV - logMin) / (logMax - logMin);
          })()
        : domain.max === domain.min
          ? 0.5
          : (value - domain.min) / (domain.max - domain.min);
    return Math.min(1, Math.max(0, unit)) * 2 * S - S;
  }

  private addLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: THREE.Color,
    opacity: number,
  ) {
    const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
    this.axisGroup.add(new THREE.Line(geom, mat));
  }

  private clearFloorPlaneGroup() {
    while (this.floorPlaneGroup.children.length) {
      const child = this.floorPlaneGroup.children[0];
      this.floorPlaneGroup.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    }
  }

  /**
   * Decide mode: draw the intelligence floor as a real plane cutting the cube.
   * Everything on the high-intelligence side is eligible; below is dimmed.
   * Axis is whichever scene axis currently maps to `intelligence` (default Y).
   */
  private updateFloorPlane(floor: number | null) {
    this.clearFloorPlaneGroup();
    // Drop prior floor labels from the label list.
    this.labelSpecs = this.labelSpecs.filter((s) => s.kind !== "mark" || !s.text.startsWith("FLOOR"));

    if (floor == null || !this.domains) {
      this.floorPlaneGroup.visible = false;
      return;
    }

    const metricAxis =
      this.axisMapping.x === "intelligence"
        ? "x"
        : this.axisMapping.y === "intelligence"
          ? "y"
          : this.axisMapping.z === "intelligence"
            ? "z"
            : null;
    if (!metricAxis) {
      this.floorPlaneGroup.visible = false;
      return;
    }

    const t = this.tickToSceneAxis(metricAxis, floor);
    // Keep plane inside cube with a hair of padding so edges read.
    const lo = -S + 0.01;
    const hi = S - 0.01;
    const filament = new THREE.Color(this.tokens.filament);
    const dim = new THREE.Color(this.tokens.filamentDim);

    // Filled plane (double-sided, translucent).
    const planeSize = 2 * S - 0.02;
    const geom = new THREE.PlaneGeometry(planeSize, planeSize);
    const mat = new THREE.MeshBasicMaterial({
      color: filament,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);

    // Below-floor half-box tint (slab from cube low → floor) so the cut is obvious.
    const belowSpan = t - lo;
    let belowMesh: THREE.Mesh | null = null;
    if (belowSpan > 0.02) {
      const belowGeom = new THREE.BoxGeometry(
        metricAxis === "x" ? belowSpan : planeSize,
        metricAxis === "y" ? belowSpan : planeSize,
        metricAxis === "z" ? belowSpan : planeSize,
      );
      const belowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.tokens.slateCyan),
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      belowMesh = new THREE.Mesh(belowGeom, belowMat);
      // Center of slab midway between lo and floor.
      const mid = (lo + t) / 2;
      if (metricAxis === "x") belowMesh.position.set(mid, 0, 0);
      else if (metricAxis === "y") belowMesh.position.set(0, mid, 0);
      else belowMesh.position.set(0, 0, mid);
      this.floorPlaneGroup.add(belowMesh);
    }

    // Orient plane: default PlaneGeometry is XY facing +Z.
    if (metricAxis === "x") {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(t, 0, 0);
    } else if (metricAxis === "y") {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, t, 0);
    } else {
      mesh.position.set(0, 0, t);
    }
    mesh.renderOrder = 1;
    this.floorPlaneGroup.add(mesh);

    // Bright outline of the plane (four edges).
    const corners: THREE.Vector3[] = [];
    if (metricAxis === "x") {
      corners.push(
        new THREE.Vector3(t, lo, lo),
        new THREE.Vector3(t, hi, lo),
        new THREE.Vector3(t, hi, hi),
        new THREE.Vector3(t, lo, hi),
      );
    } else if (metricAxis === "y") {
      corners.push(
        new THREE.Vector3(lo, t, lo),
        new THREE.Vector3(hi, t, lo),
        new THREE.Vector3(hi, t, hi),
        new THREE.Vector3(lo, t, hi),
      );
    } else {
      corners.push(
        new THREE.Vector3(lo, lo, t),
        new THREE.Vector3(hi, lo, t),
        new THREE.Vector3(hi, hi, t),
        new THREE.Vector3(lo, hi, t),
      );
    }
    const edgePts = [...corners, corners[0]];
    const edgeGeom = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edgeMat = new THREE.LineBasicMaterial({
      color: filament,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const edgeLine = new THREE.Line(edgeGeom, edgeMat);
    edgeLine.renderOrder = 2;
    this.floorPlaneGroup.add(edgeLine);

    // Cross-hatch on the plane so it reads as a surface, not a glow.
    const hatchMat = new THREE.LineBasicMaterial({
      color: dim,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const hatchN = 5;
    for (let i = 1; i < hatchN; i++) {
      const u = lo + ((hi - lo) * i) / hatchN;
      let a: THREE.Vector3;
      let b: THREE.Vector3;
      if (metricAxis === "y") {
        a = new THREE.Vector3(u, t, lo);
        b = new THREE.Vector3(u, t, hi);
      } else if (metricAxis === "x") {
        a = new THREE.Vector3(t, u, lo);
        b = new THREE.Vector3(t, u, hi);
      } else {
        a = new THREE.Vector3(u, lo, t);
        b = new THREE.Vector3(u, hi, t);
      }
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      this.floorPlaneGroup.add(new THREE.Line(g, hatchMat));
    }

    // HTML label on the plane
    const labelWorld =
      metricAxis === "y"
        ? new THREE.Vector3(hi - 0.05, t + 0.06, lo + 0.05)
        : metricAxis === "x"
          ? new THREE.Vector3(t + 0.06, hi - 0.05, lo + 0.05)
          : new THREE.Vector3(hi - 0.05, hi - 0.05, t + 0.06);
    this.labelSpecs.push({
      text: `FLOOR · ${Math.round(floor)}`,
      world: labelWorld,
      kind: "mark",
      priority: 5,
    });

    this.floorPlaneGroup.visible = true;
  }

  private buildAxes() {
    while (this.axisGroup.children.length) {
      const child = this.axisGroup.children[0];
      this.axisGroup.remove(child);
      if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    }
    this.labelSpecs = [];

    const edge = new THREE.Color(this.tokens.textWarm);
    const grid = new THREE.Color(this.tokens.textWarm);

    // Full wireframe cube (Plotly-style bounding box).
    const c = [-S, S];
    for (const y of c) {
      for (const z of c) this.addLine(new THREE.Vector3(-S, y, z), new THREE.Vector3(S, y, z), edge, 0.55);
    }
    for (const x of c) {
      for (const z of c) this.addLine(new THREE.Vector3(x, -S, z), new THREE.Vector3(x, S, z), edge, 0.55);
    }
    for (const x of c) {
      for (const y of c) this.addLine(new THREE.Vector3(x, y, -S), new THREE.Vector3(x, y, S), edge, 0.55);
    }

    // Face grids (cost–intel at low speed; cost–speed at low intel; intel–speed at low cost).
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * S - S;
      // Floor (y = -S): cost × speed
      this.addLine(new THREE.Vector3(t, -S, -S), new THREE.Vector3(t, -S, S), grid, 0.22);
      this.addLine(new THREE.Vector3(-S, -S, t), new THREE.Vector3(S, -S, t), grid, 0.22);
      // Back (z = -S): cost × intel
      this.addLine(new THREE.Vector3(t, -S, -S), new THREE.Vector3(t, S, -S), grid, 0.1);
      this.addLine(new THREE.Vector3(-S, t, -S), new THREE.Vector3(S, t, -S), grid, 0.1);
      // Side (x = -S): intel × speed
      this.addLine(new THREE.Vector3(-S, t, -S), new THREE.Vector3(-S, t, S), grid, 0.1);
      this.addLine(new THREE.Vector3(-S, -S, t), new THREE.Vector3(-S, S, t), grid, 0.1);
    }

    const domains = this.domains;
    if (!domains) return;

    // Axis titles at high ends (labels follow the remapped metrics).
    this.labelSpecs.push(
      { text: domains.x.title, world: new THREE.Vector3(S + 0.12, -S, -S), kind: "title" },
      { text: domains.y.title, world: new THREE.Vector3(-S, S + 0.12, -S), kind: "title" },
      { text: domains.z.title, world: new THREE.Vector3(-S, -S, S + 0.12), kind: "title" },
    );

    for (const t of domains.x.ticks) {
      const sx = this.tickToSceneAxis("x", t.value);
      this.labelSpecs.push({
        text: t.label,
        world: new THREE.Vector3(sx, -S - 0.08, -S - 0.02),
        kind: "tick",
      });
    }
    for (const t of domains.y.ticks) {
      const sy = this.tickToSceneAxis("y", t.value);
      this.labelSpecs.push({
        text: t.label,
        world: new THREE.Vector3(-S - 0.08, sy, -S - 0.02),
        kind: "tick",
      });
    }
    for (const t of domains.z.ticks) {
      const sz = this.tickToSceneAxis("z", t.value);
      this.labelSpecs.push({
        text: t.label,
        world: new THREE.Vector3(-S - 0.02, -S - 0.08, sz),
        kind: "tick",
      });
    }
  }

  private glyphGeometry(kind: GlyphKind, radius: number): THREE.BufferGeometry {
    switch (kind) {
      case "box":
      case "box-open":
        return new THREE.BoxGeometry(radius * 1.7, radius * 1.7, radius * 1.7);
      case "octa":
      case "octa-open":
        return new THREE.OctahedronGeometry(radius * 1.25, 0);
      case "cross":
      case "x":
        return new THREE.BoxGeometry(radius * 2.1, radius * 0.45, radius * 0.45);
      default:
        return new THREE.SphereGeometry(radius, 16, 12);
    }
  }

  /** Plotly sizes are ~8–16 px; map to scene radius that does not fill the cube. */
  private radiusForSize(sizePx: number): number {
    return 0.045 + (sizePx / 16) * 0.055;
  }

  /**
   * Lab mark with ≥3 brand colors:
   *   body  = colors[0] (family-shaded fill)
   *   outer = colors[1] wire ring (brand secondary)
   *   core  = colors[2] small solid core (brand tertiary)
   */
  private makePointMesh(
    kind: GlyphKind,
    color: string,
    sizePx: number,
    accent?: string,
    core?: string,
  ): THREE.Mesh {
    const radius = this.radiusForSize(sizePx);
    const geom = this.glyphGeometry(kind, radius);
    const open = kind.endsWith("-open") || kind === "cross" || kind === "x";
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      wireframe: open,
      transparent: true,
      opacity: open ? 0.95 : 1,
      depthTest: true,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(geom, mat);
    if (kind === "x") mesh.rotation.z = Math.PI / 4;

    // Outer brand ring (colors[1]).
    if (accent && accent.toLowerCase() !== color.toLowerCase()) {
      const shellRadius = radius * (open ? 1.14 : 1.2);
      const shellGeom = this.glyphGeometry(kind, shellRadius);
      const shellMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent),
        wireframe: true,
        transparent: true,
        opacity: open ? 0.58 : 0.9,
        depthTest: true,
        depthWrite: false,
      });
      const shell = new THREE.Mesh(shellGeom, shellMat);
      if (kind === "x") shell.rotation.z = Math.PI / 4;
      shell.renderOrder = -1;
      mesh.add(shell);
      mesh.userData.accentShell = shell;
    }

    // Inner brand core (colors[2]) — solid kernel even when body is wireframe.
    if (core) {
      const coreRadius = radius * (open ? 0.42 : 0.38);
      const solidKind = (kind.replace(/-open$/, "") || "sphere") as GlyphKind;
      const coreGeom = this.glyphGeometry(solidKind, coreRadius);
      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(core),
        wireframe: false,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: true,
      });
      const coreMesh = new THREE.Mesh(coreGeom, coreMat);
      if (kind === "x") coreMesh.rotation.z = Math.PI / 4;
      coreMesh.renderOrder = 1;
      mesh.add(coreMesh);
      mesh.userData.coreShell = coreMesh;
    }

    // Store base radius for sweep scale updates.
    mesh.userData.baseRadius = radius;
    mesh.userData.baseSizePx = sizePx;
    return mesh;
  }

  public render(weights: ScoreWeights, modelsList: Model[], options?: StageRenderOptions) {
    this.axisMapping = normalizeAxisMapping(options?.axisMapping ?? this.axisMapping);
    if (options?.presentationMode) this.presentationMode = options.presentationMode;
    this.highlightFamilyId = options?.highlightFamilyId ?? null;
    this.soloFamily = Boolean(options?.soloFamily);
    // Stash fit for end of paint (after points exist).
    (this as any)._pendingFit = options?.fit ?? "none";

    const floor =
      options?.intelligenceFloor != null && Number.isFinite(options.intelligenceFloor)
        ? options.intelligenceFloor
        : null;
    const decidePareto = new Set(
      options?.decideParetoIds
        ? Array.isArray(options.decideParetoIds)
          ? options.decideParetoIds
          : [...options.decideParetoIds]
        : [],
    );
    const decideShortlist = new Set(
      options?.decideShortlistIds
        ? Array.isArray(options.decideShortlistIds)
          ? options.decideShortlistIds
          : [...options.decideShortlistIds]
        : [],
    );

    // Plot models that have all three mapped metrics.
    // Decide mode (intelligenceFloor set): suppress value-score optimum AND classic
    // multi-axis frontier primacy — only floor dim + cost×speed Pareto/shortlist rank.
    const decideMode = floor != null;
    const plottable = modelsList.filter((m) => hasMappedAxes(m, this.axisMapping));
    const frontierModels = decideMode ? [] : frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const optimumModel = decideMode ? undefined : weightedOptimum(scores)?.model;
    const frontierIds = new Set(frontierModels.map((m) => m.model));
    const markerDensity = densityMarkerScale(plottable.length);

    const narrow = this.el.clientWidth > 0 && this.el.clientWidth < 520;
    this.domains = {
      x: buildAxisDomain(this.axisMapping.x, plottable, { narrow }),
      y: buildAxisDomain(this.axisMapping.y, plottable, { narrow }),
      z: buildAxisDomain(this.axisMapping.z, plottable, { narrow }),
    };
    this.buildAxes();
    // Decide: intelligence floor as a visible cutting plane through the cube.
    this.updateFloorPlane(decideMode ? floor : null);

    while (this.pointsGroup.children.length) {
      const child = this.pointsGroup.children[0] as THREE.Mesh;
      this.pointsGroup.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
    }
    this.pointMeshes = [];
    this.modelIds = [];

    // Multi-effort endpoint vs mid: size hierarchy only (fills stay full brand chroma).
    const effortRoleByModel = new Map<string, "endpoint" | "mid" | "single">();
    {
      const byFam = new Map<string, typeof plottable>();
      for (const m of plottable) {
        const fid = familyIdOf(m);
        const arr = byFam.get(fid) ?? [];
        arr.push(m);
        byFam.set(fid, arr);
      }
      for (const members of byFam.values()) {
        if (members.length < 2) {
          for (const m of members) effortRoleByModel.set(m.model, "single");
          continue;
        }
        // members already effort-ordered via groupByFamily when used for trails;
        // sort by effort rank for endpoints.
        const ordered = members.slice().sort((a, b) => {
          const ta = (a.effort_tier || "").toString();
          const tb = (b.effort_tier || "").toString();
          return ta.localeCompare(tb) || a.model.localeCompare(b.model);
        });
        ordered.forEach((m, i) => {
          const role =
            i === 0 || i === ordered.length - 1 ? "endpoint" : "mid";
          effortRoleByModel.set(m.model, role);
        });
      }
    }
    const brandFull =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("brand") === "full";

    plottable.forEach((model) => {
      const pos = this.modelToScene(model);
      if (!pos) return;
      const isOptimum = Boolean(optimumModel && model.model === optimumModel.model);
      const isFrontier = frontierIds.has(model.model);
      // Decide: all points start as dominated; size/opacity from floor/Pareto/shortlist only.
      const semanticClass: SemanticPointClass = decideMode
        ? "dominated"
        : isOptimum
          ? "optimum"
          : isFrontier
            ? "frontier"
            : "dominated";
      const score = scores.find((c) => c.model.model === model.model)?.score ?? 0;
      const fid = familyIdOf(model);
      const singleton = isSingleton(model, plottable, familyIdOf);
      const soloThis =
        Boolean(this.soloFamily) ||
        (Boolean(this.highlightFamilyId) && this.highlightFamilyId === fid);
      const enc = pointEncoding({
        openness: model.openness,
        semanticClass,
        score,
        heatEncoding: this.heatEncoding,
        presentationMode: this.presentationMode,
        familyId: fid,
        singleton,
        provider: model.provider,
        solo: soloThis,
        selected: Boolean(
          this.highlightFamilyId &&
            this.highlightFamilyId === fid &&
            !this.soloFamily
        ) || isOptimum,
        brandFull,
        effortRole: effortRoleByModel.get(model.model) ?? "single",
        palette: {
          slateCyan: this.tokens.slateCyan,
          filamentDim: this.tokens.filamentDim,
          filament: this.tokens.filament,
          copper: "#C47A3A",
          gold: "#F4D58A",
        },
      });
      let color = enc.fill;
      // Size = value-score (via enc.sizeScale) as continuous 4th channel.
      // Frontier / optimum keep a size floor so hierarchy still wins at a glance.
      let size = Math.max(4, 11 * enc.sizeScale);
      if (!decideMode) {
        if (isOptimum) size = Math.max(size, 22);
        else if (isFrontier) size = Math.max(size, 14);
      }
      // Dense catalogs: shrink markers so neighbors read as separate marks.
      // Keep optimum slightly larger so it still wins the visual hierarchy.
      size = Math.max(3.5, size * (isOptimum ? Math.max(markerDensity, 0.85) : markerDensity));

      // Glyph = openness × reasoning only (lab is color; optimum is gold+size).
      const kind: GlyphKind = markChannels(model).sceneGlyph;

      let opacity = enc.opacity;
      if (this.highlightFamilyId && fid !== this.highlightFamilyId) {
        opacity = Math.min(opacity, 0.18);
        size = Math.max(4, size * 0.72);
      } else if (this.highlightFamilyId && fid === this.highlightFamilyId) {
        size = Math.max(size, isOptimum ? 22 : isFrontier ? 17 : 13);
      }
      // Decide mode: dim below floor; size hierarchy shortlist > Pareto > eligible.
      if (decideMode && floor != null) {
        const idx = model.aa_intelligence_index;
        const below = idx === null || idx < floor;
        if (below) {
          opacity = Math.min(opacity, 0.12);
          size = Math.max(3, size * 0.55);
          color = this.tokens.slateCyan;
        } else if (decideShortlist.has(model.model)) {
          size = 18;
          opacity = 0.98;
          color = this.tokens.filament;
        } else if (decidePareto.has(model.model)) {
          size = 14;
          opacity = 0.92;
          color = this.tokens.filamentDim;
        } else {
          size = 9;
          opacity = Math.min(opacity, 0.55);
        }
      }
      // Brand rings only when encoding says so (full catalog default off; focus on).
      const belowFloor =
        decideMode && floor != null && (model.aa_intelligence_index == null || model.aa_intelligence_index < floor);
      const accent = !belowFloor && enc.showRing ? enc.accent : undefined;
      const core = !belowFloor && enc.showCore ? enc.core : undefined;
      const mesh = this.makePointMesh(kind, color, size, accent, core);
      mesh.position.copy(pos);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.transparent = opacity < 0.99 || mat.transparent;
      mat.opacity = opacity;
      for (const key of ["accentShell", "coreShell"] as const) {
        const shell = mesh.userData[key] as THREE.Mesh | undefined;
        if (shell) {
          const sm = shell.material as THREE.MeshBasicMaterial;
          sm.opacity = Math.min(sm.opacity, opacity);
        }
      }
      mesh.userData.modelId = model.model;
      mesh.userData.semanticClass = semanticClass;
      mesh.userData.reasoning = Boolean(model.reasoning);
      mesh.userData.familyId = fid;
      mesh.userData.singleton = singleton;
      mesh.userData.encOpacity = enc.opacity; // pre-highlight base
      mesh.renderOrder = isOptimum ? 3 : isFrontier ? 2 : 1;
      this.pointsGroup.add(mesh);
      this.pointMeshes.push(mesh);
      this.modelIds.push(model.model);
    });

    // Family effort trails: connect every measured intensity step for a family
    // (ordered low→xhigh by effort rank). Real points only — no invented vertices.
    while (this.trailsGroup.children.length) {
      const child = this.trailsGroup.children[0] as THREE.Line;
      this.trailsGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    const byFamily = groupByFamily(plottable);
    let trailCount = 0;
    for (const [, members] of byFamily) {
      if (members.length < 2) continue;
      const pts = members
        .map((m) => this.modelToScene(m))
        .filter((p): p is THREE.Vector3 => p !== null);
      if (pts.length < 2) continue;
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const trailEnc = pointEncoding({
        openness: members[0].openness,
        semanticClass: "dominated",
        score: 0,
        heatEncoding: false,
        presentationMode: this.presentationMode,
        familyId: familyIdOf(members[0]),
        singleton: false,
        provider: members[0].provider,
      });
      const famId = familyIdOf(members[0]);
      let trailOpacity = trailEnc.trailOpacity ?? 0.45;
      if (this.highlightFamilyId && famId !== this.highlightFamilyId) trailOpacity = 0.12;
      else if (this.highlightFamilyId && famId === this.highlightFamilyId) trailOpacity = 0.9;
      else if (this.soloFamily) trailOpacity = 0.9;
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(trailEnc.trailColor),
        transparent: true,
        opacity: trailOpacity,
        depthWrite: false,
        linewidth: 2,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 0;
      line.userData.familyId = famId;
      this.trailsGroup.add(line);
      trailCount += 1;
    }
    // Expose for QA / UI readout of how many multi-effort curves are live.
    (this.gd as any).__familyTrailCount = trailCount;

    // Ridge only among frontier models that are also plottable on the current axes.
    const ridgeSource = frontierModels.filter((m) => hasMappedAxes(m, this.axisMapping));
    const vertices = ridgeOrder(ridgeSource);
    const ridgePts = vertices
      .map((v) => this.modelToScene(v.model))
      .filter((p): p is THREE.Vector3 => p !== null);
    this.ridgeLine.geometry.dispose();
    this.ridgeLine.geometry =
      ridgePts.length >= 2
        ? new THREE.BufferGeometry().setFromPoints(ridgePts)
        : new THREE.BufferGeometry();

    // Labels: always mark optimum; when a small multi-effort set is focused
    // (≤12 plottable points), label with short tier tags + NMS in paintLabels.
    // Keep Decide FLOOR plane labels.
    this.labelSpecs = this.labelSpecs.filter(
      (s) => s.kind !== "mark" || s.text.startsWith("FLOOR"),
    );
    const focusLabels = plottable.length > 0 && plottable.length <= 12;
    for (const mesh of this.pointMeshes) {
      const id = mesh.userData.modelId as string;
      const model = plottable.find((m) => m.model === id);
      if (!model) continue;
      const isOptimum = mesh.userData.semanticClass === "optimum";
      const isFrontier = mesh.userData.semanticClass === "frontier";
      if (!isOptimum && !focusLabels) continue;
      const tier = (model.effort_tier || "").toString().toLowerCase();
      let text: string;
      if (isOptimum) {
        const shortBase = displayName(id);
        const short = shortBase.length > 20 ? shortBase.slice(0, 18) + "…" : shortBase;
        text = short;
      } else if (focusLabels) {
        // Solo/focus: effort tier primary (optional short stem).
        const stem = displayName(id).split(/[\s(]/)[0]?.slice(0, 8) ?? "";
        const tierLabel =
          tier && tier !== "default" && tier !== "none"
            ? tier
            : tier === "none"
              ? "non-r"
              : stem || "?";
        text = tier && tier !== "default" ? tierLabel : `${stem} ${tierLabel}`.trim();
      } else {
        continue;
      }
      const priority = isOptimum ? 3 : isFrontier ? 2 : 1;
      this.labelSpecs.push({
        text,
        world: mesh.position.clone().add(new THREE.Vector3(0, 0.1, 0)),
        kind: "mark",
        priority,
      });
    }

    // Soft-fit multi-effort bounds on first paint / filter catalog change.
    const fitMode = (this as any)._pendingFit as StageFitMode | undefined;
    if (fitMode && fitMode !== "none") {
      this.fitToVisible(plottable, this.soloFamily ? "all" : fitMode);
    }

    if (!this.keyboardBound) {
      this.bindKeyboard();
      this.keyboardBound = true;
    }

    // Accessible name: value-score optimum only outside Decide mode (B′).
    if (decideMode) {
      this.renderer.domElement.setAttribute(
        "aria-label",
        `3D benchmark stage in Decide mode. ${this.pointMeshes.length} models. Floor ${floor}. Cost-speed shortlist and Pareto callouts active. Full table in instrument console.`,
      );
    } else {
      const optName = optimumModel?.model ?? "none";
      this.renderer.domElement.setAttribute(
        "aria-label",
        `3D benchmark stage. ${this.pointMeshes.length} models. Current optimum ${optName}. ${frontierIds.size} on Pareto frontier. Full table in instrument console.`,
      );
    }

    (this.gd as any).__stageModelIds = this.modelIds.slice();
    (this.gd as any).__stageBackend = "three";
    (this.gd as any).__setPointAppearance = (colors: string[], sizes: number[]) =>
      this.setPointAppearance(colors, sizes);

    const viz = (window as any).__viz ?? {};
    viz.stageThree = this;
    viz.stageModelIds = this.modelIds.slice();
    viz.stageBackend = "three";
    viz.pointCount = this.pointMeshes.length;
    viz.decideMode = decideMode;
    viz.pointSemanticClasses = this.pointMeshes.map(
      (m) => (m.userData.semanticClass as string) ?? "dominated",
    );
    (window as any).__viz = viz;

    this.paintLabels();
  }

  public setFamilyHighlight(familyId: string | null) {
    this.highlightFamilyId = familyId;
    for (const mesh of this.pointMeshes) {
      const fid = mesh.userData.familyId as string | undefined;
      const base = (mesh.userData.encOpacity as number) ?? 1;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (familyId && fid && fid !== familyId) {
        mat.transparent = true;
        mat.opacity = Math.min(base, 0.18);
        mesh.scale.setScalar(0.72);
      } else {
        mat.opacity = base;
        mesh.scale.setScalar(1);
      }
    }
    for (const child of this.trailsGroup.children) {
      const line = child as THREE.Line;
      const mat = line.material as THREE.LineBasicMaterial;
      const fid = line.userData.familyId as string | undefined;
      if (familyId && fid && fid !== familyId) {
        mat.opacity = 0.12;
      } else if (familyId && fid === familyId) {
        mat.opacity = 1;
      } else {
        mat.opacity = 0.92;
      }
    }
  }

  public setPointAppearance(colors: string[], sizes: number[]) {
    const n = Math.min(colors.length, sizes.length, this.pointMeshes.length);
    for (let i = 0; i < n; i++) {
      const mesh = this.pointMeshes[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(colors[i]);
      const base = (mesh.userData.baseSizePx as number) || 10;
      const scale = Math.max(0.4, sizes[i] / base);
      mesh.scale.setScalar(scale);
    }
  }

  private bindPointer() {
    const canvas = this.renderer.domElement;
    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    this.raycaster.params.Mesh = { threshold: 0.05 };

    canvas.addEventListener("pointermove", (event) => {
      updatePointer(event);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.pointMeshes, false);
      const id =
        hits.length > 0 && typeof hits[0].object.userData.modelId === "string"
          ? (hits[0].object.userData.modelId as string)
          : null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.gd.dispatchEvent(
          new CustomEvent("stage:hover", { detail: { modelId: id }, bubbles: true }),
        );
      }
    });
    canvas.addEventListener("pointerleave", () => {
      if (this.hoverId !== null) {
        this.hoverId = null;
        this.gd.dispatchEvent(
          new CustomEvent("stage:hover", { detail: { modelId: null }, bubbles: true }),
        );
      }
    });
  }

  private paintLabels() {
    this.labelRoot.innerHTML = "";
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (w < 2 || h < 2) return;

    type Placed = { text: string; x: number; y: number; kind: LabelSpec["kind"]; priority: number };
    const candidates: Placed[] = [];
    for (const { text, world, kind, priority } of this.labelSpecs) {
      const projected = world.clone().project(this.camera);
      if (projected.z > 1 || projected.z < -1) continue;
      if (projected.x < -1.2 || projected.x > 1.2 || projected.y < -1.2 || projected.y > 1.2) continue;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      candidates.push({ text, x, y, kind, priority: priority ?? (kind === "title" ? 4 : kind === "mark" ? 1 : 0) });
    }

    // NMS for mark labels: higher priority wins; axis titles/ticks always keep.
    const kept: Placed[] = [];
    const markBox = (p: Placed) => ({
      l: p.x - 36,
      r: p.x + 36,
      t: p.y - 14,
      b: p.y + 2,
    });
    const overlap = (a: ReturnType<typeof markBox>, b: ReturnType<typeof markBox>) =>
      !(a.r < b.l || a.l > b.r || a.b < b.t || a.t > b.b);

    const nonMarks = candidates.filter((c) => c.kind !== "mark");
    const marks = candidates
      .filter((c) => c.kind === "mark")
      .sort((a, b) => b.priority - a.priority);
    const acceptedMarks: Placed[] = [];
    for (const m of marks) {
      const box = markBox(m);
      if (acceptedMarks.some((k) => overlap(box, markBox(k)))) continue;
      acceptedMarks.push(m);
    }
    kept.push(...nonMarks, ...acceptedMarks);

    for (const { text, x, y, kind } of kept) {
      const el = document.createElement("span");
      el.textContent = text;
      const size = kind === "title" ? "11px" : kind === "mark" ? "10px" : "9px";
      const color =
        kind === "title" ? this.tokens.textWarm : kind === "mark" ? this.tokens.filament : this.tokens.textMuted;
      const weight = kind === "title" || kind === "mark" ? "500" : "400";
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-100%);
        color:${color};font-size:${size};font-weight:${weight};letter-spacing:0.03em;white-space:nowrap;
        opacity:${kind === "mark" ? 0.92 : kind === "title" ? 0.95 : 0.75};text-shadow:0 0 6px ${this.tokens.inkField};
        max-width:12rem;overflow:hidden;text-overflow:ellipsis;pointer-events:none;`;
      this.labelRoot.appendChild(el);
    }
  }

  /**
   * Soft-fit camera to multi-effort (or all) point bounds. Skips if user has
   * already orbited unless fit key (model set) changed and fit forced via options.
   */
  public fitToVisible(models: Model[], mode: StageFitMode = "multi-effort"): void {
    if (mode === "none") return;
    const plottable = models.filter((m) => hasMappedAxes(m, this.axisMapping));
    let targets = plottable;
    if (mode === "multi-effort") {
      const byFam = groupByFamily(plottable);
      targets = plottable.filter((m) => (byFam.get(familyIdOf(m))?.length ?? 0) >= 2);
      if (targets.length < 2) targets = plottable;
    }
    const pts = targets
      .map((m) => this.modelToScene(m))
      .filter((p): p is THREE.Vector3 => p !== null);
    if (pts.length === 0) return;

    const key = `${mode}:${targets.map((m) => m.model).sort().join("|")}`;
    // Fit once per catalog key (avoid thrashing on re-render).
    if (key === this.lastFitKey) return;
    this.lastFitKey = key;

    const box = new THREE.Box3().setFromPoints(pts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.25);
    const n = pts.length;
    // Solo ladders (few points) need tighter framing so the curve is readable.
    const padding = n <= 8 ? 1.35 : 1.15;
    const minDist = n <= 8 ? 1.65 : 2.2;
    const dist = Math.max(minDist, maxDim * (n <= 8 ? 2.05 : 2.4) * padding);
    // Keep similar corner viewing angle as product default.
    const dir = new THREE.Vector3(-0.75, 0.5, 0.68).normalize();
    const eye = center.clone().add(dir.multiplyScalar(dist));
    if (eye.y < EYE_Y_FLOOR) eye.y = EYE_Y_FLOOR;
    this.setCamera({
      eye: { x: eye.x, y: eye.y, z: eye.z },
      center: { x: center.x, y: center.y, z: center.z },
      up: { x: 0, y: 1, z: 0 },
    });
  }


  /** Arrow keys orbit; +/- dolly — keyboard path for stage (tastecheck A11Y-02). */
  private bindKeyboard() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("keydown", (event: KeyboardEvent) => {
      if (document.activeElement !== canvas) return;
      const step = event.shiftKey ? 0.12 : 0.06;
      let handled = true;
      switch (event.key) {
        case "ArrowLeft":
          this.orbitTo(Math.atan2(this.camera.position.x, this.camera.position.z) + step);
          break;
        case "ArrowRight":
          this.orbitTo(Math.atan2(this.camera.position.x, this.camera.position.z) - step);
          break;
        case "ArrowUp": {
          const sph = new THREE.Spherical().setFromVector3(
            this.camera.position.clone().sub(this.controls.target),
          );
          sph.phi = Math.max(0.2, sph.phi - step);
          const v = new THREE.Vector3().setFromSpherical(sph).add(this.controls.target);
          this.setCamera({ eye: { x: v.x, y: v.y, z: v.z } });
          break;
        }
        case "ArrowDown": {
          const sph = new THREE.Spherical().setFromVector3(
            this.camera.position.clone().sub(this.controls.target),
          );
          sph.phi = Math.min(Math.PI / 2 - 0.05, sph.phi + step);
          const v = new THREE.Vector3().setFromSpherical(sph).add(this.controls.target);
          this.setCamera({ eye: { x: v.x, y: v.y, z: v.z } });
          break;
        }
        case "=":
        case "+": {
          const dir = this.controls.target.clone().sub(this.camera.position).normalize();
          this.camera.position.add(dir.multiplyScalar(0.15));
          this.controls.update();
          break;
        }
        case "-":
        case "_": {
          const dir = this.camera.position.clone().sub(this.controls.target).normalize();
          this.camera.position.add(dir.multiplyScalar(0.15));
          this.controls.update();
          break;
        }
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
        this.hasUserOrbited = true;
        this.paintLabels();
      }
    });
    canvas.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown + -");
  }

  destroy() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.el.remove();
  }
}
