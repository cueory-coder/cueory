/**
 * Guard the Anatomy Lab's asynchronous first open against rapid repeated taps and unmounts.
 * Kept free of React and three.js so lifecycle behavior can be tested without a browser GPU.
 */
export function createAnatomyOpenGate() {
  let latest = 0;
  let opening = false;
  let mounted = true;

  return {
    /** Only one import / scene setup may be active. */
    begin(): number | null {
      if (!mounted || opening) return null;
      opening = true;
      return ++latest;
    },
    /** Check after each await before touching the canvas or React state. */
    current(attempt: number): boolean {
      return mounted && opening && attempt === latest;
    },
    finish(attempt: number): void {
      if (attempt === latest) opening = false;
    },
    /** Invalidate delayed imports/frames before disposing the mounted scene. */
    unmount(): void {
      latest++;
      opening = false;
      mounted = false;
    },
    /** Safe for React's development-only effect cleanup / setup replay. */
    mount(): void {
      mounted = true;
    },
  };
}
