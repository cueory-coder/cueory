import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { LAYERS, checkModelBudget, toggleLayer, type Layer } from './bodyviewer-logic';

interface Props {
  /** Attribution text shown beneath the viewer. Names BodyParts3D when the real model is loaded. */
  creditText?: string;
}

type ViewerState = 'cover' | 'loading' | 'ready' | 'error';

const LAYER_LABELS: Record<Layer, string> = { skin: 'Skin', muscle: 'Muscle', bone: 'Bone' };

// Token hex values for Three.js scene backgrounds (mirrors tokens.css; must stay in sync).
const BG_LIGHT = 0xf9f5ef; // --color-page daytime  (Ivory)
const BG_DARK  = 0x1c1917; // --color-page evening  (Charcoal)

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lazy 3D body viewer (D-83). Nothing loads from three.js before the student taps "open the 3D view".
 * On tap, three.js is dynamically imported and a placeholder model (simple shapes built in code,
 * labeled as a placeholder) is rendered. The real model is BodyParts3D (D-80), added later.
 * Rendered client:only.
 */
export default function BodyViewer({ creditText }: Props) {
  const [state, setState] = useState<ViewerState>('cover');
  const [error, setError] = useState('');
  const [visible, setVisible] = useState<ReadonlySet<Layer>>(new Set(LAYERS));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const groupsRef = useRef<Record<Layer, { visible: boolean }>>({ skin: { visible: true }, muscle: { visible: true }, bone: { visible: true } });
  const cleanupRef = useRef<(() => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const coverBtnRef = useRef<HTMLButtonElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const open = useCallback(async () => {
    setState('loading');
    try {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      // Wait one animation frame so React can commit the canvas to the DOM.
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      const canvas = canvasRef.current;
      if (!canvas) { setState('error'); setError('Canvas element not ready.'); return; }

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // THREE's constructor calls setSize(300, 150, true) on the canvas, setting inline styles
      // that override CSS min-height. Remove them so CSS controls the layout.
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');

      const scene = new THREE.Scene();

      // Dark-mode aware background: read theme at open time; re-read on color-scheme change.
      const applyBg = () => {
        const dark = document.documentElement.dataset['theme'] === 'dark' ||
          (document.documentElement.dataset['theme'] !== 'light' && prefersDark());
        scene.background = new THREE.Color(dark ? BG_DARK : BG_LIGHT);
        needsRender = true;
      };
      applyBg();

      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 1.2, 3.5);

      const controls = new OrbitControls(camera, canvas);
      // Damping smooths mouse input but plays poorly under reduced-motion.
      controls.enableDamping = !prefersReducedMotion();
      controls.dampingFactor = 0.1;
      controls.minDistance = 1;
      controls.maxDistance = 8;
      controls.target.set(0, 0.8, 0);
      controls.update();

      // Ambient + directional light.
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(2, 4, 3);
      scene.add(dir);

      // Placeholder model: simple shapes grouped by layer.
      const groupObjects: Record<Layer, THREE.Group> = {
        bone: new THREE.Group(),
        muscle: new THREE.Group(),
        skin: new THREE.Group(),
      };

      // Brand-token colours for the placeholder (not anatomy colours — these are design-system tokens).
      const boneMat   = new THREE.MeshLambertMaterial({ color: 0xeadccf }); // Linen  (--color-surface)
      const muscleMat = new THREE.MeshLambertMaterial({ color: 0xd3b7a1 }); // Taupe  (--color-soft)
      const skinMat   = new THREE.MeshLambertMaterial({ color: 0xcbb8a4, transparent: true, opacity: 0.55 }); // Sand

      // Bone: spine, skull, arms, legs.
      const addBone = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, boneMat);
        m.position.set(x, y, z);
        groupObjects.bone.add(m);
      };
      addBone(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), 0, 0.8, 0);
      addBone(new THREE.SphereGeometry(0.22, 12, 8), 0, 1.85, 0);
      addBone(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), -0.42, 0.95, 0);
      addBone(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8),  0.42, 0.95, 0);
      addBone(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), -0.2, -0.25, 0);
      addBone(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8),  0.2, -0.25, 0);

      // Muscle.
      const addMuscle = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, muscleMat);
        m.position.set(x, y, z);
        groupObjects.muscle.add(m);
      };
      addMuscle(new THREE.CylinderGeometry(0.22, 0.26, 1.5, 12), 0, 0.8, 0);
      addMuscle(new THREE.CylinderGeometry(0.10, 0.10, 0.85, 10), -0.42, 0.95, 0);
      addMuscle(new THREE.CylinderGeometry(0.10, 0.10, 0.85, 10),  0.42, 0.95, 0);
      addMuscle(new THREE.CylinderGeometry(0.13, 0.15, 1.0, 10), -0.2, -0.25, 0);
      addMuscle(new THREE.CylinderGeometry(0.13, 0.15, 1.0, 10),  0.2, -0.25, 0);

      // Skin.
      const addSkin = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, skinMat);
        m.position.set(x, y, z);
        groupObjects.skin.add(m);
      };
      addSkin(new THREE.CylinderGeometry(0.32, 0.30, 1.55, 16), 0, 0.8, 0);
      addSkin(new THREE.SphereGeometry(0.28, 14, 10), 0, 1.85, 0);
      addSkin(new THREE.CylinderGeometry(0.13, 0.12, 0.9, 12), -0.48, 0.95, 0);
      addSkin(new THREE.CylinderGeometry(0.13, 0.12, 0.9, 12),  0.48, 0.95, 0);
      addSkin(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 12), -0.22, -0.25, 0);
      addSkin(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 12),  0.22, -0.25, 0);

      for (const layer of LAYERS) scene.add(groupObjects[layer]);

      // Store group refs for layer toggling.
      for (const layer of LAYERS) {
        groupsRef.current[layer] = groupObjects[layer];
      }

      // Triangle budget (placeholder is always within limit; this confirms the check runs).
      let totalTriangles = 0;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          totalTriangles += (obj.geometry.index
            ? obj.geometry.index.count / 3
            : obj.geometry.attributes['position']!.count / 3);
        }
      });
      const budgetError = checkModelBudget(0, Math.round(totalTriangles));
      if (budgetError) { setError(budgetError); setState('error'); renderer.dispose(); return; }

      const resize = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight || w;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        needsRender = true;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      // ── On-demand render loop ───────────────────────────────────────────────
      // Render only when the scene has changed (controls moved, layer toggled, resize, theme change).
      // This avoids draining the battery at 60 fps while the viewer is idle.

      let needsRender = true;
      let raf = 0;

      const requestRender = () => { needsRender = true; };
      requestRenderRef.current = requestRender;

      controls.addEventListener('change', requestRender);

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (!needsRender) return;
        needsRender = false;
        if (controls.enableDamping) controls.update();
        renderer.render(scene, camera);
      };
      tick();

      // Keyboard controls (arrow keys to orbit, +/- to zoom).
      const onKey = (e: KeyboardEvent) => {
        const STEP = Math.PI / 36; // 5°
        const ZOOM = 0.3;
        const dir = camera.position.clone().sub(controls.target);
        switch (e.key) {
          case 'ArrowLeft':  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0),  STEP); break;
          case 'ArrowRight': dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -STEP); break;
          case 'ArrowUp':    dir.applyAxisAngle(dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), -STEP); break;
          case 'ArrowDown':  dir.applyAxisAngle(dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(),  STEP); break;
          case '+': case '=': dir.multiplyScalar(1 - ZOOM / dir.length()); break;
          case '-': case '_': dir.multiplyScalar(1 + ZOOM / dir.length()); break;
          default: return;
        }
        e.preventDefault();
        camera.position.copy(controls.target.clone().add(dir));
        controls.update();
        requestRender();
      };
      canvas.addEventListener('keydown', onKey);

      // Color-scheme changes while the viewer is open.
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyBg);

      cleanupRef.current = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.removeEventListener('change', requestRender);
        canvas.removeEventListener('keydown', onKey);
        mq.removeEventListener('change', applyBg);
        controls.dispose();
        renderer.dispose();
        requestRenderRef.current = null;
      };

      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the 3D viewer.');
      setState('error');
    }
  }, []);

  // Apply layer visibility whenever the visible set changes; request a redraw.
  useEffect(() => {
    if (state !== 'ready') return;
    for (const layer of LAYERS) {
      const group = groupsRef.current[layer] as unknown as { visible: boolean } | undefined;
      if (group) group.visible = visible.has(layer);
    }
    requestRenderRef.current?.();
  }, [visible, state]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  // Focus the canvas after the viewer transitions to ready so keyboard controls are immediately usable.
  useEffect(() => {
    if (state === 'ready') canvasRef.current?.focus();
  }, [state]);

  if (state === 'cover') {
    return (
      <div className="space-y-4">
        <button
          ref={coverBtnRef}
          type="button"
          onClick={open}
          className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-line bg-soft px-5 py-3 text-ink hover:bg-button-hover hover:text-on-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          aria-label="open the 3D view"
        >
          {/* Simple cube icon representing a 3D model */}
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3L21 8.5V15.5L12 21L3 15.5V8.5L12 3Z" />
            <path d="M12 3V21M3 8.5L12 14L21 8.5" />
          </svg>
          open the 3D view
        </button>
        <p className="text-sm text-ink-soft">
          Loads a placeholder 3D model.{' '}
          <a href="/privacy" className="underline">Privacy.</a>
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg bg-soft p-4 text-sm">
        <p>Could not load the 3D viewer.</p>
        {error && <p className="mt-1 text-ink-soft">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={canvasWrapRef} className="relative">
        <canvas
          ref={canvasRef}
          // tabIndex makes the canvas keyboard-focusable for arrow / zoom keys.
          tabIndex={0}
          aria-label="open the 3D view — interactive 3D body viewer"
          role="img"
          aria-describedby="body-viewer-desc"
          className="w-full rounded-lg bg-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          style={{ aspectRatio: '4/3', touchAction: 'none', minHeight: '200px' }}
        />
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-soft">
            <span className="text-sm text-ink-soft">Loading viewer…</span>
          </div>
        )}
        <p id="body-viewer-desc" className="sr-only">
          A placeholder 3D model made of simple geometric shapes. Rotate by dragging or using the
          arrow keys; zoom by scrolling, pinching, or pressing + and −. Layer buttons below show or
          hide skin, muscle and bone.
        </p>
      </div>

      {state === 'ready' && (
        <>
          <fieldset>
            <legend className="text-sm text-ink-soft">Layers</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {LAYERS.map((layer) => (
                <button
                  key={layer}
                  type="button"
                  aria-pressed={visible.has(layer)}
                  onClick={() => setVisible((v) => toggleLayer(v, layer))}
                  className="min-h-11 min-w-11 rounded-pill border border-line px-4 py-2 text-sm aria-pressed:bg-button aria-pressed:text-on-button aria-pressed:border-button"
                >
                  {LAYER_LABELS[layer]}
                </button>
              ))}
            </div>
          </fieldset>

          {creditText && (
            <p className="text-xs text-ink-soft">{creditText}</p>
          )}
        </>
      )}
    </div>
  );
}
