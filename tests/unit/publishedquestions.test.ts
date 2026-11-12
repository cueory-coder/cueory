import { describe, expect, it, vi } from 'vitest';
import {
  COLUMNS, MAX_QUESTIONS, PAGE_SIZE, beginPublishedQuestionsRetry, describePublishedQuestions, isConceptSlug,
  loadPublishedQuestions, openPublishedQuestions, returnPath,
  type PublicTable, type PublishedClient, type Query, type QuestionsView, type ReadClient, type Reply,
} from '../../src/islands/publishedquestions';
import { remoteChecker } from '../../src/islands/questionsremote';
import { currentFlagItem, onFlagItem, setFlagItem } from '../../src/islands/flagitem';

// Invented, clearly labeled non-clinical fixtures. No question-bank data, keys or real accounts.
type Row = Record<string, unknown>;
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const CONCEPT = uuid(1);

/** Columns the website's roles are granted (20261101080000, 20261101090000). Anything else fails like PostgREST. */
const GRANTED: Record<string, string[]> = {
  concepts: ['id', 'slug', 'title', 'published', 'created_at'],
  items: ['id', 'concept_id', 'type', 'created_at'],
  item_versions: ['id', 'item_id', 'version', 'stem', 'status'],
  item_choices: ['item_version_id', 'choice_id', 'text'],
};

interface Call { table: string; columns: string; eq: [string, unknown][]; in: [string, readonly string[]][]; order: string[]; range?: [number, number] }

class FakeClient implements ReadClient {
  tables: Record<string, Row[]> = { concepts: [], items: [], item_versions: [], item_choices: [] };
  calls: Call[] = [];
  /** Change a reply before it is returned, to test malformed or failed responses. */
  tamper?: (call: Call, reply: Reply) => Reply;

  from(table: PublicTable) {
    if (!(table in GRANTED)) throw new Error(`fake: the website cannot read ${table}`);
    return { select: (columns: string) => this.query(table, columns) };
  }

  private query(table: string, columns: string): Query {
    const call: Call = { table, columns, eq: [], in: [], order: [] };
    this.calls.push(call);
    const builder: Query = {
      eq: (column, value) => { call.eq.push([column, value]); return builder; },
      in: (column, values) => { call.in.push([column, [...values]]); return builder; },
      order: (column) => { call.order.push(column); return builder; },
      range: (from, to) => { call.range = [from, to]; return builder; },
      then: (ok, bad) => Promise.resolve().then(() => this.run(call)).then(ok, bad),
    };
    return builder;
  }

  private run(call: Call): Reply {
    const wanted = call.columns.split(',').map(column => column.trim());
    const used = [...wanted, ...call.eq.map(([c]) => c), ...call.in.map(([c]) => c), ...call.order];
    if (used.some(column => !GRANTED[call.table]!.includes(column))) {
      return { data: null, error: { code: '42501', message: `permission denied for table ${call.table}` } };
    }
    // Row-level security: only published concepts and versions, items with a published version, their choices.
    const visible = (row: Row) => {
      if (call.table === 'concepts') return row.published === true;
      if (call.table === 'item_versions') return row.status === 'published';
      if (call.table === 'items') return this.tables.item_versions!.some(v => v.item_id === row.id && v.status === 'published');
      return this.tables.item_versions!.some(v => v.id === row.item_version_id && v.status === 'published');
    };
    let rows = this.tables[call.table]!.filter(row => visible(row) &&
      call.eq.every(([c, v]) => row[c] === v) && call.in.every(([c, v]) => v.includes(row[c] as string)));
    rows = [...rows].sort((a, b) => {
      for (const column of call.order) {
        const x = String(a[column]); const y = String(b[column]);
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    });
    if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
    const reply: Reply = { data: rows.map(row => Object.fromEntries(wanted.map(column => [column, row[column]]))), error: null };
    return this.tamper ? this.tamper(call, reply) : reply;
  }

  /** Adds a published sample question with `choices` choices (and, for realism, a draft version that must stay hidden). */
  addQuestion(n: number, choices = 3, type: 'single' | 'sata' = 'single') {
    const itemId = uuid(1000 + n);
    const versionId = uuid(5000 + n);
    this.tables.items!.push({ id: itemId, concept_id: CONCEPT, type, created_at: `2026-11-01T00:00:${String(n).padStart(4, '0')}Z` });
    this.tables.item_versions!.push({ id: versionId, item_id: itemId, version: 2, stem: `sample stem ${n}`, status: 'published' });
    this.tables.item_versions!.push({ id: uuid(9000 + n), item_id: itemId, version: 3, stem: `sample draft ${n}`, status: 'draft' });
    // Stored out of order, to prove the loader sorts choices by letter.
    for (const letter of ['a', 'b', 'c', 'd', 'e'].slice(0, choices).reverse()) {
      this.tables.item_choices!.push({ item_version_id: versionId, choice_id: letter, text: `sample choice ${letter}${n}` });
    }
    return { itemId, versionId };
  }
}

function setup(count = 2) {
  const client = new FakeClient();
  client.tables.concepts!.push(
    { id: CONCEPT, slug: 'sample-concept', title: 'sample concept', published: true },
    { id: uuid(2), slug: 'sample-unpublished', title: 'sample unpublished', published: false },
  );
  const added = Array.from({ length: count }, (_, index) => client.addQuestion(index + 1));
  return { client, added };
}

describe('loading published questions', () => {
  it('returns public questions and their published versions, in order, ready for remoteChecker', async () => {
    const { client, added } = setup(2);
    const result = await loadPublishedQuestions(client, 'sample-concept');
    expect(result).toEqual({
      ok: true,
      concept: { id: CONCEPT, slug: 'sample-concept', title: 'sample concept' },
      questions: [1, 2].map(n => ({
        id: added[n - 1]!.itemId, type: 'single', stem: `sample stem ${n}`,
        choices: ['a', 'b', 'c'].map(letter => ({ id: letter, text: `sample choice ${letter}${n}` })),
      })),
      versions: added.map(({ itemId, versionId }) => ({ item_id: itemId, id: versionId })),
    });
    if (!result.ok) throw new Error('expected questions');
    const rpc = vi.fn();
    expect(() => remoteChecker(result.questions, { signedIn: true, transport: { rpc }, versions: result.versions })).not.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads only the four public tables, only granted columns, and never anything about answers', async () => {
    const { client } = setup(3);
    const from = vi.spyOn(client, 'from');
    await loadPublishedQuestions(client, 'sample-concept');
    const tables = from.mock.calls.map(([table]) => table);
    expect(new Set(tables)).toEqual(new Set(['concepts', 'items', 'item_versions', 'item_choices']));
    expect(tables).not.toContain('item_answers');
    for (const call of client.calls) {
      expect(call.columns).toBe(COLUMNS[call.table as PublicTable]);
      expect(call.columns).not.toMatch(/answer|correct|rationale|key|\*/);
      expect(call.columns).not.toMatch(/\(/); // no embedded resources
    }
    expect(client.calls.find(call => call.table === 'item_versions')!.eq).toContainEqual(['status', 'published']);
    expect(client.calls.find(call => call.table === 'concepts')!.eq).toEqual([['slug', 'sample-concept'], ['published', true]]);
  });

  it('refuses a reply that carries an extra column, such as an answer field', async () => {
    const { client } = setup(1);
    client.tamper = (call, reply) => call.table === 'item_choices'
      ? { ...reply, data: (reply.data as Row[]).map(row => ({ ...row, is_correct: true })) } : reply;
    expect(await loadPublishedQuestions(client, 'sample-concept')).toEqual({ ok: false, reason: 'failed' });
  });

  it('pages items with range() in a fixed order until a short page', async () => {
    const { client } = setup(PAGE_SIZE * 2 + 30);
    const result = await loadPublishedQuestions(client, 'sample-concept');
    expect(result.ok && result.questions.length).toBe(PAGE_SIZE * 2 + 30);
    expect(result.ok && result.questions.map(q => q.stem).slice(0, 3)).toEqual(['sample stem 1', 'sample stem 2', 'sample stem 3']);
    const items = client.calls.filter(call => call.table === 'items');
    expect(items.map(call => call.range)).toEqual([[0, 99], [100, 199], [200, 299]]);
    expect(items.every(call => call.order.join() === 'created_at,id')).toBe(true);
    // `.in()` lists are split into chunks of PAGE_SIZE ids; every query is ordered and ranged.
    for (const call of client.calls) {
      expect(call.range).toBeDefined();
      expect(call.order.length).toBeGreaterThan(0);
      for (const [, ids] of call.in) expect(ids.length).toBeLessThanOrEqual(PAGE_SIZE);
    }
    // Two full chunks of 100 ids each read a full page, then an empty one; the last chunk of 30 reads one short page.
    expect(client.calls.filter(call => call.table === 'item_versions').map(call => [call.in[0]![1].length, call.range]))
      .toEqual([[100, [0, 99]], [100, [100, 199]], [100, [0, 99]], [100, [100, 199]], [30, [0, 99]]]);
    // Choices: 100 versions × 3 choices = 300 rows a chunk, so each chunk reads several pages.
    const choicePages = client.calls.filter(call => call.table === 'item_choices');
    expect(choicePages.length).toBeGreaterThan(3);
  });

  it('asks for one more page when a page is exactly full', async () => {
    const { client } = setup(PAGE_SIZE);
    const result = await loadPublishedQuestions(client, 'sample-concept');
    expect(result.ok && result.questions.length).toBe(PAGE_SIZE);
    expect(client.calls.filter(call => call.table === 'items').map(call => call.range)).toEqual([[0, 99], [100, 199]]);
  });

  it(`stops at ${MAX_QUESTIONS} questions`, async () => {
    const { client } = setup(MAX_QUESTIONS + 20);
    const result = await loadPublishedQuestions(client, 'sample-concept');
    expect(result.ok && result.questions.length).toBe(MAX_QUESTIONS);
    expect(client.calls.filter(call => call.table === 'items')).toHaveLength(MAX_QUESTIONS / PAGE_SIZE);
  });

  it('refuses a page longer than it asked for', async () => {
    const { client } = setup(1);
    client.tamper = (call, reply) => call.table === 'items'
      ? { ...reply, data: Array.from({ length: PAGE_SIZE + 1 }, () => (reply.data as Row[])[0]) } : reply;
    expect(await loadPublishedQuestions(client, 'sample-concept')).toEqual({ ok: false, reason: 'failed' });
  });

  it('sends no request for a slug the database could not hold', async () => {
    const { client } = setup(1);
    for (const slug of [null, undefined, '', 'Sample', 'sample_concept', 'sample--concept', '-sample', 'a'.repeat(81), 'x?y', 42]) {
      expect(await loadPublishedQuestions(client, slug)).toEqual({ ok: false, reason: 'not-found' });
    }
    expect(client.calls).toEqual([]);
    expect(isConceptSlug('a'.repeat(80))).toBe(true);
  });

  it('says not found for an unknown or unpublished concept, or one with no published questions', async () => {
    const { client } = setup(1);
    expect(await loadPublishedQuestions(client, 'sample-missing')).toEqual({ ok: false, reason: 'not-found' });
    expect(await loadPublishedQuestions(client, 'sample-unpublished')).toEqual({ ok: false, reason: 'not-found' });
    client.tables.item_versions!.forEach(row => { row.status = 'retired'; });
    expect(await loadPublishedQuestions(client, 'sample-concept')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('leaves out an item whose version was retired between reads', async () => {
    const { client, added } = setup(2);
    client.tamper = (call, reply) => call.table === 'item_versions'
      ? { ...reply, data: (reply.data as Row[]).filter(row => row.item_id !== added[0]!.itemId) } : reply;
    const result = await loadPublishedQuestions(client, 'sample-concept');
    expect(result.ok && result.versions).toEqual([{ item_id: added[1]!.itemId, id: added[1]!.versionId }]);
  });

  const broken: [string, (call: Call, rows: Row[]) => unknown][] = [
    ['a database error', () => undefined],
    ['data that is not a list', (call) => call.table === 'items' ? { not: 'a list' } : undefined],
    ['a concept with another slug', (call, rows) => call.table === 'concepts' ? [{ ...rows[0], slug: 'sample-other' }] : undefined],
    ['two concepts for one slug', (call, rows) => call.table === 'concepts' ? [rows[0], { ...rows[0], id: uuid(3) }] : undefined],
    ['an id that is not a uuid', (call, rows) => call.table === 'items' ? [{ ...rows[0], id: 'sample-item' }] : undefined],
    ['an unknown question type', (call, rows) => call.table === 'items' ? [{ ...rows[0], type: 'essay' }] : undefined],
    ['a duplicate item', (call, rows) => call.table === 'items' ? [rows[0], rows[0]] : undefined],
    ['a version that is not published', (call, rows) => call.table === 'item_versions' ? [{ ...rows[0], status: 'draft' }] : undefined],
    ['two versions for one item', (call, rows) => call.table === 'item_versions' ? [rows[0], { ...rows[0], id: uuid(7777) }] : undefined],
    ['a version of an item it did not ask for', (call, rows) => call.table === 'item_versions' ? [{ ...rows[0], item_id: uuid(8888) }] : undefined],
    ['a version number that is not a whole number', (call, rows) => call.table === 'item_versions' ? [{ ...rows[0], version: '2' }] : undefined],
    ['an empty stem', (call, rows) => call.table === 'item_versions' ? [{ ...rows[0], stem: '   ' }] : undefined],
    ['a stem with a control character', (call, rows) => call.table === 'item_versions' ? [{ ...rows[0], stem: 'sample\u0007' }] : undefined],
    ['a stem that is too long', (call, rows) => call.table === 'item_versions' ? [{ ...rows[0], stem: 'x'.repeat(1001) }] : undefined],
    ['a choice letter outside a to e', (call, rows) => call.table === 'item_choices' ? [...rows, { ...rows[0], choice_id: 'f' }] : undefined],
    ['a repeated choice letter', (call, rows) => call.table === 'item_choices' ? [...rows, rows[0]] : undefined],
    ['a choice of another version', (call, rows) => call.table === 'item_choices' ? [...rows, { ...rows[0], item_version_id: uuid(8888), choice_id: 'e' }] : undefined],
    ['only one choice', (call, rows) => call.table === 'item_choices' ? rows.slice(0, 1) : undefined],
    ['a missing column', (call, rows) => call.table === 'item_choices' ? rows.map(({ text: _text, ...rest }) => rest) : undefined],
    ['a row that is not a plain object', (call, rows) => call.table === 'item_choices' ? rows.map(row => Object.assign(Object.create({ is_correct: true }), row)) : undefined],
  ];
  for (const [name, change] of broken) {
    it(`fails the whole set on ${name}`, async () => {
      const { client } = setup(1);
      client.tamper = (call, reply) => {
        if (name === 'a database error' && call.table === 'item_choices') return { data: null, error: { message: 'private detail' } };
        const replaced = change(call, reply.data as Row[]);
        return replaced === undefined ? reply : { data: replaced, error: null };
      };
      expect(await loadPublishedQuestions(client, 'sample-concept')).toEqual({ ok: false, reason: 'failed' });
    });
  }

  it('fails, without throwing, when the client throws', async () => {
    const client: ReadClient = { from: () => { throw new Error('private network detail'); } };
    expect(await loadPublishedQuestions(client, 'sample-concept')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('pure published-question display states', () => {
  const ready: QuestionsView = {
    view: 'ready',
    concept: { id: CONCEPT, slug: 'sample-concept', title: 'sample concept' },
    questions: [],
    versions: [],
    transport: { rpc: vi.fn() },
  };

  it('has a clear loading state before a request finishes', () => {
    expect(describePublishedQuestions(undefined)).toEqual({ status: 'loading', message: 'loading questions…' });
  });

  it('keeps the accounts-off message without asking for questions', () => {
    expect(describePublishedQuestions({ view: 'off' }))
      .toEqual({ status: 'off', message: 'real questions open soon.' });
  });

  it('keeps the safe return path when signed out', () => {
    expect(describePublishedQuestions({ view: 'signed-out', next: '/learn/questions?concept=sample-concept' }))
      .toEqual({ status: 'signed-out', next: '/learn/questions?concept=sample-concept' });
  });

  it('calls an unpublished or missing concept empty, not failed', () => {
    expect(describePublishedQuestions({ view: 'not-found' }))
      .toEqual({ status: 'empty', message: 'there are no published questions for this topic yet.' });
  });

  it('uses a fixed, private-detail-free message when loading fails', () => {
    const failed = { view: 'failed', message: 'sample private server detail' } as unknown as QuestionsView;
    expect(describePublishedQuestions(failed))
      .toEqual({ status: 'failed', message: "couldn't load questions. please try again." });
    expect(JSON.stringify(describePublishedQuestions(failed))).not.toContain('sample private server detail');
  });

  it('distinguishes a ready player without copying questions into its status', () => {
    expect(describePublishedQuestions(ready)).toEqual({ status: 'ready' });
  });

  it('moves failed → retry/loading → ready, and never resets other states', () => {
    const failed: QuestionsView = { view: 'failed' };
    expect(describePublishedQuestions(failed).status).toBe('failed');
    const retry = beginPublishedQuestionsRetry(failed);
    expect(retry).toBeUndefined();
    expect(describePublishedQuestions(retry).status).toBe('loading');
    expect(describePublishedQuestions(ready).status).toBe('ready');
    expect(beginPublishedQuestionsRetry(ready)).toBe(ready);
    expect(beginPublishedQuestionsRetry({ view: 'not-found' })).toEqual({ view: 'not-found' });
  });
});

describe('opening the real questions page', () => {
  const at = { pathname: '/learn/questions', search: '?concept=sample-concept' };
  const signedIn = async () => ({ signedIn: true as const, userId: uuid(42), email: 'student@example.test' });
  const signedOut = async () => ({ signedIn: false as const });
  const asPage = (client: FakeClient) => Object.assign(client, { rpc: vi.fn(), auth: { getSession: vi.fn() } }) as unknown as PublishedClient & FakeClient;

  it('shows "open soon" when accounts are off, and reads nothing', async () => {
    const readSession = vi.fn(signedIn);
    expect(await openPublishedQuestions(at, async () => null, readSession)).toEqual({ view: 'off' });
    expect(readSession).not.toHaveBeenCalled();
  });

  it('reads no question when signed out, and comes back to this concept after signing in', async () => {
    const client = asPage(setup(1).client);
    expect(await openPublishedQuestions(at, async () => client, signedOut))
      .toEqual({ view: 'signed-out', next: '/learn/questions?concept=sample-concept' });
    expect(client.calls).toEqual([]);
    expect(returnPath('/learn/questions', '//evil.example')).toBe('/learn/questions');
    expect(returnPath('/learn/questions', null)).toBe('/learn/questions');
  });

  it('loads the concept when signed in and hands over the client itself as the transport', async () => {
    const client = asPage(setup(1).client);
    const view = await openPublishedQuestions(at, async () => client, signedIn);
    expect(view.view).toBe('ready');
    expect(view.view === 'ready' && view.transport).toBe(client);
    expect(view.view === 'ready' && view.questions).toHaveLength(1);
  });

  it('maps a missing concept, a failed load and a failed client download to calm views', async () => {
    const client = asPage(setup(1).client);
    expect(await openPublishedQuestions({ ...at, search: '' }, async () => client, signedIn)).toEqual({ view: 'not-found' });
    client.tamper = () => ({ data: null, error: { message: 'private detail' } });
    expect(await openPublishedQuestions(at, async () => client, signedIn)).toEqual({ view: 'failed' });
    expect(await openPublishedQuestions(at, async () => { throw new Error('download failed'); }, signedIn)).toEqual({ view: 'failed' });
  });
});

describe('flag context for questions that load in the browser', () => {
  it('keeps the current item and version, tells listeners on change, and drops anything that is not a uuid', () => {
    const heard: unknown[] = [];
    const stop = onFlagItem(item => heard.push(item));
    setFlagItem({ itemId: uuid(1), itemVersionId: uuid(2) });
    setFlagItem({ itemId: uuid(1), itemVersionId: uuid(2) }); // unchanged: no second call
    expect(currentFlagItem()).toEqual({ itemId: uuid(1), itemVersionId: uuid(2) });
    setFlagItem({ itemId: 'sample-item', itemVersionId: uuid(2) });
    expect(currentFlagItem()).toBeUndefined();
    stop();
    setFlagItem({ itemId: uuid(3), itemVersionId: uuid(4) });
    expect(heard).toEqual([{ itemId: uuid(1), itemVersionId: uuid(2) }, undefined]);
    setFlagItem(undefined);
  });

  it('keeps telling other listeners when one throws, and hands out copies', () => {
    const later = vi.fn();
    const stops = [onFlagItem(() => { throw new Error('listener failed'); }), onFlagItem(later)];
    setFlagItem({ itemId: uuid(5), itemVersionId: uuid(6) });
    expect(later).toHaveBeenCalledOnce();
    const copy = currentFlagItem()!;
    copy.itemId = uuid(7);
    expect(currentFlagItem()!.itemId).toBe(uuid(5));
    stops.forEach(stop => stop());
    setFlagItem(undefined);
  });
});
