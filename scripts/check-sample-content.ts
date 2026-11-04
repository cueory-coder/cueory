import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const protectedFieldNames = new Set(['answerKey', 'correctAnswer', 'correctChoice', 'reservedCheck']);

export function findProtectedFields(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findProtectedFields(item, `${path}[${index}]`));
  if (value === null || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const matches = protectedFieldNames.has(key) ? [childPath] : [];
    return [...matches, ...findProtectedFields(child, childPath)];
  });
}

function jsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(path) : entry.name.endsWith('.json') ? [path] : [];
  });
}

if (process.argv[1]?.endsWith('check-sample-content.ts')) {
  const contentRoot = join(process.cwd(), 'content');
  const findings = jsonFiles(contentRoot).flatMap((file) => {
    const fields = findProtectedFields(JSON.parse(readFileSync(file, 'utf8')));
    return fields.map((field) => `${file}: protected field ${field}`);
  });

  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  }
}
