import { useCallback, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { LAYERS, checkModelBudget, toggleLayer, type Layer } from './bodyviewer-logic';

interface Props {
  /** Attribution text shown beneath the viewer. Names BodyParts3D when the real model is loaded. */
  creditText?: string;
}

type ViewerState = 'cover' | 'loading' | 'ready' | 'error';

const LAYER_LABELS: Record<Layer, string> = { skin: 'Skin', muscle: 'Muscle', bone: 'Bone' };

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

  const open = useCallback(async () => {
    setState('loading');
    try {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf9f5ef);

      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 1.2, 3.5);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
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

      const boneMat = new THREE.MeshLambertMaterial({ color: 0xf0e6c8 });
      const muscleMat = new THREE.MeshLambertMaterial({ color: 0xd08070 });
      const skinMat = new THREE.MeshLambertMaterial({ color: 0xf5c8a0, transparent: true, opacity: 0.55 });

      // Bone: torso spine, skull, arms, legs (cylinders + boxes).
      const addBone = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, boneMat);
        m.position.set(x, y, z);
        groupObjects.bone.add(m);
      };
      addBone(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), 0, 0.8, 0);   // spine
      addBone(new THREE.SphereGeometry(0.22, 12, 8), 0, 1.85, 0);           // skull
      addBone(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), -0.42, 0.95, 0); // left humerus
      addBone(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8),  0.42, 0.95, 0); // right humerus
      addBone(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), -0.2, -0.25, 0); // left femur
      addBone(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8),  0.2, -0.25, 0); // right femur

      // Muscle: slightly larger cylinders around the spine and limbs.
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

      // Skin: outer shell boxes.
      const addSkin = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, skinMat);
        m.position.set(x, y, z);
        groupObjects.skin.add(m);
      };
      addSkin(new THREE.CylinderGeometry(0.32, 0.30, 1.55, 16), 0, 0.8, 0);  // torso
      addSkin(new THREE.SphereGeometry(0.28, 14, 10), 0, 1.85, 0);            // head
      addSkin(new THREE.CylinderGeometry(0.13, 0.12, 0.9, 12), -0.48, 0.95, 0);
      addSkin(new THREE.CylinderGeometry(0.13, 0.12, 0.9, 12),  0.48, 0.95, 0);
      addSkin(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 12), -0.22, -0.25, 0);
      addSkin(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 12),  0.22, -0.25, 0);

      for (const layer of LAYERS) scene.add(groupObjects[layer]);

      // Store group refs for layer toggling.
      for (const layer of LAYERS) {
        groupsRef.current[layer] = groupObjects[layer];
      }

      // Verify budget: the placeholder is always within limits; this demonstrates the check.
      let totalTriangles = 0;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          totalTriangles += (obj.geometry.index
            ? obj.geometry.index.count / 3
            : obj.geometry.attributes.position.count / 3);
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
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      let raf = 0;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      cleanupRef.current = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
      };

      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the 3D viewer.');
      setState('error');
    }
  }, []);

  // Apply layer visibility whenever the visible set changes.
  useEffect(() => {
    if (state !== 'ready') return;
    for (const layer of LAYERS) {
      const group = groupsRef.current[layer] as unknown as { visible: boolean } | undefined;
      if (group) group.visible = visible.has(layer);
    }
  }, [visible, state]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  if (state === 'cover') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={open}
          className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-line bg-soft px-5 py-3 text-ink hover:bg-button-hover hover:text-on-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          aria-label="Open the 3D body viewer"
        >
          {/* Simple cube icon representing a 3D model */}
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3L21 8.5V15.5L12 21L3 15.5V8.5L12 3Z" />
            <path d="M12 3V21M3 8.5L12 14L21 8.5" />
          </svg>
          open the 3D view
        </button>
        <p className="text-sm text-ink-soft">
          Loads a 3D model from{' '}
          <a href="https://lifesciencedb.jp/bp3d/" className="underline">
            BodyParts3D
          </a>{' '}
          when Christian adds it.{' '}
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
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label="Interactive 3D body viewer. Use mouse or touch to rotate and zoom."
          role="img"
          aria-describedby="body-viewer-desc"
          className="w-full rounded-lg bg-page"
          style={{ aspectRatio: '4/3', touchAction: 'none' }}
        />
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-soft">
            <span className="text-sm text-ink-soft">Loading viewer…</span>
          </div>
        )}
        <p id="body-viewer-desc" className="sr-only">
          A placeholder 3D model made of simple geometric shapes representing a human body. Rotate by
          dragging; zoom by scrolling or pinching. Layer buttons below show or hide skin, muscle and bone.
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
