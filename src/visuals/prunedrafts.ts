/**
 * Keeps draft anatomy models off the live site (D-56). Astro copies public/ into dist/, so a draft's .glb would be
 * fetchable on the live site even though its page is hidden. After a build that may not show drafts, every .glb under
 * dist/models/anatomy that no approved system names is deleted. Fails closed: only a Workers preview build of a branch
 * other than `main`, or an explicit CUEORY_ANATOMY_DRAFTS=1 (local and test builds), keeps drafts.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { approvedOnly } from './sources';

export interface PruneEnv {
  WORKERS_CI?: string | undefined;
  WORKERS_CI_BRANCH?: string | undefined;
  CUEORY_ANATOMY_DRAFTS?: string | undefined;
}

export function keepsDrafts(env: PruneEnv): boolean {
  if (env.WORKERS_CI !== '1') return env.CUEORY_ANATOMY_DRAFTS === '1';
  const branch = env.WORKERS_CI_BRANCH?.trim();
  return Boolean(branch) && branch !== 'main';
}

interface SystemFile {
  status?: string;
  model?: { file?: string; files?: string[]; layerFiles?: Record<string, string[]> };
}

/** Every model file URL path a system names. */
export function modelPathsOf(system: SystemFile): string[] {
  const m = system.model ?? {};
  return [...(m.file ? [m.file] : []), ...(m.files ?? []), ...Object.values(m.layerFiles ?? {}).flat()];
}

/** Deletes the draft models from `dist`; returns the dist-relative paths removed. */
export function pruneDraftModels(dist: string, contentDir: string, env: PruneEnv): string[] {
  if (keepsDrafts(env)) return [];
  const modelsDir = join(dist, 'models', 'anatomy');
  if (!existsSync(modelsDir)) return [];
  const systems: SystemFile[] = readdirSync(contentDir)
    .filter((f) => /^anatomy-.+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8')) as SystemFile);
  const keep = new Set(approvedOnly(systems.map((s) => ({ ...s, status: s.status === 'approved' ? ('approved' as const) : ('draft' as const) }))).flatMap(modelPathsOf));
  const removed: string[] = [];
  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const at = `${url}/${entry.name}`;
      if (entry.isDirectory()) walk(path, at);
      else if (/\.glb$/i.test(entry.name) && !keep.has(at)) {
        rmSync(path);
        removed.push(at);
      }
    }
  };
  walk(modelsDir, '/models/anatomy');
  return removed;
}

/** Astro integration: runs the prune once the build is written. */
export function pruneDraftModelsIntegration() {
  return {
    name: 'prune-draft-anatomy-models',
    hooks: {
      'astro:build:done': ({ dir }: { dir: URL }) => {
        const removed = pruneDraftModels(
          decodeURIComponent(dir.pathname),
          join(process.cwd(), 'content', 'visuals'),
          process.env,
        );
        if (removed.length > 0) console.log(`pruned ${removed.length} draft anatomy model(s) from the build`);
      },
    },
  };
}
