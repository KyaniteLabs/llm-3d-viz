/**
 * Three.js 3D hero stage (docs/v1/r3f-stage-contract.md).
 * Vanilla TS — no React/R3F.
 *
 * Default product axes: x=cost (log), y=intelligence (linear 0–100), z=speed (log).
 * Scene is Three Y-up with that assignment. Metrics on X/Y/Z are remappable via
 * AxisMapping so cost definition (and other metrics) need not be permanently chosen.
 * Visual target: Plotly-parity cube + grid + ticks; monochrome heat (design system).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Model, PROVIDER_SHAPES } from "../data/models";
import {
  DEFAULT_AXIS_MAPPING,
  buildAxisDomain,
  hasMappedAxes,
  modelToSceneCoords,
  normalizeAxisMapping,
  type AxisDomain,
  type AxisMapping,
} from "../lib/axis-metrics";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier, ridgeOrder } from "../lib/pareto";
import { aaPointFill, labColor, type SemanticPointClass } from "./palette";
import { groupByFamily } from "../lib/family";
import { displayName } from "../lib/display-name";
import type { Stage3DSurface, StageCamera, StageRenderOptions } from "./stage-api";

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

type GlyphKind = "sphere" | "sphere-open" | "box" | "box-open" | "octa" | "octa-open" | "cross" | "x";

const SHAPE_TO_GLYPH: Record<string, GlyphKind> = {
  circle: "sphere",
  "circle-open": "sphere-open",
  diamond: "octa",
  "diamond-open": "octa-open",
  square: "box",
  "square-open": "box-open",
  cross: "cross",
  x: "x",
};

type LabelSpec = { text: string; world: THREE.Vector3; kind: "title" | "tick" | "mark" };

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

  private makePointMesh(kind: GlyphKind, color: string, sizePx: number): THREE.Mesh {
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
    // Store base radius for sweep scale updates.
    mesh.userData.baseRadius = radius;
    mesh.userData.baseSizePx = sizePx;
    return mesh;
  }

  public render(weights: ScoreWeights, modelsList: Model[], options?: StageRenderOptions) {
    this.axisMapping = normalizeAxisMapping(options?.axisMapping ?? this.axisMapping);

    // Plot models that have all three mapped metrics. Value-score / frontier still
    // use the classic speed×cost×intelligence contract among isScorable rows.
    const plottable = modelsList.filter((m) => hasMappedAxes(m, this.axisMapping));
    const frontierModels = frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const optimumModel = weightedOptimum(scores)?.model;
    const frontierIds = new Set(frontierModels.map((m) => m.model));

    const narrow = this.el.clientWidth > 0 && this.el.clientWidth < 520;
    this.domains = {
      x: buildAxisDomain(this.axisMapping.x, plottable, { narrow }),
      y: buildAxisDomain(this.axisMapping.y, plottable, { narrow }),
      z: buildAxisDomain(this.axisMapping.z, plottable, { narrow }),
    };
    this.buildAxes();

    while (this.pointsGroup.children.length) {
      const child = this.pointsGroup.children[0] as THREE.Mesh;
      this.pointsGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    this.pointMeshes = [];
    this.modelIds = [];

    const otherFrontierKinds = new Set(
      plottable
        .filter((m) => frontierIds.has(m.model) && m.model !== optimumModel?.model)
        .map((m) => SHAPE_TO_GLYPH[PROVIDER_SHAPES[m.provider] || "circle"] || "sphere"),
    );

    plottable.forEach((model) => {
      const pos = this.modelToScene(model);
      if (!pos) return;
      const isOptimum = Boolean(optimumModel && model.model === optimumModel.model);
      const isFrontier = frontierIds.has(model.model);
      const semanticClass: SemanticPointClass = isOptimum
        ? "optimum"
        : isFrontier
          ? "frontier"
          : "dominated";
      const score = scores.find((c) => c.model.model === model.model)?.score ?? 0;
      const color = aaPointFill(model.openness, semanticClass, score, this.heatEncoding, {
        slateCyan: this.tokens.slateCyan,
        filamentDim: this.tokens.filamentDim,
        filament: this.tokens.filament,
        copper: "#C47A3A",
        gold: "#F4D58A",
      });
      let size = 11;
      if (isOptimum) size = 22;
      else if (isFrontier) size = 15;
      else size = 11;

      let kind: GlyphKind =
        SHAPE_TO_GLYPH[PROVIDER_SHAPES[model.provider] || "circle"] || "sphere";
      // Reasoning models use open wireframe mark when not already open-shaped.
      if (model.reasoning && !kind.endsWith("-open") && kind !== "cross" && kind !== "x") {
        kind = (kind + "-open") as GlyphKind;
      }
      if (isOptimum) {
        const candidates: GlyphKind[] = [
          "sphere",
          "octa",
          "box",
          "cross",
          "sphere-open",
          "octa-open",
        ];
        kind =
          candidates.find((c) => c !== kind && !otherFrontierKinds.has(c)) ??
          (kind === "octa" ? "sphere" : "octa");
      }

      const mesh = this.makePointMesh(kind, color, size);
      mesh.position.copy(pos);
      mesh.userData.modelId = model.model;
      mesh.userData.semanticClass = semanticClass;
      mesh.userData.reasoning = Boolean(model.reasoning);
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
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(labColor(members[0].provider)),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 0;
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
    // (≤12 plottable points), label every point with effort tier for navigability.
    // Keep axis title/tick specs from buildAxes — only replace mark labels.
    this.labelSpecs = this.labelSpecs.filter((s) => s.kind !== "mark");
    const focusLabels = plottable.length > 0 && plottable.length <= 12;
    for (const mesh of this.pointMeshes) {
      const id = mesh.userData.modelId as string;
      const model = plottable.find((m) => m.model === id);
      if (!model) continue;
      const isOptimum = mesh.userData.semanticClass === "optimum";
      if (!isOptimum && !focusLabels) continue;
      const tier = (model.effort_tier || "").toString();
      const shortBase = displayName(id);
      const short = shortBase.length > 28 ? shortBase.slice(0, 26) + "…" : shortBase;
      const reasonMark = isOptimum ? (mesh.userData.reasoning ? "⚡ " : "★ ") : "";
      const tierMark =
        tier && tier !== "default" && tier !== "none"
          ? ` · ${tier}`
          : tier === "none"
            ? " · non-reason"
            : "";
      this.labelSpecs.push({
        text: `${reasonMark}${short}${tierMark}`,
        world: mesh.position.clone().add(new THREE.Vector3(0, 0.1, 0)),
        kind: "mark",
      });
    }

    // Accessible name tracks current optimum.
    const optName = optimumModel?.model ?? "none";
    this.renderer.domElement.setAttribute(
      "aria-label",
      `3D benchmark stage. ${this.pointMeshes.length} models. Current optimum ${optName}. ${frontierIds.size} on Pareto frontier. Full table in instrument console.`,
    );

    (this.gd as any).__stageModelIds = this.modelIds.slice();
    (this.gd as any).__stageBackend = "three";
    (this.gd as any).__setPointAppearance = (colors: string[], sizes: number[]) =>
      this.setPointAppearance(colors, sizes);

    const viz = (window as any).__viz ?? {};
    viz.stageThree = this;
    viz.stageModelIds = this.modelIds.slice();
    viz.stageBackend = "three";
    viz.pointCount = this.pointMeshes.length;
    (window as any).__viz = viz;

    this.paintLabels();
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
    for (const { text, world, kind } of this.labelSpecs) {
      const projected = world.clone().project(this.camera);
      if (projected.z > 1 || projected.z < -1) continue;
      if (projected.x < -1.2 || projected.x > 1.2 || projected.y < -1.2 || projected.y > 1.2) continue;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
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

  destroy() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.el.remove();
  }
}
