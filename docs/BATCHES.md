# Review batches and the batch checker

A batch is one folder of CSV files: a set of questions, its answer key, and what each reviewer said. The checker
reads the folder, runs mechanical checks and writes four files: `passed.csv`, `failed.csv`, `pending.csv` and `report.md`.

The checker only checks structure and agreement. It never judges whether a clinical fact is right; that is the
reviewers' and Christian's job.

## Where batches live

Put each batch in its own folder under `content/batches/`, for example `content/batches/2026-11-fundamentals-01/`.
Everything in `content/batches/` stays on your computer: git ignores it, because answer keys and reviewer results must
never go in the repository (DECISIONS.md, D-07 and D-26).

## Running it

```
npm run check-batch -- content/batches/2026-11-fundamentals-01
```

The four result files are written into the same folder. Add `--out <folder>` to write them somewhere else, or
`--check-links` to also ask every source's website whether the page exists. That needs the internet, and problems it
finds show up as warnings in the report.

The command prints a one-line summary and finishes with:

| Exit code | Meaning |
| --- | --- |
| 0 | Every item passed. |
| 1 | Some item failed or is still pending. `failed.csv`, `pending.csv` and `report.md` say which and why. |
| 2 | The batch itself has a problem (a missing or malformed file, too few reviewers, a repeated id), so no item can pass. |

If a file is missing, malformed or unreadable (for example a folder where a file should be), the checker deletes any `passed.csv`, `failed.csv` and `pending.csv` from an earlier run and
writes a `report.md` that says the batch was not checked, so an old approval can never be mistaken for the current one.

## Files in a batch folder

All files are CSV with a header row, saved as UTF-8 (the default "CSV UTF-8" export in Excel, Numbers or Google
Sheets works). Ids may use letters, digits, `.`, `_` and `-`, up to 64 characters. In list columns, separate values
with `;`.

### `items.csv`: one row per question

| Column | What goes in it |
| --- | --- |
| `item_id` | Unique id for the question, e.g. `fund-0001`. |
| `concept_id` | The concept the question tests. |
| `stem` | The question text. |
| `choice_a` … `choice_d` | The four answer choices. |
| `choice_e` | Optional column. Fill it only on questions with a fifth choice. |
| `rationale` | Why the right answer is right. |
| `fact_ids` | The facts the question relies on (`f-001;f-014`). At least one. |
| `source_ids` | The sources the question cites (`s-01`). At least one. |

### `key.csv`: the answer key

| Column | What goes in it |
| --- | --- |
| `item_id` | The question. |
| `answer` | The correct letter, `A` to `E`. |

### `facts.csv` and `sources.csv`

| File | Columns |
| --- | --- |
| `facts.csv` | `fact_id`, `source_id` (the source the fact comes from). Extra columns, like the fact's text, are allowed. |
| `sources.csv` | `source_id`, `url` (must start with `https://`). Extra columns, like a title, are allowed. |

### `reviewers/<name>.csv`: one file per reviewer

At least five reviewer files. The file name must be one of these reviewers, in lower case: `gpt1`, `gpt2`, `gpt3`,
`gemini`, `claude_sonnet`, `codex`, `claude_final`, `christian` (for example `reviewers/gpt1.csv`). Any other name is a
batch problem (exit code 2), so a typo like `gtp1.csv` is caught instead of quietly counting. No particular reviewer is
required.

| Column | What goes in it |
| --- | --- |
| `item_id` | The question. |
| `answer` | The letter this reviewer picked when answering the question themselves. |
| `verdict` | `pass`, `fail` or `pending` (the review isn't finished yet). |
| `notes` | Optional. Not read by the checker. |

## What makes a question pass

A question passes only when every one of these is true:

- Every reviewer reviewed it, picked the same letter as the key, and marked it `pass`. All must agree; a majority is
  not enough.
- The key's answer is one of the question's choices.
- The question, the rationale and every choice are filled in, and no two choices are the same.
- No other question in the batch has the same text (ignoring capitals and spacing).
- It cites at least one fact and one source. Every one exists, and every source link is a proper `https://` address.

A question that has nothing wrong except that some reviewer's verdict is still `pending` is **pending**: it goes in
`pending.csv`, is counted separately in the report, and never passes. If it is also wrong in some other way, it
fails.

## Batch warnings

Warnings appear in the report but don't fail any question:

- **Answer balance.** If one letter is the right answer much more or less often than an even share (more than 10
  percentage points off), the report says so. Only judged on batches of 20 or more questions.
- **Unreachable links** (only with `--check-links`).

## Result files

- `passed.csv`: `item_id`, `concept_id` of every question that passed. The importer (Task 2) will read this.
- `failed.csv`: `item_id`, `concept_id` and `reasons`, all reasons in one cell separated by `;`.
- `pending.csv`: `item_id`, `concept_id` and `waiting_for` (which reviewers haven't finished), separated by `;`.
- `report.md`: a plain-language summary with the balance table and each reviewer's agreement with the key.

The result files contain ids and reasons only, never question text. Any cell that a spreadsheet app could mistake for a
formula is made safe before writing.
