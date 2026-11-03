/**
 * The anatomy lab's three.js side (Task 178). This module is imported only after the student taps "open the anatomy
 * lab" (a dynamic import in AnatomyLab.tsx), so nothing from three.js is in the page's first download.
 *
 * Models are .glb files compressed with meshopt (D-58), decoded on the page's own thread: MeshoptDecoder's WebAssembly
 * needs only the CSP's 'wasm-unsafe-eval' (D-49), and its worker mode (blob: workers) is never turned on.
 * Colors come from the brand tokens at runtime (getComputedStyle), so the model follows the Daytime and Evening palettes.
 */
import * as THREE from 'three';
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
  wrapText,
  type ExportSize,
  type Rect,
  type VisibilityTarget,
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
  setAppearance(appearance: Appearance): void;
  setColors(colors: LabColors): void;
  pick(clientX: number, clientY: number): string | null;
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
  let raf = 0;
  // Which labeled structures the camera can see is worked out from an ID picture once the camera has been still for
  // VISIBILITY_IDLE_MS (and after any change to what is shown), not on every frame.
  let visibilityDirty = true;
  let lastMove = 0;
  let labelIds: string[] = [];
  let visibility = new Map<string, { behind: boolean; world: THREE.Vector3 }>();
  const requestRender = () => {
    needsRender = true;
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  const onCameraChange = () => {
    lastMove = performance.now();
    visibilityDirty = true;
    requestRender();
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
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (controls.enableDamping) controls.update(); // fires 'change' while the camera is still gliding
    if (visibilityDirty && root && performance.now() - lastMove > VISIBILITY_IDLE_MS) {
      visibilityDirty = false;
      if (labelIds.length > 0) {
        const w = canvas.clientWidth || 1;
        const h = canvas.clientHeight || 1;
        visibility = visibilityFor(camera, labelIds, w, h);
        needsRender = true; // redraw, so the labels pick up the new anchors and marks
      } else {
        visibility = new Map();
      }
    }
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
    onRender();
  };
  tick();

  function disposeModel() {
    if (!root) return;
    scene.remove(root);
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of ([] as THREE.Material[]).concat(mesh.material)) material.dispose();
    });
    root = null;
    meshesById = new Map();
    order = [];
    centers = new Map();
    boxes = new Map();
    unlabeled = [];
    visibility = new Map();
    visibilityDirty = true;
    for (const material of idMaterials) material.dispose();
    idMaterials = [];
  }

  function applyAppearance() {
    const { hidden, selected } = appearance;
    order.forEach((id, index) => {
      const isSelected = id === selected;
      const dim = selected !== null && !isSelected;
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
      material.transparent = selected !== null;
      material.opacity = selected !== null ? colors.dimAlpha : 1;
      material.depthWrite = selected === null;
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
    const saved: Array<[THREE.Mesh, THREE.Material | THREE.Material[], number]> = [];
    order.forEach((id, index) => {
      const isSelected = id === appearance.selected;
      for (const mesh of meshesById.get(id) ?? []) {
        saved.push([mesh, mesh.material, mesh.renderOrder]);
        const material = idMaterialFor(index);
        material.depthTest = !isSelected;
        mesh.material = material;
        mesh.renderOrder = isSelected ? 10 : 0;
      }
    });
    for (const mesh of unlabeled) {
      saved.push([mesh, mesh.material, mesh.renderOrder]);
      mesh.material = nothing;
    }
    const pixels = new Uint8Array(width * height * 4);
    const clear = into.getClearColor(new THREE.Color());
    const clearAlpha = into.getClearAlpha();
    try {
      idTarget.setSize(width, height);
      into.setRenderTarget(idTarget);
      into.setClearColor(new THREE.Color(0, 0, 0), 1);
      into.clear();
      into.render(scene, cam);
      into.readRenderTargetPixels(idTarget, 0, 0, width, height, pixels);
    } finally {
      into.setRenderTarget(null);
      into.setClearColor(clear, clearAlpha);
      for (const [mesh, material, renderOrder] of saved) {
        mesh.material = material;
        mesh.renderOrder = renderOrder;
      }
    }
    return pixels;
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

  async function load(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null> {
    const myLoad = ++loadId;
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const list = typeof urls === 'string' ? [urls] : [...urls];
    const scenes = await Promise.all(list.map((url) => loader.loadAsync(url).then((gltf) => gltf.scene)));
    const gltf = { scene: new THREE.Group() };
    for (const part of scenes) gltf.scene.add(part);
    if (myLoad !== loadId) {
      // A newer system was picked while this one downloaded: throw this one away.
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          for (const material of ([] as THREE.Material[]).concat(mesh.material)) material.dispose();
        }
      });
      return null;
    }
    disposeModel();
    root = gltf.scene;
    root.updateMatrixWorld(true);
    const wanted = new Set(ids);
    const owner = new Map<THREE.Object3D, string>();
    root.traverse((object) => {
      const name = typeof object.userData['name'] === 'string' ? (object.userData['name'] as string) : object.name;
      if (wanted.has(name) && !meshesById.has(name)) {
        meshesById.set(name, []);
        owner.set(object, name);
      }
    });
    let triangles = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      let id: string | undefined;
      for (let at: THREE.Object3D | null = mesh; at && !id; at = at.parent) id = owner.get(at);
      for (const material of ([] as THREE.Material[]).concat(mesh.material)) material.dispose();
      if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
      mesh.material = new THREE.MeshLambertMaterial();
      const index = mesh.geometry.getIndex();
      triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
      if (id) {
        mesh.userData['structureId'] = id;
        meshesById.get(id)!.push(mesh);
      } else {
        unlabeled.push(mesh);
      }
    });
    order = ids.filter((id) => (meshesById.get(id)?.length ?? 0) > 0);
    for (const id of [...meshesById.keys()]) if (!order.includes(id)) meshesById.delete(id);
    for (const id of order) {
      const box = new THREE.Box3();
      for (const mesh of meshesById.get(id)!) box.expandByObject(mesh);
      centers.set(id, box.getCenter(new THREE.Vector3()));
      boxes.set(id, box);
    }
    scene.add(root);
    appearance = { hidden: new Set(), selected: null };
    applyAppearance();
    frame();
    resetView();
    return { found: order, missing: ids.filter((id) => !order.includes(id)), triangles: Math.round(triangles) };
  }

  const raycaster = new THREE.Raycaster();

  function pick(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const candidates = order.flatMap((id) => (appearance.hidden.has(id) ? [] : meshesById.get(id)!));
    const hit = raycaster.intersectObjects(candidates, false)[0];
    return hit ? ((hit.object.userData['structureId'] as string | undefined) ?? null) : null;
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
    const scale = Math.min(width, height) / 1080;
    const titleSize = Math.round(44 * scale);
    const labelSize = Math.round(30 * scale);
    const creditSize = Math.round(22 * scale);
    const pad = Math.round(48 * scale);
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
    const creditLineHeight = Math.round(creditSize * 1.5);
    const top = pad + Math.round(titleSize * 1.5) + Math.round(pad / 2);
    const bottom = pad + creditLines.length * creditLineHeight + Math.round(pad / 2);
    const viewHeight = Math.max(1, height - top - bottom);

    // Each label's lines, wrapped to a column's width, with "(behind)" for a structure hidden from this side.
    ctx.font = `400 ${labelSize}px ${font}`;
    const measure = (s: string) => ctx.measureText(s).width;
    const padX = Math.round(labelSize * 0.5);
    const lineHeight = Math.round(labelSize * 1.5);
    const boxPadY = Math.round(labelSize * 0.15);
    const offset = Math.round(40 * scale);
    const margin = Math.round(pad / 2);
    const maxText = Math.round(width * 0.26);
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
      gap: Math.round(10 * scale),
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
      ctx.lineWidth = Math.max(2, Math.round(2 * scale));
      ctx.textBaseline = 'middle';
      const dash = [Math.round(8 * scale), Math.round(6 * scale)];
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
        ctx.arc(label.anchorX, label.anchorY + y0, Math.max(3, 5 * scale), 0, Math.PI * 2);
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
        ctx.roundRect(label.x, label.y + y0, label.width, label.height, Math.round(8 * scale));
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
    dispose() {
      loadId++;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.removeEventListener('change', onCameraChange);
      controls.dispose();
      disposeModel();
      nothing.dispose();
      idTarget.dispose();
      renderer.dispose();
    },
  };
}
