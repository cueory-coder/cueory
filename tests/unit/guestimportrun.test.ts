import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGuestImport, GUEST_IMPORT_MARKER_PREFIX, type GuestImportDb } from '../../src/islands/guestimportrun';
import { emptyProgress, saveProgress, withOnboarding, withPile, withStars } from '../../src/scripts/progress';
import type { KeyValueStorage } from '../../src/scripts/storage';
import type { IdMap } from '../../src/islands/guestimport';

const USER_A = '550e8400-e29b-41d4-a716-446655440001';
const USER_B = '550e8400-e29b-41d4-a716-446655440002';
const CARD_A = '550e8400-e29b-41d4-a716-446655440003';
const CARD_B = '550e8400-e29b-41d4-a716-446655440004';

function memoryStorage(): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function idMap(cards: Record<string, string> = { 'card-a': CARD_A, 'card-b': CARD_B }): IdMap {
  return new Map([['deck-a', new Map(Object.entries(cards))]]);
}

function savedCards(storage: KeyValueStorage): void {
  let progress = withPile(emptyProgress(), 'deck-a', 'card-a', 'know');
  progress = withPile(progress, 'deck-a', 'card-b', 'learning');
  progress = withStars(progress, 'deck-a', ['card-a']);
  expect(saveProgress(storage, progress)).toBe(true);
}

function database(response: { error: unknown | null } = { error: null }) {
  const insert = vi.fn(async (_table: 'review_state', _rows: Parameters<GuestImportDb['insert']>[1]) => response);
  return { db: { insert }, insert };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('runGuestImport — once per account', () => {
  it('does nothing when guest progress is empty', async () => {
    const storage = memoryStorage();
    const { db, insert } = database();
    expect(await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() })).toEqual({
      imported: 0, skipped: 0, message: 'no guest progress is saved on this device.',
    });
    expect(insert).not.toHaveBeenCalled();
    expect(storage.values.size).toBe(0);
  });

  it('refuses a missing account id rather than sending guest progress', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    const result = await runGuestImport({ storage, db, userId: '', idMap: idMap() });
    expect(result.imported).toBe(0);
    expect(result.message).toMatch(/sign in/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('does nothing if this account already has an import marker', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    storage.setItem(GUEST_IMPORT_MARKER_PREFIX + USER_A, '1');
    const { db, insert } = database();
    const result = await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() });
    expect(result.imported).toBe(0);
    expect(result.message).toMatch(/already imported/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts only review_state rows using the real importer, then writes the marker', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    const result = await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() });
    expect(result).toEqual({ imported: 2, skipped: 0, message: '2 saved cards were imported.' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith('review_state', [
      { item_id: CARD_A, level: 1, last_reviewed: '2026-11-01', next_review: '2026-11-04' },
      { item_id: CARD_B, level: 0, last_reviewed: '2026-10-31', next_review: '2026-11-01' },
    ]);
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBe('1');
    // Never clear or overwrite guest progress on import.
    expect(storage.getItem('cueory-progress')).not.toBeNull();
  });

  it('does not import twice after a successful first run', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    const options = { storage, db, userId: USER_A, idMap: idMap() };
    expect((await runGuestImport(options)).imported).toBe(2);
    expect((await runGuestImport(options)).imported).toBe(0);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('a different signed-in account has a separate marker', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() });
    await runGuestImport({ storage, db, userId: USER_B, idMap: idMap() });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_B)).toBe('1');
  });

  it('does not mark on a database error, then retries successfully', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    insert.mockResolvedValueOnce({ error: { message: 'private database detail' } });
    const options = { storage, db, userId: USER_A, idMap: idMap() };
    const failed = await runGuestImport(options);
    expect(failed.imported).toBe(0);
    expect(failed.message).not.toContain('private database detail');
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBeNull();
    expect((await runGuestImport(options)).imported).toBe(2);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBe('1');
  });

  it('a thrown insert does not create a marker', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    insert.mockRejectedValueOnce(new Error('offline'));
    const result = await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() });
    expect(result.imported).toBe(0);
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBeNull();
  });

  it('an unexpected insert response fails closed without writing the marker', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    insert.mockResolvedValueOnce({ error: undefined });
    expect((await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() })).imported).toBe(0);
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBeNull();
  });

  it('reports unmapped cards but imports the ones that match', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db } = database();
    const result = await runGuestImport({ storage, db, userId: USER_A, idMap: idMap({ 'card-a': CARD_A }) });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.message).toMatch(/1 could not be matched/);
  });

  it('does not mark a zero-row import, so missing mappings can be supplied later', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const { db, insert } = database();
    const options = { storage, db, userId: USER_A, idMap: idMap({}) };
    const result = await runGuestImport(options);
    expect(result).toMatchObject({ imported: 0, skipped: 2 });
    expect(insert).not.toHaveBeenCalled();
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBeNull();
    expect((await runGuestImport({ ...options, idMap: idMap() })).imported).toBe(2);
  });

  it('keeps onboarding-only progress without marking it as imported', async () => {
    const storage = memoryStorage();
    saveProgress(storage, withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2027-06-01' }));
    const { db, insert } = database();
    const result = await runGuestImport({ storage, db, userId: USER_A, idMap: idMap() });
    expect(result).toMatchObject({ imported: 0, skipped: 0 });
    expect(insert).not.toHaveBeenCalled();
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBeNull();
  });

  it('refuses to import when the marker cannot be read', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const guarded: KeyValueStorage = {
      ...storage,
      getItem: (key) => {
        if (key.startsWith(GUEST_IMPORT_MARKER_PREFIX)) throw new Error('storage unavailable');
        return storage.getItem(key);
      },
    };
    const { db, insert } = database();
    const result = await runGuestImport({ storage: guarded, db, userId: USER_A, idMap: idMap() });
    expect(result.imported).toBe(0);
    expect(result.message).toMatch(/cannot check/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('reports a marker write failure accurately after a successful insert', async () => {
    const storage = memoryStorage();
    savedCards(storage);
    const guarded: KeyValueStorage = {
      ...storage,
      setItem: (key, value) => {
        if (key.startsWith(GUEST_IMPORT_MARKER_PREFIX)) throw new Error('blocked');
        storage.setItem(key, value);
      },
    };
    const { db, insert } = database();
    const result = await runGuestImport({ storage: guarded, db, userId: USER_A, idMap: idMap() });
    expect(result.imported).toBe(2);
    expect(result.message).toMatch(/could not remember/);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(storage.getItem(GUEST_IMPORT_MARKER_PREFIX + USER_A)).toBeNull();
  });
});
