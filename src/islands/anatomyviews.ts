/**
 * Camera presets, the 3D view's keyboard map, model download sizes and lesson links for the anatomy lab. Pure logic, no
 * three.js and no DOM, so it is unit tested (tests/unit/anatomyviews.test.ts).
 */

// ---------------------------------------------------------------------------------------------------------------------
// Preset views
// ---------------------------------------------------------------------------------------------------------------------

export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'top';

/**
 * The preset views, in button order. The names follow the model's own frame, set once for every system by
 * scripts/build-anatomy.mjs: glTF +y up, the model facing +z, and +x the body's left (BodyParts3D's coordinate system).
 * So "left side" looks at the body's left side, whichever way the student has turned it.
 */
export const VIEW_PRESETS: ReadonlyArray<{ id: ViewPreset; label: string; key: string }> = [
  { id: 'front', label: 'front', key: '1' },
  { id: 'back', label: 'back', key: '2' },
  { id: 'left', label: 'left side', key: '3' },
  { id: 'right', label: 'right side', key: '4' },
  { id: 'top', label: 'top', key: '5' },
];

/**
 * The unit direction from the model's center to the camera for a preset. "top" leans a hair towards the front so the
 * camera never sits exactly on the up axis (where "which way is up on screen" is undefined) and the front of the model
 * is at the bottom of the screen.
 */
export function presetDirection(id: ViewPreset): [number, number, number] {
  switch (id) {
    case 'front': return [0, 0, 1];
    case 'back': return [0, 0, -1];
    case 'left': return [1, 0, 0];
    case 'right': return [-1, 0, 0];
    case 'top': {
      const lean = 1e-3;
      const length = Math.hypot(1, lean);
      return [0, 1 / length, lean / length];
    }
  }
}

export function isViewPreset(value: unknown): value is ViewPreset {
  return VIEW_PRESETS.some((preset) => preset.id === value);
}

// ---------------------------------------------------------------------------------------------------------------------
// Keyboard map for the 3D view
// ---------------------------------------------------------------------------------------------------------------------

export type CanvasAction =
  | { kind: 'orbit'; yaw: number; pitch: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'reset' }
  | { kind: 'view'; preset: ViewPreset };

/** What a key pressed on the focused 3D view does, or null when the lab leaves it to the browser. */
export function canvasKeyAction(key: string, step: number, zoomIn: number): CanvasAction | null {
  switch (key) {
    case 'ArrowLeft': return { kind: 'orbit', yaw: -step, pitch: 0 };
    case 'ArrowRight': return { kind: 'orbit', yaw: step, pitch: 0 };
    case 'ArrowUp': return { kind: 'orbit', yaw: 0, pitch: -step };
    case 'ArrowDown': return { kind: 'orbit', yaw: 0, pitch: step };
    case '+': case '=': return { kind: 'zoom', factor: zoomIn };
    case '-': case '_': return { kind: 'zoom', factor: 1 / zoomIn };
    case '0': case 'Home': return { kind: 'reset' };
    default: {
      const preset = VIEW_PRESETS.find((p) => p.key === key);
      return preset ? { kind: 'view', preset: preset.id } : null;
    }
  }
}

/** The keys listed in the lab's "keys" panel, in the words a student reads. Kept in step with canvasKeyAction. */
export const KEY_MAP: ReadonlyArray<{ keys: string; does: string }> = [
  { keys: '← →', does: 'turn the model left or right' },
  { keys: '↑ ↓', does: 'tilt the model up or down' },
  { keys: '+ −', does: 'zoom in or out' },
  ...VIEW_PRESETS.map((preset) => ({ keys: preset.key, does: `${preset.label} view` })),
  { keys: '0 or Home', does: 'reset the view' },
  { keys: 'Tab', does: 'move to the buttons and the structure list, which do everything the 3D view does' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Download sizes
// ---------------------------------------------------------------------------------------------------------------------

/** "45 KB", "0.6 MB", "2.4 MB": rounded up, so a note never promises less than the download. */
export function formatDownloadSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1_000_000) return `${Math.max(1, Math.ceil(bytes / 1_000))} KB`;
  return `${(Math.ceil(bytes / 100_000) / 10).toFixed(1)} MB`;
}

/** The note under the cover's button: what the first tap downloads besides the 3D viewer itself. */
export function coverDownloadNote(firstTitle: string | null, bytes: number | undefined): string {
  const size = bytes === undefined ? null : formatDownloadSize(bytes);
  if (!firstTitle || !size) return 'loads the 3D viewer, then one body system at a time.';
  return `loads the 3D viewer, then one body system at a time. the first, ${firstTitle}, is a ${size} download.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lesson links: /preview/anatomy-lab?system=heart&structure=FMA7204
// ---------------------------------------------------------------------------------------------------------------------

export interface LabFocus {
  system: string | null;
  structure: string | null;
}

const SYSTEM_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRUCTURE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Which system and structure a link asks the lab to open on. Anything that isn't a well-formed key or id is ignored
 * (never shown, never looked up), so a hand-edited address can only fall back to the normal first view.
 */
export function focusFromSearch(search: string): LabFocus {
  const params = new URLSearchParams(search);
  const system = params.get('system');
  const structure = params.get('structure');
  return {
    system: system && system.length <= 64 && SYSTEM_KEY.test(system) ? system : null,
    structure: structure && STRUCTURE_ID.test(structure) ? structure : null,
  };
}

/** The system the lab starts on: the linked one when this build has it, else the first. */
export function initialSystemKey(keys: readonly string[], focus: LabFocus): string {
  return focus.system && keys.includes(focus.system) ? focus.system : (keys[0] ?? '');
}
