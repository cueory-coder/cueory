# Real content for the daily games: the plan

**Status: a draft for Christian. Nothing here is switched on, and no database has been changed.**

This page explains how real, reviewed content would reach the daily games: stat's fifteen questions a day, and the
daily word, crossword and word path. It ends with the decisions that are yours. No clinical content is in this
repository, and none is needed to read this.

## Where things stand today

- stat, the word game (pillo), the crossword and word path all run on labeled samples. Sudoku needs no content: its
  grids are numbers made in the browser.
- The question bank on staging is empty (checked 2026-11-11: no questions, none published). The database has
  everything it needs to hold questions and to check answers, but nothing that says "these are today's fifteen", and
  nowhere to keep puzzles.
- The batch checker and the importer (`docs/BATCHES.md`) already load reviewed questions. Nothing loads puzzles yet.

## What this pull request adds

| Piece | Where | State |
| --- | --- | --- |
| Database change for stat's daily set | `supabase/migrations/20261112090000_daily_stat_sets.sql` | Draft. Not applied anywhere. |
| Database change for daily puzzles | `supabase/migrations/20261112090100_daily_puzzles.sql` | Draft. Not applied anywhere. |
| Database tests for both | `supabase/tests/database/daily_sets_test.sql` | Written. Not run yet (see "Checks"). |
| stat reading today's real set | `src/islands/statdaily.ts`, `src/islands/StatToday.tsx` | Built, switched off. |
| The switch | `statUsesRealQuestions` in `src/config/games.ts` | Off. |
| Tests with a pretend database | `tests/unit/statdaily.test.ts` | Passing. |

While the switch is off, the stat page is exactly what it is today.

Not built yet, on purpose, until you have decided the points below: the tool that loads puzzle batches, and the
crossword, word path and word game reading their real puzzle of the day.

## How stat's daily set would work

1. You load and publish questions the way `docs/BATCHES.md` already describes. There is no extra step for stat.
2. Any published question with one right answer and exactly four choices (a to d) can be picked. stat has four
   buttons, so five-choice and select-all questions are left out.
3. The first student to open stat on a given day causes that day's fifteen to be chosen. Questions never used come
   first, then the ones used longest ago. Everyone gets the same fifteen that day.
4. "Today" is the student's own calendar day, like the other daily games. Only yesterday, today and tomorrow (by world
   time) can be asked for, so nobody can read ahead.
5. The page receives the question text and the four choices. It never receives an answer. If a reply ever carried
   anything extra, the page refuses the whole reply.
6. At the end of the round each answer is checked by the same permission-checked function the practice questions use
   (`check_answer`). A question the student left blank is not sent.
7. If a question in today's set is withdrawn, its place is filled the next time someone opens stat.
8. With fewer than fifteen usable questions, the page says today's set isn't ready and nothing is saved.

## How daily puzzles would work

The word game, the crossword and word path are different from questions: the puzzle *is* its own answer (the word, the
filled grid, the hidden words), and it is solved in the browser. So the rule is the one already agreed (D-61): a
puzzle reaches the browser on its day and never before, and the store of future puzzles never reaches it.

- A private table holds every reviewed puzzle. The website cannot read it.
- One function hands out one game's puzzle for one day, chosen the same way as stat's set, with the same
  yesterday-today-tomorrow limit.
- A published puzzle can't be edited. A fix is a new puzzle, and the old one is retired.

## Guests and signed-in students

| | Guest | Signed in |
| --- | --- | --- |
| stat with real questions | Sees "create a free account or sign in". Nothing is fetched. | Plays today's fifteen. |
| Real daily puzzles (as drafted) | Same as stat. | Plays today's puzzle. |
| Sudoku | Plays. | Plays. |

stat follows the existing rule that real questions need an account (D-86), because answers are checked on the server
and the hourly limit is counted per account. Whether puzzles should also need an account is decision 5.

## How you would load content

**Questions for stat.** Nothing new: follow "Importing a passed batch" in `docs/BATCHES.md`, with `--publish`. Once
at least fifteen published questions have one right answer and four choices, stat has a set.

**Puzzles.** Not ready. The plan is the same shape as question batches: a folder on your computer under
`content/batches/` (never in the repository), a checker that runs each game's own rules on every puzzle, and an import
command that shows what it would do unless you add `--apply`. I will build it after decisions 5 and 6.

## Decisions for you

1. **Which questions stat may use.** Drafted: every published question with one right answer and four choices. The
   page promises "hard" questions, but the database has no way to mark a question hard or easy. Options: (a) accept
   every such question, (b) add a "use in stat" mark you set per question in the batch. I recommend (a) to start and
   (b) once the bank is big enough to be picky.
2. **Who chooses each day's fifteen.** Drafted: chosen automatically, least recently used first. The other way is for
   you to plan days ahead. The draft allows both, but there is no tool for planning yet. I recommend automatic.
3. **Repeats.** A question comes back only once every other usable question has had its turn. With 15 questions the
   same set repeats daily; with 150, each question returns about every ten days. Is there a smallest bank size you want
   before stat opens? I suggest at least 105 (a week without a repeat).
4. **Do stat answers count as study?** As drafted, each stat answer is saved like a practice answer, so it appears in
   the student's progress and export, and counts toward the limit of 200 checks an hour (about thirteen rounds).
   The alternative is a separate daily-game record, which needs more database work. I recommend keeping it as drafted.
5. **Guests and real puzzles.** Drafted: account needed, like questions. Opening them to guests is a one-line change,
   and it would match your earlier choice to let guests use real cards and sorting (D-130). The cost: anyone could
   fetch the day's puzzle without an account. Your call.
6. **Do puzzles go through the five-reviewer check?** Clues are clinical text, so I assume yes, with the same
   reviewer files as questions. Please confirm, or say what review a puzzle needs.
7. **Rationales after a round.** The server already sends each choice's rationale when it checks an answer. stat's
   "your answers" list doesn't show them yet. Show them, or keep the list short?
8. **"Practice again" with real questions.** After a round the student has seen the key. As built, practice again
   replays the same fifteen and is marked as practice, so it doesn't count as the day's result. Keep, or remove the
   button in real mode?
9. **Approval to apply.** These are database changes, so they wait for you. The order would be: staging first, run
   the database tests, load a batch on staging, turn the switch on in a staging-only pull request, you play it there,
   and only then the live database.

## Checks

- Run and passing: the type check, all unit tests, the site build, and stat's browser tests with the switch off.
- Not run: the database tests in `supabase/tests/database/daily_sets_test.sql`. They need a throwaway local database
  (`supabase test db`), which the machine this was written on doesn't have. They must pass before either database
  change is applied anywhere.
- Not tested in a browser: stat with the switch on. That needs the database change applied on staging first.
