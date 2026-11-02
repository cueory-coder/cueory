/**
 * An in-memory stand-in for the supabase-js calls the batch importer makes (scripts/import-batch/db.ts), with the
 * rules of supabase/migrations that matter to it: unique slugs and item ids, one row per (item, version), one published
 * version per item, a version can't be created published or published while incomplete, published and retired
 * versions can't be edited, choices and answers change only on drafts, and an answer needs its choice.
 * It never connects to anything.
 */
import { randomUUID } from 'node:crypto';
import type { DbClient, DbError, DbResult, Filter, Row } from '../../scripts/import-batch/db';

type Op = 'select' | 'insert' | 'update' | 'delete' | 'rpc';
export interface Write { op: Op; table: string; rows: number }

export class FakeSupabase implements DbClient {
  tables: Record<string, Row[]> = { concepts: [], sources: [], items: [], item_versions: [], item_choices: [], item_answers: [] };
  writes: Write[] = [];
  reads = 0;
  /** Return an error for a call, to test stopping. Called before the call does anything; for rpc, `table` is the function. */
  failWith?: (op: Op, table: string) => DbError | undefined;
  /** Fail publish_item_version after it has retired the old version, to prove the whole call is rolled back. */
  failPublishMidway = false;

  /** publish_item_version (supabase/migrations/20261102090000): retire the live version and publish a draft, all or nothing. */
  rpc(fn: 'publish_item_version', args: { p_version_id: string }): PromiseLike<DbResult<unknown>> {
    return Promise.resolve().then(() => {
      const injected = this.failWith?.('rpc', fn);
      if (injected) return { data: null, error: injected };
      const before = structuredClone(this.tables);
      try {
        const versions = this.tables.item_versions!;
        const target = versions.find(row => row.id === args.p_version_id);
        if (!target) throw Object.assign(new Error('no such version'), { code: 'P0002' });
        if (target.status === 'published') return { data: null, error: null };
        if (target.status !== 'draft') throw new Error('only a draft version can be published');
        for (const row of versions.filter(v => v.item_id === target.item_id && v.status === 'published')) this.updateOne('item_versions', row, { status: 'retired' });
        if (this.failPublishMidway) throw Object.assign(new Error('fake: stopped inside publish_item_version'), { code: '57014' });
        this.updateOne('item_versions', target, { status: 'published' });
        this.writes.push({ op: 'rpc', table: fn, rows: 1 });
        return { data: null, error: null };
      } catch (e) {
        this.tables = before;
        return { data: null, error: { message: (e as Error).message, code: (e as Error & { code?: string }).code ?? '23514' } };
      }
    });
  }

  from(table: string) {
    if (!(table in this.tables)) throw new Error(`fake: unknown table ${table}`);
    return {
      select: (columns: string) => this.query(table, 'select', { columns }),
      insert: (rows: Row[]) => this.query(table, 'insert', { rows }),
      update: (patch: Row) => this.query(table, 'update', { patch }),
      delete: () => this.query(table, 'delete', {}),
    };
  }

  private query(table: string, op: Op, args: { columns?: string; rows?: Row[]; patch?: Row }): Filter<never> {
    const filters: ((row: Row) => boolean)[] = [];
    let returning: string | undefined = op === 'select' ? args.columns : undefined;
    const builder = {
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; },
      in: (column: string, values: readonly unknown[]) => { filters.push(row => values.includes(row[column])); return builder; },
      select: (columns: string) => { returning = columns; return builder; },
      then: <A, B>(ok?: (value: DbResult<never>) => A | PromiseLike<A>, bad?: (reason: unknown) => B | PromiseLike<B>) =>
        Promise.resolve().then(() => this.execute(table, op, args, filters, returning)).then(ok, bad),
    };
    return builder as unknown as Filter<never>;
  }

  private execute(table: string, op: Op, args: { rows?: Row[]; patch?: Row }, filters: ((row: Row) => boolean)[], returning?: string): DbResult<never> {
    const injected = this.failWith?.(op, table);
    if (injected) return { data: null, error: injected };
    const pick = (row: Row) => (returning ? Object.fromEntries(returning.split(',').map(c => [c, row[c]])) : row);
    const match = (row: Row) => filters.every(f => f(row));
    const fail = (message: string, code = '23514'): DbResult<never> => ({ data: null, error: { message, code } });
    const rows = this.tables[table]!;
    if (op === 'select') {
      this.reads += 1;
      return { data: rows.filter(match).map(row => ({ ...pick(row) })) as never, error: null };
    }
    // Every write is checked against a copy first, so a refused call changes nothing, as in a database statement.
    const before = structuredClone(this.tables);
    try {
      let touched: Row[] = [];
      if (op === 'insert') touched = (args.rows ?? []).map(row => this.insertOne(table, { ...row }));
      if (op === 'update') touched = rows.filter(match).map(row => this.updateOne(table, row, args.patch ?? {}));
      if (op === 'delete') touched = rows.filter(match).map(row => this.deleteOne(table, row));
      this.writes.push({ op, table, rows: touched.length });
      return { data: (returning ? touched.map(pick) : null) as never, error: null };
    } catch (e) {
      this.tables = before;
      return fail((e as Error).message, (e as Error & { code?: string }).code ?? '23514');
    }
  }

  private versionStatus(id: unknown): string {
    const v = this.tables.item_versions!.find(row => row.id === id);
    if (!v) throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    return String(v.status);
  }

  private complete(version: Row) {
    const item = this.tables.items!.find(row => row.id === version.item_id)!;
    const choices = this.tables.item_choices!.filter(row => row.item_version_id === version.id);
    const answers = this.tables.item_answers!.filter(row => row.item_version_id === version.id);
    const right = answers.filter(row => row.is_correct).length;
    if (version.source_id == null) throw new Error('a version needs its source before it is published');
    if (choices.length < 2 || choices.length > 5) throw new Error('a published version needs two to five choices');
    if (answers.length !== choices.length) throw new Error('every choice needs an answer row with its rationale before publishing');
    if ((item.type === 'single' && right !== 1) || (item.type === 'sata' && right < 1)) throw new Error('the number of right answers does not fit the question type');
    if (this.tables.item_versions!.some(row => row.item_id === version.item_id && row.status === 'published' && row.id !== version.id)) {
      throw Object.assign(new Error('duplicate key value violates unique constraint "item_versions_one_published_idx"'), { code: '23505' });
    }
  }

  private insertOne(table: string, row: Row): Row {
    const rows = this.tables[table]!;
    const unique = (test: (other: Row) => boolean) => {
      if (rows.some(test)) throw Object.assign(new Error(`duplicate key value violates unique constraint on ${table}`), { code: '23505' });
    };
    if (table === 'concepts' || table === 'sources') {
      row.id ??= randomUUID();
      row.published ??= false;
      unique(other => other.slug === row.slug);
    } else if (table === 'items') {
      row.id ??= randomUUID();
      unique(other => other.id === row.id);
      if (!this.tables.concepts!.some(c => c.id === row.concept_id)) throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    } else if (table === 'item_versions') {
      row.id ??= randomUUID();
      row.status ??= 'draft';
      unique(other => other.item_id === row.item_id && other.version === row.version);
      if (!this.tables.items!.some(i => i.id === row.item_id)) throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
      if (row.status === 'published') this.complete(row);
    } else {
      if (this.versionStatus(row.item_version_id) !== 'draft') throw new Error('choices and answers can change only while the version is a draft');
      unique(other => other.item_version_id === row.item_version_id && other.choice_id === row.choice_id);
      if (table === 'item_answers' && !this.tables.item_choices!.some(c => c.item_version_id === row.item_version_id && c.choice_id === row.choice_id)) {
        throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
      }
    }
    rows.push(row);
    return row;
  }

  private updateOne(table: string, row: Row, patch: Row): Row {
    if (table === 'item_versions') {
      const next = { ...row, ...patch };
      if (row.status !== 'draft' && (next.stem !== row.stem || next.source_id !== row.source_id)) {
        throw new Error('a published or retired version cannot be edited; make a new version');
      }
      if (row.status === 'retired' && next.status !== 'retired') throw new Error('a retired version cannot come back');
      if (row.status === 'published' && next.status === 'draft') throw new Error('a published version cannot go back to draft');
      if (next.status === 'published' && row.status !== 'published') this.complete(next);
    }
    if (table === 'item_choices' || table === 'item_answers') {
      if (this.versionStatus(row.item_version_id) !== 'draft') throw new Error('choices and answers can change only while the version is a draft');
    }
    Object.assign(row, patch);
    return row;
  }

  private deleteOne(table: string, row: Row): Row {
    if (table === 'item_choices' || table === 'item_answers') {
      if (this.versionStatus(row.item_version_id) !== 'draft') throw new Error('choices and answers can change only while the version is a draft');
    } else {
      throw new Error(`fake: the importer never deletes from ${table}`);
    }
    this.tables[table] = this.tables[table]!.filter(other => other !== row);
    if (table === 'item_choices') {
      this.tables.item_answers = this.tables.item_answers!.filter(a => !(a.item_version_id === row.item_version_id && a.choice_id === row.choice_id));
    }
    return row;
  }
}
