import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** Shared built-route inventory. A missing dist fails rather than silently skipping pages. */
export function builtPages(missingPage: string, dist = resolve('dist')): string[] {
  function walk(folder: string): string[] {
    return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === 'pagefind' || entry.name === '_astro') return [];
      const file = join(folder, entry.name);
      if (entry.isDirectory()) return walk(file);
      if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') return [missingPage];
      if (name === 'index.html') return ['/'];
      if (name.endsWith('/index.html')) return ['/' + name.slice(0, -'/index.html'.length)];
      return ['/' + name.slice(0, -'.html'.length)];
    });
  }
  return [...new Set(walk(dist))].sort();
}
