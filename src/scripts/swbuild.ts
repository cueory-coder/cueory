/**
 * Turns the service worker's TypeScript sources into the one plain script served as /sw.js (src/pages/sw.js.ts).
 * No bundler and no new package: Node's own `stripTypeScriptTypes` removes the types, then the import lines and the
 * `export` keywords are removed, because the pieces sit in one file. The order matters: each file may use what came
 * before it.
 */
import { stripTypeScriptTypes } from 'node:module';

/** Letters, digits and dashes only, so it is safe inside a quoted string and a cache name. */
const SAFE_VERSION = /^[A-Za-z0-9-]{1,64}$/;

/** The sources as one plain script: types removed, import lines and `export` keywords dropped, wrapped so nothing leaks. */
export function buildPlainScript(sources: readonly string[]): string {
  const pieces = sources.map((source) =>
    stripTypeScriptTypes(source)
      .replace(/^import\b[^;]*;[ \t]*\r?\n?/gm, '')
      .replace(/^export\s+/gm, ''),
  );
  return `'use strict';\n(() => {\n${pieces.join('\n')}\n})();\n`;
}

/** The service worker: the same, with the build version put where the source says `__BUILD_VERSION__`. */
export function buildServiceWorker(sources: readonly string[], version: string): string {
  if (!SAFE_VERSION.test(version)) throw new Error('The build version must be 1 to 64 letters, digits or dashes.');
  const script = buildPlainScript(sources);
  if (!script.includes('__BUILD_VERSION__')) throw new Error('The worker source has no version placeholder.');
  return script.replaceAll('__BUILD_VERSION__', version);
}
