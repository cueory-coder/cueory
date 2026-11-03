/**
 * Schedules one WebGL frame at a time. A moving camera can request another frame, but a stationary
 * anatomy view has no perpetual animation loop. Labels can schedule one delayed idle refresh.
 * This module has no three.js or DOM dependencies in its logic, so its queue is unit tested.
 */
export interface FrameClock {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(id: number): void;
  setDelay(callback: () => void, delayMs: number): number;
  clearDelay(id: number): void;
}

const browserClock: FrameClock = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setDelay: (callback, ms) => window.setTimeout(callback, ms),
  clearDelay: (id) => window.clearTimeout(id),
};

/** The callback returns true only while a camera transition still needs another frame. */
export function createDemandFrameScheduler(
  onFrame: (time: number) => boolean,
  clock: FrameClock = browserClock,
) {
  let frameId: number | null = null;
  let delayId: number | null = null;
  let disposed = false;

  function request(): void {
    if (disposed || frameId !== null) return;
    frameId = clock.requestFrame((time) => {
      frameId = null;
      if (disposed) return;
      if (onFrame(time)) request();
    });
  }

  function afterIdle(delayMs: number): void {
    if (disposed) return;
    if (delayId !== null) clock.clearDelay(delayId);
    delayId = clock.setDelay(() => {
      delayId = null;
      request();
    }, Math.max(0, delayMs));
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (frameId !== null) clock.cancelFrame(frameId);
    if (delayId !== null) clock.clearDelay(delayId);
    frameId = null;
    delayId = null;
  }

  return { request, afterIdle, dispose };
}
