/**
 * Three.js 3D hero stage (docs/v1/r3f-stage-contract.md).
 * Vanilla TS — no React/R3F required for this SPA.
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

const EYE_Z_FLOOR = 0.2;

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

  private cameraState: StageCamera = {
    eye: { x: -1.45, y: -1.25, z: 1.15 },
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
    this.el.style.width = "100%";
    this.el.style.height = "100%";
    this.el.style.position = "relative";
    this.el.style.touchAction = "none";
    container.appendChild(this.el);
    this.gd = this.el;

    this.scene.background = new THREE.Color(this.tokens.inkField);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
    this.applyCameraState();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(this.tokens.inkField, 1);
    this.el.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";

    this.labelRoot = document.createElement("div");
    this.labelRoot.className = "stage-3d-axis-labels";
    this.labelRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:var(--font-mono);";
    this.el.appendChild(this.labelRoot);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener("change", () => {
      if (this.camera.position.z < EYE_Z_FLOOR) {
        this.camera.position.z = EYE_Z_FLOOR;
      }
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
    const { eye, center, up } = this.cameraState;
    if (eye.z < EYE_Z_FLOOR) eye.z = EYE_Z_FLOOR;
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.up.set(up.x, up.y, up.z);
    this.camera.lookAt(center.x, center.y, center.z);
  }

  public setCamera(camera: Partial<StageCamera> | StageCamera) {
    const next = camera as StageCamera;
    this.cameraState = {
      eye: { ...this.cameraState.eye, ...(next.eye || {}) },
      up: { ...this.cameraState.up, ...(next.up || {}) },
      center: { ...this.cameraState.center, ...(next.center || {}) },
    };
    if (this.cameraState.eye.z < EYE_Z_FLOOR) this.cameraState.eye.z = EYE_Z_FLOOR;
    this.applyCameraState();
    this.controls.target.set(
      this.cameraState.center.x,
      this.cameraState.center.y,
      this.cameraState.center.z,
    );
    this.controls.update();
    this.paintLabels();
  }

  public orbitTo(angleRad: number) {
    const radius = 1.9;
    const height = 1.15;
    const phase = (Math.PI * 5) / 4;
    this.setCamera({
      eye: {
        x: radius * Math.cos(angleRad + phase),
        y: radius * Math.sin(angleRad + phase),
        z: height,
      },
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
    });
  }

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
    makeAxis(o, cx, 0.45);
    makeAxis(o, cy, 0.45);
    makeAxis(o, cz, 0.45);

    const gridMat = new THREE.LineBasicMaterial({
      color: axisColor,
      transparent: true,
      opacity: 0.12,
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
    const s = scale * 0.028;
    switch (kind) {
      case "box":
      case "box-open":
        return new THREE.BoxGeometry(s * 1.6, s * 1.6, s * 1.6);
      case "octa":
      case "octa-open":
        return new THREE.OctahedronGeometry(s * 1.1, 0);
      case "cross":
      case "x":
        return new THREE.BoxGeometry(s * 1.8, s * 0.45, s * 0.45);
      default:
        return new THREE.SphereGeometry(s, 16, 12);
    }
  }

  private makePointMesh(kind: GlyphKind, color: string, sizePx: number): THREE.Mesh {
    const scale = sizePx / 10;
    const geom = this.glyphGeometry(kind, scale);
    const open = kind.endsWith("-open") || kind === "cross" || kind === "x";
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      wireframe: open,
      transparent: true,
      opacity: open ? 0.95 : 1,
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
      let size = 9;
      if (isOptimum) size = 16;
      else if (isFrontier) size = 11;
      else size = 8;

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

    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const viz = (window as any).__viz ?? {};
      viz.stageThree = this;
      viz.stageModelIds = this.modelIds.slice();
      viz.stageBackend = "three";
      (window as any).__viz = viz;
    }

    this.paintLabels();
  }

  public setPointAppearance(colors: string[], sizes: number[]) {
    const n = Math.min(colors.length, sizes.length, this.pointMeshes.length);
    for (let i = 0; i < n; i++) {
      const mesh = this.pointMeshes[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(colors[i]);
      const scale = sizes[i] / 10;
      mesh.scale.setScalar(Math.max(0.4, scale));
    }
  }

  private bindPointer() {
    const canvas = this.renderer.domElement;
    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

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
        color:${this.tokens.textWarm};font-size:10px;letter-spacing:0.06em;white-space:nowrap;
        opacity:0.85;text-shadow:0 0 6px ${this.tokens.inkField};`;
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
