import { describe, expect, it } from 'vitest';
import { createDemandFrameScheduler, type FrameClock } from '../../src/islands/anatomyframe';

function manualClock() {
  let id = 0;
  const frames = new Map<number, (time: number) => void>();
  const delays = new Map<number, { callback: () => void; ms: number }>();
  const clock: FrameClock = {
    requestFrame(callback) {
      const key = ++id;
      frames.set(key, callback);
      return key;
    },
    cancelFrame(key) {
      frames.delete(key);
    },
    setDelay(callback, ms) {
      const key = ++id;
      delays.set(key, { callback, ms });
      return key;
    },
    clearDelay(key) {
      delays.delete(key);
    },
  };
  function frame(time = 500) {
    const next = frames.entries().next().value;
    if (!next) throw new Error('No frame scheduled');
    const [key, callback] = next;
    frames.delete(key);
    callback(time);
  }
  function delay() {
    const next = delays.entries().next().value;
    if (!next) throw new Error('No delayed refresh scheduled');
    const [key, entry] = next;
    delays.delete(key);
    entry.callback();
  }
  return { clock, frames, delays, frame, delay };
}

describe('anatomy on-demand frame scheduler', () => {
  it('coalesces redraw requests and becomes idle after one stationary frame', () => {
    const fake = manualClock();
    const times: number[] = [];
    const scheduler = createDemandFrameScheduler((time) => {
      times.push(time);
      return false;
    }, fake.clock);
    scheduler.request();
    scheduler.request();
    expect(fake.frames.size).toBe(1);
    fake.frame(300);
    expect(times).toEqual([300]);
    expect(fake.frames.size).toBe(0);
    expect(fake.delays.size).toBe(0);
    scheduler.request(); // resize, selection, or theme change wakes the idle scene
    fake.frame(400);
    expect(times).toEqual([300, 400]);
    expect(fake.frames.size).toBe(0);
  });

  it('continues while camera damping moves, then stops rather than looping forever', () => {
    const fake = manualClock();
    let calls = 0;
    const scheduler = createDemandFrameScheduler(() => ++calls < 4, fake.clock);
    scheduler.request();
    for (let i = 0; i < 3; i++) {
      fake.frame();
      expect(fake.frames.size).toBe(1);
    }
    fake.frame();
    expect(calls).toBe(4);
    expect(fake.frames.size).toBe(0);
    scheduler.request(); // a new orbit after stopping resumes it
    fake.frame();
    expect(calls).toBe(5);
  });

  it('debounces the camera visibility check and wakes exactly one idle frame', () => {
    const fake = manualClock();
    let draws = 0;
    const scheduler = createDemandFrameScheduler(() => {
      draws++;
      return false;
    }, fake.clock);
    scheduler.request();
    fake.frame();
    scheduler.afterIdle(120);
    scheduler.afterIdle(120); // more camera movement replaces the old deadline
    expect(fake.delays.size).toBe(1);
    expect([...fake.delays.values()][0]!.ms).toBe(120);
    fake.delay();
    expect(fake.frames.size).toBe(1);
    fake.frame();
    expect(draws).toBe(2);
    expect(fake.frames.size).toBe(0);
    expect(fake.delays.size).toBe(0);
  });

  it('cancels pending frames and delayed checks when the anatomy scene is disposed', () => {
    const fake = manualClock();
    let draws = 0;
    const scheduler = createDemandFrameScheduler(() => {
      draws++;
      return false;
    }, fake.clock);
    scheduler.request();
    scheduler.afterIdle(120);
    const staleFrame = [...fake.frames.values()][0]!;
    scheduler.dispose();
    expect(fake.frames.size).toBe(0);
    expect(fake.delays.size).toBe(0);
    staleFrame(200); // even an already-dispatched stale callback cannot draw
    scheduler.request();
    scheduler.afterIdle(120);
    scheduler.dispose();
    expect(draws).toBe(0);
    expect(fake.frames.size).toBe(0);
  });
});
