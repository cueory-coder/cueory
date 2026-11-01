import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { main } from '../../scripts/export-frames.ts';

/**
 * The video-frame exporter (#47) against a real page: only the selected diagram's own animations set the clip's length,
 * so an endless spinner or a longer animation elsewhere on the page changes nothing (the director's review of #47).
 */
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  #spin { width: 20px; height: 20px; animation: spin 1s linear infinite; }
  #slow { width: 20px; height: 20px; animation: fade 3s linear; }
  #diagram { width: 200px; height: 100px; background: #3e2c23; animation: fade 1s linear; }
  @keyframes spin { to { transform: rotate(1turn); } }
  @keyframes fade { from { opacity: 0.2; } to { opacity: 1; } }
</style></head><body><div id="spin"></div><div id="slow"></div><div id="diagram"></div></body></html>`;

let server: Server;
let url = '';

test.beforeAll(async () => {
  server = createServer((_, response) => response.writeHead(200, { 'content-type': 'text/html' }).end(page));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('times the clip by the selected diagram alone, despite an endless spinner and a longer animation nearby', async ({}, info) => {
  // The exporter starts its own browser, so one run is enough.
  test.skip(info.project.name !== 'desktop', 'runs once, on the desktop project');
  test.setTimeout(60_000);
  const out = await mkdtemp(join(tmpdir(), 'export-frames-'));
  try {
    expect(await main(['--url', url, '--selector', '#diagram', '--out', out, '--fps', '4'])).toBe(0);
    // One second at 4 frames a second: 4 frames per size, not "endless" and not 3 seconds' worth.
    expect(await readdir(join(out, 'portrait'))).toHaveLength(4);
    expect(await readdir(join(out, 'landscape'))).toHaveLength(4);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
