/**
 * Three.js 3D hero stage (docs/v1/r3f-stage-contract.md).
 * Vanilla TS — no React/R3F required for this SPA.
 *
 * Scene uses Three's default Y-up: x=cost, y=intelligence, z=speed.
 * (Plotly camera "up" was +Z=speed; we keep the product axes, Y-up for stable OrbitControls.)
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Model, isScorable, PROVIDER_SHAPES } from "../data/models";
import { ScoreWeights, normalizedScores, weightedOptimum } from "../lib/score";
import { frontier, ridgeOrder } from "../lib/pareto";
import { semanticPointFill, type SemanticPointClass } from "./palette";
import type { Stage3DSurface, StageCamera } from "./stage-api";

const DESIGN_SYSTEM_TOKEN_FALLBACKS = {
  filament: "#E8F1E4",
  filamentDim: "#C9D4C4",
  slateCyan: "#3D5560",
  textWarm: "#E7E2D8",
  textMuted: "#89939E",
  inkField: "#070C0B",
  fontMono: '"IBM Plex Mono", "Geist Mono", ui-monospace, monospace',
} as const;

/** Floor clamp on camera Y so we never go under the stage. */
const EYE_Y_FLOOR = 0.25;

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
  private readonly axisGroup = new THREE.Group();
  private readonly labelRoot: HTMLDivElement;

  /** Product camera (cost, intelligence, speed) — mapped into Three Y-up scene. */
  private cameraState: StageCamera = {
    eye: { x: -1.55, y: -1.35, z: 1.25 },
    up: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, z: 0 },
  };
  private priceFloor = 0.08125;
  private modelIds: string[] = [];
  private pointMeshes: THREE.Mesh[] = [];
  private hoverId: string | null = null;
  private animFrame: number | null = null;
  private resizeObs: ResizeObserver | null = null;

  constructor(container: HTMLElement, heatEncoding = true) {
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
    // Keep .stage-3d-canvas absolute inset:0 — do not force position:relative.
    this.el.style.touchAction = "none";
    container.appendChild(this.el);
    this.gd = this.el;

    const badge = document.createElement("div");
    badge.className = "stage-backend-badge";
    badge.textContent = "STAGE · THREE";
    badge.setAttribute("data-stage-backend", "three");
    badge.style.cssText = `position:absolute;top:0.55rem;left:0.65rem;z-index:4;
      font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em;
      color:${this.tokens.filament};border:1px solid rgba(232,241,228,0.35);
      padding:0.28rem 0.45rem;background:rgba(7,12,11,0.78);pointer-events:none;`;
    this.el.appendChild(badge);

    this.scene.background = new THREE.Color(this.tokens.inkField);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      // Needed for Playwright/readPixels QA and some multi-GPU browsers.
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

    // Unlit materials stay readable without depending on light setup.
    const amb = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(amb);

    this.labelRoot = document.createElement("div");
    this.labelRoot.className = "stage-3d-axis-labels";
    this.labelRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:var(--font-mono);z-index:2;";
    this.el.appendChild(this.labelRoot);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 6;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("change", () => {
      if (this.camera.position.y < EYE_Y_FLOOR) this.camera.position.y = EYE_Y_FLOOR;
      // Sync product camera state (x=cost, y=intel, z=speed) from Three (x,y,z)=(cost,intel,speed)
      this.cameraState.eye = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      };
      this.paintLabels();
    });

    this.scene.add(this.pointsGroup);
    this.scene.add(this.axisGroup);

    const ridgeGeom = new THREE.BufferGeometry();
    const ridgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(this.tokens.filament),
    });
    this.ridgeLine = new THREE.Line(ridgeGeom, ridgeMat);
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

  /**
   * Product camera uses Plotly-style eye (x=cost, y=intel, z=speed, up=+z).
   * Three scene is Y-up with the same axis assignment, so product eye maps 1:1.
   */
  private applyCameraState() {
    const { eye, center } = this.cameraState;
    const y = Math.max(eye.y, EYE_Y_FLOOR);
    this.camera.position.set(eye.x, y, eye.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center.x, center.y, center.z);
    this.controls?.target.set(center.x, center.y, center.z);
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
    const radius = 2.1;
    const height = 1.15;
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

  /** Map data → scene: x=cost, y=intelligence, z=speed, range ~[-0.9, 0.9]. */
  private toScene(cost: number, intel: number, speed: number): THREE.Vector3 {
    const logCost = Math.log10(Math.max(cost, this.priceFloor));
    const logCostMin = Math.log10(this.priceFloor);
    const logCostMax = Math.log10(100);
    const logSpeed = Math.log10(Math.max(speed, 10));
    const logSpeedMin = Math.log10(10);
    const logSpeedMax = Math.log10(1000);
    const nx = ((logCost - logCostMin) / (logCostMax - logCostMin)) * 1.8 - 0.9;
    const ny = (intel / 100) * 1.8 - 0.9;
    const nz = ((logSpeed - logSpeedMin) / (logSpeedMax - logSpeedMin)) * 1.8 - 0.9;
    return new THREE.Vector3(nx, ny, nz);
  }

  private buildAxes() {
    while (this.axisGroup.children.length) {
      const child = this.axisGroup.children[0];
      this.axisGroup.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    const axisColor = new THREE.Color(this.tokens.textWarm);
    const makeAxis = (from: THREE.Vector3, to: THREE.Vector3, opacity: number) => {
      const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
      const mat = new THREE.LineBasicMaterial({
        color: axisColor,
        transparent: true,
        opacity,
      });
      this.axisGroup.add(new THREE.Line(geom, mat));
    };
    const o = this.toScene(this.priceFloor, 0, 10);
    const cx = this.toScene(100, 0, 10);
    const cy = this.toScene(this.priceFloor, 100, 10);
    const cz = this.toScene(this.priceFloor, 0, 1000);
    makeAxis(o, cx, 0.85);
    makeAxis(o, cy, 0.85);
    makeAxis(o, cz, 0.85);

    // Floor plane so the stage never reads as pure void.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.tokens.slateCyan),
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    // Cost–speed floor at intel=0 (y = low)
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(this.toScene(Math.sqrt(this.priceFloor * 100), 0, Math.sqrt(10 * 1000)));
    floor.position.y = this.toScene(this.priceFloor, 0, 10).y;
    this.axisGroup.add(floor);

    const gridMat = new THREE.LineBasicMaterial({
      color: axisColor,
      transparent: true,
      opacity: 0.28,
    });
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const cost = this.priceFloor * Math.pow(100 / this.priceFloor, t);
      const intel = t * 100;
      const a = this.toScene(cost, 0, 10);
      const b = this.toScene(cost, 100, 10);
      const c = this.toScene(this.priceFloor, intel, 10);
      const d = this.toScene(100, intel, 10);
      this.axisGroup.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), gridMat.clone()),
      );
      this.axisGroup.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints([c, d]), gridMat.clone()),
      );
    }
  }

  private glyphGeometry(kind: GlyphKind, scale: number): THREE.BufferGeometry {
    // Large enough to read at n≈35 without looking like dust.
    const s = scale * 0.07;
    switch (kind) {
      case "box":
      case "box-open":
        return new THREE.BoxGeometry(s * 1.6, s * 1.6, s * 1.6);
      case "octa":
      case "octa-open":
        return new THREE.OctahedronGeometry(s * 1.15, 0);
      case "cross":
      case "x":
        return new THREE.BoxGeometry(s * 1.9, s * 0.5, s * 0.5);
      default:
        return new THREE.SphereGeometry(s, 20, 16);
    }
  }

  private makePointMesh(kind: GlyphKind, color: string, sizePx: number): THREE.Mesh {
    const scale = sizePx / 10;
    const geom = this.glyphGeometry(kind, scale);
    const open = kind.endsWith("-open") || kind === "cross" || kind === "x";
    // MeshBasicMaterial: always visible, no lighting dependency.
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      wireframe: open,
      transparent: true,
      opacity: open ? 0.95 : 1,
      depthTest: true,
    });
    const mesh = new THREE.Mesh(geom, mat);
    if (kind === "x") mesh.rotation.z = Math.PI / 4;
    return mesh;
  }

  public render(weights: ScoreWeights, modelsList: Model[]) {
    const scorable = modelsList.filter(isScorable);
    const frontierModels = frontier(modelsList);
    const scores = normalizedScores(modelsList, weights, modelsList);
    const optimumModel = weightedOptimum(scores)?.model;
    const frontierIds = new Set(frontierModels.map((m) => m.model));

    const positivePrices = scorable
      .map((m) => m.blended_price_per_M!)
      .filter((p) => p > 0);
    this.priceFloor = positivePrices.length > 0 ? Math.min(...positivePrices) / 2 : 0.08125;
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
      scorable
        .filter((m) => frontierIds.has(m.model) && m.model !== optimumModel?.model)
        .map((m) => SHAPE_TO_GLYPH[PROVIDER_SHAPES[m.provider] || "circle"] || "sphere"),
    );

    scorable.forEach((model) => {
      const isOptimum = Boolean(optimumModel && model.model === optimumModel.model);
      const isFrontier = frontierIds.has(model.model);
      const semanticClass: SemanticPointClass = isOptimum
        ? "optimum"
        : isFrontier
          ? "frontier"
          : "dominated";
      const price =
        model.blended_price_per_M! <= 0 ? this.priceFloor : model.blended_price_per_M!;
      const pos = this.toScene(price, model.aa_intelligence_index!, model.tps!);
      const score = scores.find((c) => c.model.model === model.model)?.score ?? 0;
      const color = semanticPointFill(semanticClass, score, this.heatEncoding, {
        slateCyan: this.tokens.slateCyan,
        filamentDim: this.tokens.filamentDim,
        filament: this.tokens.filament,
      });
      let size = 10;
      if (isOptimum) size = 18;
      else if (isFrontier) size = 13;
      else size = 9;

      let kind: GlyphKind =
        SHAPE_TO_GLYPH[PROVIDER_SHAPES[model.provider] || "circle"] || "sphere";
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
      this.pointsGroup.add(mesh);
      this.pointMeshes.push(mesh);
      this.modelIds.push(model.model);
    });

    const vertices = ridgeOrder(frontierModels);
    const ridgePts = vertices.map((v) => {
      const p =
        v.model.blended_price_per_M! <= 0 ? this.priceFloor : v.model.blended_price_per_M!;
      return this.toScene(p, v.model.aa_intelligence_index!, v.model.tps!);
    });
    this.ridgeLine.geometry.dispose();
    this.ridgeLine.geometry =
      ridgePts.length >= 2
        ? new THREE.BufferGeometry().setFromPoints(ridgePts)
        : new THREE.BufferGeometry();

    (this.gd as any).__stageModelIds = this.modelIds.slice();
    (this.gd as any).__stageBackend = "three";
    (this.gd as any).__setPointAppearance = (colors: string[], sizes: number[]) =>
      this.setPointAppearance(colors, sizes);

    // Always expose for visual QA (preview is production mode).
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
      const scale = sizes[i] / 10;
      mesh.scale.setScalar(Math.max(0.45, scale));
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

    // Larger pick radius for small glyphs.
    this.raycaster.params.Mesh = { threshold: 0.08 };

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
    const ends: Array<{ text: string; world: THREE.Vector3 }> = [
      { text: "COST ($/M)", world: this.toScene(100, 0, 10) },
      { text: "INTELLIGENCE", world: this.toScene(this.priceFloor, 100, 10) },
      { text: "SPEED (TPS)", world: this.toScene(this.priceFloor, 0, 1000) },
    ];
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (w < 2 || h < 2) return;
    ends.forEach(({ text, world }) => {
      const projected = world.clone().project(this.camera);
      if (projected.z > 1) return;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      const el = document.createElement("span");
      el.textContent = text;
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);
        color:${this.tokens.textWarm};font-size:11px;letter-spacing:0.06em;white-space:nowrap;
        opacity:0.9;text-shadow:0 0 8px ${this.tokens.inkField};`;
      this.labelRoot.appendChild(el);
    });
  }

  destroy() {
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.el.remove();
  }
}
