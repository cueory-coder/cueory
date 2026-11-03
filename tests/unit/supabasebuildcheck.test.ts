import { describe, expect, it, vi } from 'vitest';
import {
  assertSupabaseBuildSettings,
  supabaseBuildCheck,
  supabaseBuildProblem,
} from '../../src/islands/supabasebuildcheck';

// Fake values only, built at run time so no secret-shaped text sits in the (public) repository for scanners to trip
// on. None of these is a real key. Each canary carries a marker so a test can prove a message never echoes it.
const MARK = 'CANARY';
const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const PUBLISHABLE = ['sb', 'publishable', 'FAKEfakeFAKEfake0123456789'].join('_');
const SECRET = ['sb', 'secret', `${MARK}notARealKey0123456789`].join('_');
const JWT = ['eyJ', `${MARK}notARealToken`].join('');
const NOT_A_KEY = `cueory-build-${MARK}-not-a-key`;
const BAD_URL = `https://${MARK.toLowerCase()}.example.com`;

type Env = Parameters<typeof supabaseBuildProblem>[0];
const env = (url?: string, key?: string): Env => ({ PUBLIC_SUPABASE_URL: url, PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });

/** Runs the build check and returns its error message, failing the test if it did not throw. */
function failure(e: Env): string {
  try {
    assertSupabaseBuildSettings(e);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the build check to throw');
}

describe('settings the build accepts', () => {
  it('passes when both are unset (accounts off)', () => {
    expect(supabaseBuildProblem({})).toBeNull();
    expect(() => assertSupabaseBuildSettings({})).not.toThrow();
  });

  it('treats blank values as unset', () => {
    expect(supabaseBuildProblem(env('', '   '))).toBeNull();
  });

  it('passes a valid address with a publishable key', () => {
    expect(() => assertSupabaseBuildSettings(env(URL, PUBLISHABLE))).not.toThrow();
  });
});

describe('settings that stop the build', () => {
  it('fails when only the key is set', () => {
    expect(failure(env(undefined, PUBLISHABLE))).toMatch(/PUBLIC_SUPABASE_URL is not; set both or neither/);
  });

  it('fails when only the address is set', () => {
    expect(failure(env(URL, ''))).toMatch(/PUBLIC_SUPABASE_PUBLISHABLE_KEY is not; set both or neither/);
  });

  it('fails on a secret key, even with no address, and says why', () => {
    expect(failure(env(undefined, SECRET))).toMatch(/secret key must never go in a PUBLIC_ variable/);
    expect(failure(env(URL, SECRET))).toMatch(/secret key must never go in a PUBLIC_ variable/);
  });

  it('fails on a legacy JWT', () => {
    expect(failure(env(URL, JWT))).toMatch(/legacy JWT/);
  });

  it('fails on anything that is not a publishable key', () => {
    expect(failure(env(URL, NOT_A_KEY))).toMatch(/does not look like a publishable key/);
  });

  it('fails on a wrong project address', () => {
    expect(failure(env(BAD_URL, PUBLISHABLE))).toMatch(/not a valid https:\/\/<ref>\.supabase\.co address/);
    expect(failure(env(URL.replace('https:', 'http:'), PUBLISHABLE))).toMatch(/must use https/);
  });

  it('never prints either value', () => {
    for (const e of [env(URL, SECRET), env(undefined, SECRET), env(URL, JWT), env(URL, NOT_A_KEY), env(BAD_URL, PUBLISHABLE)]) {
      const message = failure(e);
      expect(message).toMatch(/^Build stopped: /);
      expect(message).not.toContain(MARK);
      expect(message.toLowerCase()).not.toContain(MARK.toLowerCase());
      expect(message).not.toContain(PUBLISHABLE);
    }
  });
});

describe('the Astro integration', () => {
  type SetupHook = (options: { command: string; logger: { warn: (m: string) => void } }) => void;
  const setup = (e: Env) => supabaseBuildCheck(e).hooks['astro:config:setup'] as unknown as SetupHook;

  it('throws on build', () => {
    const warn = vi.fn();
    expect(() => setup(env(URL, SECRET))({ command: 'build', logger: { warn } })).toThrow(/^Build stopped: /);
  });

  it('only warns in dev, without the value', () => {
    const warn = vi.fn();
    expect(() => setup(env(URL, SECRET))({ command: 'dev', logger: { warn } })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain(MARK);
  });

  it('stays quiet when both are unset', () => {
    const warn = vi.fn();
    expect(() => setup({})({ command: 'build', logger: { warn } })).not.toThrow();
    setup({})({ command: 'dev', logger: { warn } });
    expect(warn).not.toHaveBeenCalled();
  });
});
