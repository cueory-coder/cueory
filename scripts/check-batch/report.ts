/** Builds the plain-language report.md and the passed.csv / failed.csv contents from a checker result. */
import type { BatchResult } from './check.ts';
import { toCsv } from './csv.ts';

/** Keeps file-provided text from breaking the Markdown layout (backticks, line breaks). */
const md = (text: string): string => text.replace(/[\r\n]+/g, ' ').replaceAll('`', "'");

export function passedCsv(result: BatchResult): string {
  return toCsv(
    ['item_id', 'concept_id'],
    result.passed.map((r) => ({ item_id: r.item_id, concept_id: r.concept_id })),
  );
}

export function failedCsv(result: BatchResult): string {
  return toCsv(
    ['item_id', 'concept_id', 'reasons'],
    result.failed.map((r) => ({ item_id: r.item_id, concept_id: r.concept_id, reasons: r.reasons.join('; ') })),
  );
}

export function pendingCsv(result: BatchResult): string {
  return toCsv(
    ['item_id', 'concept_id', 'waiting_for'],
    result.pending.map((r) => ({ item_id: r.item_id, concept_id: r.concept_id, waiting_for: r.waiting.join('; ') })),
  );
}

export function reportMd(result: BatchResult, batchName: string, extraWarnings: string[] = []): string {
  const total = result.passed.length + result.failed.length + result.pending.length;
  const out: string[] = [`# Batch check: ${md(batchName)}`, ''];

  if (result.batchErrors.length > 0) {
    out.push(`**Not ready.** The batch itself has problems, so no item can pass until they are fixed.`, '');
  } else {
    out.push(
      `**${result.passed.length} of ${total} items passed.** ${result.failed.length} failed and ${result.pending.length} are waiting on a reviewer.`,
      '',
    );
  }

  if (result.batchErrors.length > 0) {
    out.push('## Batch problems', '', ...result.batchErrors.map((e) => `- ${md(e)}`), '');
  }
  const warnings = [...result.warnings, ...extraWarnings];
  if (warnings.length > 0) {
    out.push('## Warnings', '', ...warnings.map((w) => `- ${md(w)}`), '');
  }

  const letters = Object.keys(result.balance).sort();
  if (letters.length > 0) {
    out.push('## Correct-answer balance (single-answer items)', '', '| Letter | Items |', '| --- | --- |');
    for (const l of letters) out.push(`| ${l} | ${result.balance[l as keyof typeof result.balance]} |`);
    out.push('');
  }
  if (result.sata > 0) {
    out.push(
      `${result.sata} select-all-that-apply ${result.sata === 1 ? 'item is' : 'items are'} scored all-or-nothing and not counted in the balance.`,
      '',
    );
  }

  const names = Object.keys(result.agreement).sort();
  if (names.length > 0) {
    out.push('## Reviewer agreement with the key', '', '| Reviewer | Matched | Answered |', '| --- | --- | --- |');
    for (const n of names) {
      const a = result.agreement[n]!;
      out.push(`| ${md(n)} | ${a.matched} | ${a.answered} |`);
    }
    out.push('');
  }

  if (result.pending.length > 0) {
    out.push('## Items waiting on a reviewer (not passed yet)', '');
    for (const p of result.pending) {
      out.push(`### \`${md(p.item_id)}\``, '', ...p.waiting.map((w) => `- ${md(w)}`), '');
    }
  }

  if (result.failed.length > 0) {
    out.push('## Items that need another look', '');
    for (const f of result.failed) {
      out.push(`### \`${md(f.item_id)}\``, '', ...f.reasons.map((r) => `- ${md(r)}`), '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}
