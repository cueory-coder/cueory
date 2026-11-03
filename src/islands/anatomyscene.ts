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
import { EXPORT_SIZES, exportRegion, fitDistance, layoutLabels, wrapText, type ExportSize, type Rect } from './anatomylab';

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
  x: number;
  y: number;
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
  load(url: string, ids: readonly string[]): Promise<LoadResult | null>;
  setAppearance(appearance: Appearance): void;
  setColors(colors: LabColors): void;
  pick(clientX: number, clientY: number): string | null;
  project(ids: readonly string[]): ProjectedPoint[];
  /** The visible model's box on screen, in CSS pixels, or null when nothing is in front of the camera. */
  extent(): Rect | null;
  orbit(yaw: number, pitch: number): void;
  zoom(factor: number): void;
  resetView(): void;
  exportPicture(request: ExportRequest): Promise<Blob>;
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
  scene.add(new THREE.AmbientLight(undefined, 1.4));
  const key = new THREE.DirectionalLight(undefined, 1.8);
  key.position.set(0.6, 0.8, 1);
  camera.add(key); // the light moves with the camera, so the side facing the student is always lit

  let needsRender = true;
  let raf = 0;
  const requestRender = () => {
    needsRender = true;
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.addEventListener('change', requestRender);

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
    requestRender();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (controls.enableDamping) controls.update(); // fires 'change' while the camera is still gliding
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
    requestRender();
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

  async function load(url: string, ids: readonly string[]): Promise<LoadResult | null> {
    const myLoad = ++loadId;
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
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

  function projectWith(cam: THREE.Camera, ids: readonly string[], width: number, height: number): ProjectedPoint[] {
    const out: ProjectedPoint[] = [];
    for (const id of ids) {
      const center = centers.get(id);
      if (!center || appearance.hidden.has(id)) continue;
      const p = center.clone().project(cam);
      if (p.z < -1 || p.z > 1) continue; // behind the camera or past its far plane
      out.push({ id, x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height });
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

  async function exportPicture(request: ExportRequest): Promise<Blob> {
    const { width, height } = EXPORT_SIZES[request.size];
    const scale = width / 1080; // type sizes are set for a 1080px-wide picture
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

    // Re-render the student's current view at the picture's size, in a renderer of its own (so the page's canvas
    // never flickers), keeping at least the width the student framed.
    const glCanvas = document.createElement('canvas');
    const offscreen = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    try {
      offscreen.setPixelRatio(1);
      offscreen.setSize(width, viewHeight, false);
      offscreen.setClearColor(new THREE.Color(0, 0, 0), 0);
      // Same camera position and angle as the student's; the crop is fitted to the visible model (exportRegion).
      const screenW = canvas.clientWidth || 1;
      const screenH = canvas.clientHeight || 1;
      const region = exportRegion(extentWith(camera, screenW, screenH), { width: screenW, height: screenH }, width / viewHeight, request.labels.length > 0);
      const shot = camera.clone();
      shot.setViewOffset(screenW, screenH, region.x, region.y, region.width, region.height);
      shot.updateProjectionMatrix();
      offscreen.render(scene, shot);

      if (!request.transparent) {
        ctx.fillStyle = colors.page;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(glCanvas, 0, top);

      // Labels with leader lines, laid out the same way as on screen.
      ctx.font = `400 ${labelSize}px ${font}`;
      const padX = Math.round(labelSize * 0.5);
      const boxHeight = Math.round(labelSize * 1.5) + Math.round(labelSize * 0.3);
      const names = new Map(request.labels.map((label) => [label.id, label.text]));
      const anchors = projectWith(shot, [...names.keys()], width, viewHeight).map((point) => ({
        ...point,
        width: Math.ceil(ctx.measureText(names.get(point.id)!).width) + 2 * padX,
        height: boxHeight,
      }));
      const model = extentWith(shot, width, viewHeight);
      const placed = layoutLabels(anchors, {
        width,
        height: viewHeight,
        margin: pad / 2,
        offset: Math.round(40 * scale),
        gap: Math.round(8 * scale),
        ...(model ? { columns: { left: model.x, right: model.x + model.width } } : {}),
      });
      ctx.lineWidth = Math.max(2, Math.round(2 * scale));
      ctx.textBaseline = 'middle';
      for (const label of placed) {
        const y0 = top;
        ctx.strokeStyle = colors.ink;
        ctx.beginPath();
        ctx.moveTo(label.anchorX, label.anchorY + y0);
        ctx.lineTo(label.lineX, label.lineY + y0);
        ctx.stroke();
        ctx.fillStyle = colors.ink;
        ctx.beginPath();
        ctx.arc(label.anchorX, label.anchorY + y0, Math.max(3, 5 * scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.page;
        ctx.strokeStyle = colors.line;
        ctx.beginPath();
        ctx.roundRect(label.x, label.y + y0, label.width, label.height, Math.round(8 * scale));
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = colors.ink;
        ctx.fillText(names.get(label.id)!, label.x + padX, label.y + y0 + label.height / 2);
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

    return new Promise<Blob>((resolve, reject) => {
      out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('This browser could not save the picture.'))), 'image/png');
    });
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
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      disposeModel();
      renderer.dispose();
    },
  };
}
