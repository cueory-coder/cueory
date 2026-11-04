/**
 * The anatomy lab's three.js side (Task 178). This module is imported only after the student taps "open the anatomy
 * lab" (a dynamic import in AnatomyLab.tsx), so nothing from three.js is in the page's first download.
 *
 * Models are .glb files compressed with meshopt (D-58), decoded on the page's own thread: MeshoptDecoder's WebAssembly
 * needs only the CSP's 'wasm-unsafe-eval' (D-49), and its worker mode (blob: workers) is never turned on.
 * Colors come from the brand tokens at runtime (getComputedStyle), so the model follows the Daytime and Evening palettes.
 */
import * as THREE from 'three';
import { disposeAnatomyMaterials, disposeAnatomyMeshResources, indexAnatomyGroup, summarizeIndexedAnatomyIds } from './anatomymeshindex';
import { withTemporaryMeshAppearance } from './anatomyidpass';
import { createDemandFrameScheduler, remainingIdleDelay } from './anatomyframe';
import { loadModelsOrDispose, uniqueAnatomyModelUrls } from './anatomylazy';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  BEHIND_MARK,
  EXPORT_SIZES,
  encodeId,
  exportRegion,
  findVisibleAnchors,
  fitDistance,
  labelLines,
  labelRoomFor,
  placeLabels,
  pickedStructure,
  wrapText,
  type ExportSize,
  type Rect,
  type VisibilityTarget,
  visibleSelection,
} from './anatomylab';

/** Brand colors the scene and the exported pictures use, read from the tokens in src/styles/tokens.css. */
export interface LabColors {
  page: string;
  surface: string;
  ink: string;
  inkSoft: string;
  line: string;
  model: string;
  modelAlt: string;
  modelSelected: string;
  /** How opaque the other structures are while one is selected. */
  dimAlpha: number;
  /** The interface font (--font-body). */
  font: string;
}

export function readColors(root: HTMLElement = document.documentElement): LabColors {
  const style = getComputedStyle(root);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const alpha = Number.parseFloat(get('--model-dim-alpha'));
  return {
    page: get('--color-page'),
    surface: get('--color-surface'),
    ink: get('--color-ink'),
    inkSoft: get('--color-ink-soft'),
    line: get('--color-line'),
    model: get('--color-model'),
    modelAlt: get('--color-model-alt'),
    modelSelected: get('--color-model-selected'),
    dimAlpha: Number.isFinite(alpha) ? alpha : 0.2,
    font: get('--font-body') || 'sans-serif',
  };
}

/** The picture-export sizes, read from the --export-* tokens (src/styles/tokens.css); pixels at `reference`. */
export interface ExportTokens {
  reference: number;
  title: number;
  label: number;
  credit: number;
  pad: number;
  offset: number;
  gap: number;
  radius: number;
  line: number;
  dash: number;
  dashGap: number;
  dot: number;
  leading: number;
  labelPadX: number;
  labelPadY: number;
  labelRoom: number;
}

const EXPORT_TOKEN_NAMES: Record<keyof ExportTokens, string> = {
  reference: '--export-reference',
  title: '--export-title',
  label: '--export-label',
  credit: '--export-credit',
  pad: '--export-pad',
  offset: '--export-offset',
  gap: '--export-gap',
  radius: '--export-radius',
  line: '--export-line',
  dash: '--export-dash',
  dashGap: '--export-dash-gap',
  dot: '--export-dot',
  leading: '--export-leading',
  labelPadX: '--export-label-pad-x',
  labelPadY: '--export-label-pad-y',
  labelRoom: '--export-label-room',
};

export function readExportTokens(root: HTMLElement = document.documentElement): ExportTokens {
  const style = getComputedStyle(root);
  const out = {} as Record<keyof ExportTokens, number>;
  for (const key of Object.keys(EXPORT_TOKEN_NAMES) as Array<keyof ExportTokens>) {
    const value = Number.parseFloat(style.getPropertyValue(EXPORT_TOKEN_NAMES[key]));
    if (!Number.isFinite(value)) throw new Error(`The picture sizes are missing (${EXPORT_TOKEN_NAMES[key]}).`);
    out[key] = value;
  }
  return out;
}

export interface Appearance {
  hidden: ReadonlySet<string>;
  selected: string | null;
}

export interface LoadResult {
  found: string[];
  missing: string[];
  triangles: number;
}

export interface ProjectedPoint {
  id: string;
  /** A visible point of the structure (its center when that can be seen), in CSS pixels. */
  x: number;
  y: number;
  /** True when no part of it can be seen from the camera: other structures are in front of it. */
  behind: boolean;
}

export interface ExportResult {
  blob: Blob;
  /** Labels asked for that found no room in the picture, so the student is told which names are missing. */
  leftOut: string[];
  /** Labels drawn marked "(behind)": their structure is hidden behind others from this side. */
  behind: string[];
}

export interface ExportRequest {
  size: ExportSize;
  transparent: boolean;
  title: string;
  credit: string;
  /** The labels to draw: structure ids with their official names. */
  labels: ReadonlyArray<{ id: string; text: string }>;
}

export interface LabScene {
  /** Loads one model file, or several that share one coordinate frame (the whole-body view), as one model. */
  load(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null>;
  /** Adds more model files to the loaded view (the whole body's deeper layers); null if a newer load replaced it. */
  add(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null>;
  /** Removes the shown model at once and drops any download still in flight (a system change calls this first). */
  clear(): void;
  setAppearance(appearance: Appearance): void;
  setColors(colors: LabColors): void;
  /** The quiz uses nearest-hit picking so earlier answers do not bias later taps. */
  pick(clientX: number, clientY: number, preferSelected?: boolean): string | null;
  project(ids: readonly string[]): ProjectedPoint[];
  /** The visible model's box on screen, in CSS pixels, or null when nothing is in front of the camera. */
  extent(): Rect | null;
  orbit(yaw: number, pitch: number): void;
  zoom(factor: number): void;
  resetView(): void;
  exportPicture(request: ExportRequest): Promise<ExportResult>;
  dispose(): void;
}

interface Options {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  colors: LabColors;
  /** Called after every frame the scene draws, so the labels can follow the camera. */
  onRender: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
/** How long the camera must be still before the lab checks which labeled structures it can see. */
const VISIBILITY_IDLE_MS = 120;
/** The ID picture's size: about this many pixels, whatever the view's size (enough to find small visible parts). */
const ID_PICTURE_PIXELS = 360_000;

export function createLabScene({ canvas, reducedMotion, colors: initialColors, onRender }: Options): LabScene {
  let colors = initialColors;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color(0, 0, 0), 0); // transparent: the canvas's own bg-page shows through
  // three's constructor sizes the canvas with inline styles; remove them so the page's CSS controls the layout.
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  scene.add(camera);
  // Less even light than before (ambient 1.4, key 1.8), so surfaces turned away read darker and shapes stand apart;
  // a surface facing the key light still shows its token color (ambient + key ≈ π, Lambert's 1/π).
  scene.add(new THREE.AmbientLight(undefined, 0.85));
  const key = new THREE.DirectionalLight(undefined, 2.3);
  key.position.set(0.6, 0.8, 1);
  camera.add(key); // the light moves with the camera, so the side facing the student is always lit

  let needsRender = true;
  // Event handlers can wake the scheduler without keeping a WebGL loop alive while idle.
  let scheduleFrame: () => void = () => {};
  let scheduleVisibility: () => void = () => {};
  // Which labeled structures the camera can see is worked out from an ID picture once the camera has been still for
  // VISIBILITY_IDLE_MS (and after any change to what is shown), not on every frame.
  let visibilityDirty = true;
  let lastMove = 0;
  let labelIds: string[] = [];
  let visibility = new Map<string, { behind: boolean; world: THREE.Vector3 }>();
  const requestRender = () => {
    needsRender = true;
    scheduleFrame();
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.12;
  // Panning is off: it can only be done by right-drag or a two-finger drag, and the lab offers no keyboard or tap
  // alternative for it (AGENTS.md: every dragging gesture needs one). Rotate, zoom and reset all have buttons and keys.
  controls.enablePan = false;
  const onCameraChange = () => {
    lastMove = performance.now();
    visibilityDirty = true;
    requestRender();
    scheduleVisibility();
  };
  controls.addEventListener('change', onCameraChange);

  let root: THREE.Object3D | null = null;
  let meshesById = new Map<string, THREE.Mesh[]>();
  let order: string[] = [];
  let centers = new Map<string, THREE.Vector3>();
  let boxes = new Map<string, THREE.Box3>();
  let unlabeled: THREE.Mesh[] = [];
  let appearance: Appearance = { hidden: new Set(), selected: null };
  const home = { position: new THREE.Vector3(0, 0, 5), target: new THREE.Vector3() };
  let loadId = 0;

  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || width;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    visibilityDirty = true;
    requestRender();
  };
  // OrbitControls.update() returns true while damping still moves the camera (three.js r187).
  // Only those moving frames are repeated. Camera changes reset a single delayed visibility check.
  const tick = (): boolean => {
    const moving = controls.enableDamping ? controls.update() : false;
    if (visibilityDirty && root) {
      // Both timestamps use performance.now(). A delayed frame that fires early
      // must re-arm the visibility check rather than leaving stale occlusion labels.
      const remaining = remainingIdleDelay(performance.now(), lastMove, VISIBILITY_IDLE_MS);
      if (remaining > 0) {
        if (labelIds.length > 0) scheduler.afterIdle(remaining);
      } else {
        visibilityDirty = false;
        if (labelIds.length > 0) {
          const w = canvas.clientWidth || 1;
          const h = canvas.clientHeight || 1;
          visibility = visibilityFor(camera, labelIds, w, h);
          needsRender = true; // redraw so label anchors and behind marks refresh
        } else {
          visibility = new Map();
        }
      }
    }
    if (needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
      onRender();
    }
    return moving;
  };
  const scheduler = createDemandFrameScheduler(tick);
  scheduleFrame = scheduler.request;
  scheduleVisibility = () => {
    if (root && labelIds.length > 0) scheduler.afterIdle(VISIBILITY_IDLE_MS);
  };

  resize(); // schedules one initial frame
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  function disposeModel() {
    if (!root) return;
    scene.remove(root);
    disposeAnatomyMeshResources(root);
    root = null;
    meshesById = new Map();
    order = [];
    centers = new Map();
    boxes = new Map();
    unlabeled = [];
    visibility = new Map();
    visibilityDirty = true;
    const oldIdMaterials = idMaterials;
    idMaterials = [];
    disposeAnatomyMaterials(oldIdMaterials);
  }

  function applyAppearance() {
    const { hidden, selected } = appearance;
    const highlighted = visibleSelection(selected, hidden);
    order.forEach((id, index) => {
      const isSelected = id === highlighted;
      const dim = highlighted !== null && !isSelected;
      const color = isSelected ? colors.modelSelected : index % 2 === 0 ? colors.model : colors.modelAlt;
      for (const mesh of meshesById.get(id) ?? []) {
        mesh.visible = !hidden.has(id);
        const material = mesh.material as THREE.MeshLambertMaterial;
        material.color.set(color);
        material.transparent = dim;
        material.opacity = dim ? colors.dimAlpha : 1;
        material.depthWrite = !dim;
        material.needsUpdate = true;
        mesh.renderOrder = dim ? 1 : 0;
      }
    });
    for (const mesh of unlabeled) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.color.set(colors.model);
      material.transparent = highlighted !== null;
      material.opacity = highlighted !== null ? colors.dimAlpha : 1;
      material.depthWrite = highlighted === null;
      material.needsUpdate = true;
    }
    visibilityDirty = true;
    requestRender();
  }

  // ── The ID picture ─────────────────────────────────────────────────────────────────────────────────────────────
  // Every structure drawn flat in its own color (encodeId), into a small offscreen target without antialiasing, so
  // each pixel says which structure is nearest the camera there. The selected structure is drawn over the others, as
  // the student sees it through the faded ones. Colors are set as linear values and a render target gets no color
  // conversion, so the bytes read back are exactly the codes written.
  let idMaterials: THREE.MeshBasicMaterial[] = [];
  const nothing = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  const idTarget = new THREE.WebGLRenderTarget(1, 1);

  function idMaterialFor(index: number): THREE.MeshBasicMaterial {
    let material = idMaterials[index];
    if (!material) {
      const [r, g, b] = encodeId(index);
      material = new THREE.MeshBasicMaterial();
      material.color.setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
      idMaterials[index] = material;
    }
    return material;
  }

  function renderIds(cam: THREE.Camera, width: number, height: number, into: THREE.WebGLRenderer): Uint8Array {
    // Prepare allocations and renderer state before changing any visible mesh.
    // WebGL failures in setup, rendering, or pixel readback must never leave
    // the flat ID-pass materials attached to the student's actual 3D model.
    const pixels = new Uint8Array(width * height * 4);
    const clear = into.getClearColor(new THREE.Color());
    const clearAlpha = into.getClearAlpha();
    const highlighted = visibleSelection(appearance.selected, appearance.hidden);

    return withTemporaryMeshAppearance(
      (remember) => {
        order.forEach((id, index) => {
          const isSelected = id === highlighted;
          for (const mesh of meshesById.get(id) ?? []) {
            remember(mesh);
            const material = idMaterialFor(index);
            material.depthTest = !isSelected;
            mesh.material = material;
            mesh.renderOrder = isSelected ? 10 : 0;
          }
        });
        for (const mesh of unlabeled) {
          remember(mesh);
          mesh.material = nothing;
        }
      },
      () => {
        try {
          idTarget.setSize(width, height);
          into.setRenderTarget(idTarget);
          into.setClearColor(new THREE.Color(0, 0, 0), 1);
          into.clear();
          into.render(scene, cam);
          into.readRenderTargetPixels(idTarget, 0, 0, width, height, pixels);
        } finally {
          // Attempt both renderer-state resets even if one throws. The outer
          // material guard then restores all real meshes regardless.
          try {
            into.setRenderTarget(null);
          } finally {
            into.setClearColor(clear, clearAlpha);
          }
        }
        return pixels;
      },
    );
  }

  /**
   * For each id: whether any of it can be seen from `cam`, and a world point for its label's line: the center when
   * visible there, else a visible point near the middle of what can be seen (placed at the center's depth, so it
   * projects to that pixel and follows the camera closely until the next check).
   */
  function visibilityFor(cam: THREE.Camera, ids: readonly string[], cssWidth: number, cssHeight: number, into = renderer) {
    const k = Math.min(1, ID_PICTURE_PIXELS / Math.max(1, cssWidth * cssHeight)) ** 0.5;
    const w = Math.max(1, Math.round(cssWidth * k));
    const h = Math.max(1, Math.round(cssHeight * k));
    cam.updateMatrixWorld();
    const targets = new Map<string, VisibilityTarget>();
    const depth = new Map<string, number>();
    for (const id of ids) {
      const center = centers.get(id);
      const index = order.indexOf(id);
      if (!center || index < 0 || appearance.hidden.has(id)) continue;
      const p = center.clone().project(cam);
      depth.set(id, p.z);
      targets.set(id, { index, x: ((p.x + 1) / 2) * w - 0.5, y: ((1 - p.y) / 2) * h - 0.5 });
    }
    const out = new Map<string, { behind: boolean; world: THREE.Vector3 }>();
    if (targets.size === 0) return out;
    const found = findVisibleAnchors(renderIds(cam, w, h, into), w, h, targets);
    for (const [id, anchor] of found) {
      const ndc = new THREE.Vector3(((anchor.x + 0.5) / w) * 2 - 1, 1 - ((anchor.y + 0.5) / h) * 2, depth.get(id)!);
      out.set(id, { behind: !anchor.visible, world: anchor.visible ? ndc.unproject(cam) : centers.get(id)!.clone() });
    }
    return out;
  }

  function frame() {
    const box = new THREE.Box3();
    for (const [id, meshes] of meshesById) {
      if (appearance.hidden.has(id)) continue;
      for (const mesh of meshes) box.expandByObject(mesh);
    }
    if (box.isEmpty() && root) box.setFromObject(root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = fitDistance(box.getSize(new THREE.Vector3()), camera.fov, camera.aspect);
    // glTF's convention: the front of an asset faces +Z, with +Y up. The lab starts with a front view.
    const center = box.getCenter(new THREE.Vector3());
    home.target.copy(center);
    home.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    camera.near = Math.max(distance / 200, 1e-3);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.minDistance = sphere.radius * 0.25;
    controls.maxDistance = distance * 6;
  }

  function resetView() {
    camera.position.copy(home.position);
    controls.target.copy(home.target);
    camera.up.copy(UP);
    controls.update();
    requestRender();
  }

  async function fetchGroup(urls: string | readonly string[]): Promise<THREE.Group> {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // Repeated shared GLB URLs must not trigger a second physical decode.
    const list = uniqueAnatomyModelUrls(urls);
    // A failed file cannot leave earlier or later decoded meshes in memory.
    // Scene.add has not run yet, so failed initial loads must release all parts.
    const scenes = await loadModelsOrDispose(
      list.map((url) => () => loader.loadAsync(url).then((gltf) => gltf.scene)),
      disposeGroup,
    );
    const group = new THREE.Group();
    for (const part of scenes) group.add(part);
    return group;
  }

  function disposeGroup(group: THREE.Object3D) {
    disposeAnatomyMeshResources(group);
  }

  /** Takes a fetched group into the view: `replace` makes it the whole model, otherwise it joins the current one. */
  function integrate(group: THREE.Group, ids: readonly string[], replace: boolean): LoadResult {
    if (replace || !root) {
      disposeModel();
      root = group;
      scene.add(root);
    } else {
      root.add(group);
    }
    group.updateMatrixWorld(true);
    const { touched, triangles } = indexAnatomyGroup(group, ids, meshesById, unlabeled);
    // An ID already found in an earlier GLB is neither newly added nor missing
    // when another file contributes geometry to the same structure.
    const { added, missing } = summarizeIndexedAnatomyIds(ids, order, meshesById);
    for (const id of missing) if (!order.includes(id)) meshesById.delete(id);
    order = [...order, ...added];
    // Additional GLBs can expand a previously indexed structure's geometry.
    for (const id of touched) {
      const box = new THREE.Box3();
      for (const mesh of meshesById.get(id)!) box.expandByObject(mesh);
      centers.set(id, box.getCenter(new THREE.Vector3()));
      boxes.set(id, box);
    }
    visibilityDirty = true;
    return { found: added, missing, triangles: Math.round(triangles) };
  }

  async function load(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null> {
    const myLoad = ++loadId;
    const group = await fetchGroup(urls);
    if (myLoad !== loadId) {
      // A newer system was picked while this one downloaded: throw this one away.
      disposeGroup(group);
      return null;
    }
    const result = integrate(group, ids, true);
    // Keep initial-load order unique as well. integrate() already deduplicates
    // its result, but reassigning from raw ids here would undo that guarantee.
    order = [...new Set(ids)].filter((id) => (meshesById.get(id)?.length ?? 0) > 0);
    appearance = { hidden: new Set(), selected: null };
    applyAppearance();
    frame();
    resetView();
    return result;
  }

  async function add(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null> {
    const myLoad = loadId;
    const group = await fetchGroup(urls);
    if (myLoad !== loadId || !root) {
      disposeGroup(group);
      return null;
    }
    const result = integrate(group, ids, false);
    applyAppearance();
    requestRender();
    return result;
  }

  const raycaster = new THREE.Raycaster();

  function pick(clientX: number, clientY: number, preferSelected = true): string | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const candidates = order.flatMap((id) => (appearance.hidden.has(id) ? [] : meshesById.get(id)!));
    const hits = raycaster.intersectObjects(candidates, false)
      .map((hit) => hit.object.userData['structureId'])
      .filter((id): id is string => typeof id === 'string');
    // The selected opaque mesh may be behind another translucent mesh.
    // Only prefer it if the ray actually intersects it; otherwise pick the nearest mesh.
    const selected = preferSelected ? visibleSelection(appearance.selected, appearance.hidden) : null;
    return pickedStructure(hits, selected);
  }

  function projectWith(
    cam: THREE.Camera,
    ids: readonly string[],
    width: number,
    height: number,
    seen: ReadonlyMap<string, { behind: boolean; world: THREE.Vector3 }> = visibility,
  ): ProjectedPoint[] {
    const out: ProjectedPoint[] = [];
    for (const id of ids) {
      const center = centers.get(id);
      if (!center || appearance.hidden.has(id)) continue;
      const known = seen.get(id);
      const p = (known?.world ?? center).clone().project(cam);
      if (p.z < -1 || p.z > 1) continue; // behind the camera or past its far plane
      out.push({ id, x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height, behind: known?.behind ?? false });
    }
    return out;
  }

  function extentWith(cam: THREE.Camera, width: number, height: number): Rect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const corner = new THREE.Vector3();
    for (const [id, box] of boxes) {
      if (appearance.hidden.has(id)) continue;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        if (corner.z < -1 || corner.z > 1) continue;
        const x = ((corner.x + 1) / 2) * width;
        const y = ((1 - corner.y) / 2) * height;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }

  function orbit(yaw: number, pitch: number) {
    const offset = camera.position.clone().sub(controls.target);
    if (yaw) offset.applyAxisAngle(UP, yaw);
    if (pitch) {
      const axis = offset.clone().cross(UP);
      if (axis.lengthSq() > 1e-9) offset.applyAxisAngle(axis.normalize(), pitch);
    }
    camera.position.copy(controls.target).add(offset);
    controls.update(); // keeps the camera off the poles, like dragging does
    requestRender();
  }

  function zoom(factor: number) {
    const offset = camera.position.clone().sub(controls.target);
    const length = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor));
    camera.position.copy(controls.target).add(offset.setLength(length));
    controls.update();
    requestRender();
  }

  async function exportPicture(request: ExportRequest): Promise<ExportResult> {
    const { width, height } = EXPORT_SIZES[request.size];
    // Type is set for the picture's shorter side (1080 in every size), so a wide picture's labels are no taller than
    // a phone picture's and as many fit down its side.
    const tk = readExportTokens();
    const scale = Math.min(width, height) / tk.reference;
    const titleSize = Math.round(tk.title * scale);
    const labelSize = Math.round(tk.label * scale);
    const creditSize = Math.round(tk.credit * scale);
    const pad = Math.round(tk.pad * scale);
    const font = colors.font;
    if (document.fonts) {
      await Promise.all([
        document.fonts.load(`700 ${titleSize}px ${font}`),
        document.fonts.load(`400 ${labelSize}px ${font}`),
      ]);
    }

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the picture.');

    // The credit's lines decide how much room the bottom band needs.
    ctx.font = `400 ${creditSize}px ${font}`;
    const creditLines = wrapText(request.credit, width - 2 * pad, (s) => ctx.measureText(s).width);
    const creditLineHeight = Math.round(creditSize * tk.leading);
    const top = pad + Math.round(titleSize * tk.leading) + Math.round(pad / 2);
    const bottom = pad + creditLines.length * creditLineHeight + Math.round(pad / 2);
    const viewHeight = Math.max(1, height - top - bottom);

    // Each label's lines, wrapped to a column's width, with "(behind)" for a structure hidden from this side.
    ctx.font = `400 ${labelSize}px ${font}`;
    const measure = (s: string) => ctx.measureText(s).width;
    const padX = Math.round(labelSize * tk.labelPadX);
    const lineHeight = Math.round(labelSize * tk.leading);
    const boxPadY = Math.round(labelSize * tk.labelPadY);
    const offset = Math.round(tk.offset * scale);
    const margin = Math.round(pad / 2);
    const maxText = Math.round(width * tk.labelRoom);
    const names = new Map(request.labels.map((label) => [label.id, label.text]));
    const ids = [...names.keys()];

    // Same camera position and angle as the student's; the crop is fitted to the visible model and the label columns.
    const screenW = canvas.clientWidth || 1;
    const screenH = canvas.clientHeight || 1;
    const onScreen = visibilityFor(camera, ids, screenW, screenH);
    const screenExtent = extentWith(camera, screenW, screenH);
    const mid = screenExtent ? screenExtent.x + screenExtent.width / 2 : screenW / 2;
    const roughWidths = projectWith(camera, ids, screenW, screenH, onScreen).map((point) => ({
      x: point.x,
      width: labelLines(names.get(point.id)!, point.behind, maxText, measure).width + 2 * padX,
    }));
    const room = labelRoomFor(roughWidths, mid, width, offset + margin);
    const region = exportRegion(screenExtent, { width: screenW, height: screenH }, width / viewHeight, room);
    const shot = camera.clone();
    shot.setViewOffset(screenW, screenH, region.x, region.y, region.width, region.height);
    shot.updateProjectionMatrix();
    shot.updateMatrixWorld();

    // Which labeled structures this picture's camera sees, worked out again at the picture's own crop.
    const seen = visibilityFor(shot, ids, width, viewHeight);
    const lines = new Map<string, ReturnType<typeof labelLines>>();
    const anchors = projectWith(shot, ids, width, viewHeight, seen).map((point) => {
      const text = labelLines(names.get(point.id)!, point.behind, maxText, measure);
      lines.set(point.id, text);
      const count = text.lines.length + (text.mark === 'line' ? 1 : 0);
      return { ...point, width: Math.ceil(text.width) + 2 * padX, height: count * lineHeight + 2 * boxPadY };
    });
    const model = extentWith(shot, width, viewHeight);
    const layout = placeLabels(anchors, {
      width,
      height: viewHeight,
      margin,
      offset,
      gap: Math.round(tk.gap * scale),
      ...(model ? { columns: { left: model.x, right: model.x + model.width } } : {}),
    });
    const projected = new Set(anchors.map((a) => a.id));
    const leftOut = [...ids.filter((id) => !projected.has(id) && !appearance.hidden.has(id)), ...layout.leftOut];

    // Re-render the student's view at the picture's size, in a renderer of its own (so the page's canvas never
    // flickers).
    const glCanvas = document.createElement('canvas');
    const offscreen = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    try {
      offscreen.setPixelRatio(1);
      offscreen.setSize(width, viewHeight, false);
      offscreen.setClearColor(new THREE.Color(0, 0, 0), 0);
      offscreen.render(scene, shot);

      if (!request.transparent) {
        ctx.fillStyle = colors.page;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(glCanvas, 0, top);

      // Labels with leader lines, laid out the same way as on screen. A label whose structure is hidden behind others
      // from this side is marked in words, "(behind)", and with a dashed line, box and hollow dot, never by color alone.
      ctx.font = `400 ${labelSize}px ${font}`;
      ctx.lineWidth = Math.max(2, Math.round(tk.line * scale));
      ctx.textBaseline = 'middle';
      const dash = [Math.round(tk.dash * scale), Math.round(tk.dashGap * scale)];
      const y0 = top;
      for (const label of layout.placed) {
        const text = lines.get(label.id)!;
        ctx.setLineDash(label.behind ? dash : []);
        ctx.strokeStyle = label.behind ? colors.inkSoft : colors.ink;
        ctx.beginPath();
        ctx.moveTo(label.anchorX, label.anchorY + y0);
        ctx.lineTo(label.lineX, label.lineY + y0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(label.anchorX, label.anchorY + y0, Math.max(3, tk.dot * scale), 0, Math.PI * 2);
        if (label.behind) {
          ctx.fillStyle = colors.page;
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = colors.ink;
          ctx.fill();
        }
        ctx.fillStyle = colors.page;
        ctx.strokeStyle = label.behind ? colors.inkSoft : colors.line;
        ctx.beginPath();
        ctx.roundRect(label.x, label.y + y0, label.width, label.height, Math.round(tk.radius * scale));
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        text.lines.forEach((line, i) => {
          const y = label.y + y0 + boxPadY + i * lineHeight + lineHeight / 2;
          ctx.fillStyle = colors.ink;
          ctx.fillText(line, label.x + padX, y);
          if (i === text.lines.length - 1 && text.mark === 'inline') {
            ctx.fillStyle = colors.inkSoft;
            ctx.fillText(BEHIND_MARK, label.x + padX + measure(`${line} `), y);
          }
        });
        if (text.mark === 'line') {
          ctx.fillStyle = colors.inkSoft;
          ctx.fillText(BEHIND_MARK, label.x + padX, label.y + y0 + boxPadY + text.lines.length * lineHeight + lineHeight / 2);
        }
      }

      // The system's title at the top and the credit at the bottom.
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.ink;
      ctx.font = `700 ${titleSize}px ${font}`;
      ctx.fillText(request.title, pad, pad + titleSize);
      ctx.fillStyle = colors.inkSoft;
      ctx.font = `400 ${creditSize}px ${font}`;
      creditLines.forEach((line, i) => {
        ctx.fillText(line, pad, height - pad - (creditLines.length - 1 - i) * creditLineHeight);
      });
    } finally {
      offscreen.dispose();
      offscreen.forceContextLoss();
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('This browser could not save the picture.'))), 'image/png');
    });
    return { blob, leftOut, behind: layout.placed.filter((label) => label.behind).map((label) => label.id) };
  }

  return {
    load,
    add,
    setAppearance(next) {
      appearance = next;
      applyAppearance();
    },
    setColors(next) {
      colors = next;
      applyAppearance();
    },
    pick,
    project(ids) {
      if (ids.length !== labelIds.length || ids.some((id, i) => id !== labelIds[i])) {
        labelIds = [...ids];
        visibilityDirty = true;
        requestRender();
        scheduleVisibility();
      }
      return projectWith(camera, ids, canvas.clientWidth, canvas.clientHeight);
    },
    extent() {
      return extentWith(camera, canvas.clientWidth, canvas.clientHeight);
    },
    orbit,
    zoom,
    resetView,
    exportPicture,
    clear() {
      loadId++;
      disposeModel();
      appearance = { hidden: new Set(), selected: null };
      requestRender();
    },
    dispose() {
      loadId++;
      scheduler.dispose();
      observer.disconnect();
      controls.removeEventListener('change', onCameraChange);
      controls.dispose();
      disposeModel();
      disposeAnatomyMaterials([nothing]);
      idTarget.dispose();
      renderer.dispose();
    },
  };
}
