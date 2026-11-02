/**
 * Build-level check for Task 161: loads the real astro.config.mjs with a fake setting in the environment, the way
 * `astro build` reads it, and runs the check the config registers. A bad PUBLIC_ setting must stop the build.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// A clearly fake, non-secret canary, built at run time so nothing secret-shaped sits in the repository.
const MARK = 'CANARY';
const CANARY_KEY = ['sb', 'secret', `${MARK}notARealKey0123456789`].join('_');
const NAMES = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.resetModules();
});

type SetupHook = (options: { command: 'build'; logger: { warn: (m: string) => void } }) => void | Promise<void>;

/** Loads astro.config.mjs fresh with the given environment and returns its build-check hook. */
async function buildCheckHook(values: Partial<Record<(typeof NAMES)[number], string>>): Promise<SetupHook> {
  for (const name of NAMES) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.resetModules();
  const { default: config } = await import('../../astro.config.mjs');
  const integrations = (config.integrations ?? []).flat();
  const check = integrations.find((i) => i && typeof i === 'object' && 'name' in i && i.name === 'cueory:supabase-build-check');
  if (!check || !('hooks' in check)) throw new Error('astro.config.mjs does not register the Supabase build check');
  return check.hooks['astro:config:setup'] as unknown as SetupHook;
}

const logger = { warn: () => {} };

// The first load pulls in Astro, Vite and Tailwind, which is slow on a busy machine.
describe('astro.config.mjs build check', { timeout: 60_000 }, () => {
  it('stops the build when a canary secret key is in a PUBLIC_ variable, without printing it', async () => {
    const hook = await buildCheckHook({
      PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: CANARY_KEY,
    });
    let message = '';
    try {
      await hook({ command: 'build', logger });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Build stopped: accounts are misconfigured: a secret key must never go in a PUBLIC_ variable/);
    expect(message).not.toContain(MARK);
  });

  it('stops the build when only the key is set', async () => {
    const hook = await buildCheckHook({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: `cueory-build-${MARK}-not-a-key` });
    await expect(async () => hook({ command: 'build', logger })).rejects.toThrow(/set both or neither/);
  });

  it('lets the build go ahead with no account settings', async () => {
    const hook = await buildCheckHook({});
    await expect(Promise.resolve(hook({ command: 'build', logger }))).resolves.toBeUndefined();
  });
});
