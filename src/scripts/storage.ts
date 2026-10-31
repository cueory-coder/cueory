/**
 * The parts of the browser's local storage that Cueory uses (theme pick, starred cards). Everything kept here stays on
 * the student's device and is never sent to us. Tests pass an in-memory stand-in.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser storage can be missing or blocked (private windows, strict settings). Then nothing is remembered. */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
