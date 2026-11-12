# What is in the content folder?

The `content/` folder holds files Cueory uses for lessons, study activities, and sample games. This repository is **public**, so anyone can read files committed here.

**Never commit real questions, answer keys, rationales, private reviewer notes, student information, or unreleased clinical lessons here.** Keep private material in the approved private content and review system. The `batches/` folder is only for local work and is ignored by Git.

## Folder guide

This table includes every folder directly inside `content/` and every subfolder under `content/games/`.

| Folder | What belongs there | Where students see it | What may be committed |
| --- | --- | --- | --- |
| `content/batches/` | Local folders used to review content before publication. | Not shown on the website. | Nothing private. Keep review batches local and out of Git. |
| `content/breaks/` | Everyday break suggestions. | Breaks page (`/breaks`) | Labeled sample ideas, not private records. |
| `content/cards/` | A card deck for each lesson. | `/learn/[lesson]/cards`, learn mode, and matching | Labeled samples, placeholders, or approved public cards. |
| `content/curriculum/` | Draft curriculum plans and objectives in CSV files. | Planning only. Not a student lesson page. | Planning drafts only, with no private questions or answers. |
| `content/fill-in/` | Fill-in-the-blank sample activities. | `/learn/[lesson]/fill-in` | Labeled samples only. |
| `content/games/` | Parent folder for sample game collections listed below. | Daily games page (`/play`) and linked game pages | Keep public sample games in their own subfolders. |
| `content/games/cueword/` | Small crossword sample files. | Crossword on `/play` | Labeled samples only. No unreleased clues or answers. |
| `content/games/hello-cards/` | Conversation starter cards. | `/play/hello-cards` when the page is enabled | Draft samples or content approved for public release. |
| `content/games/pulse/` | Five-letter word game sample files. | Pillo on `/play` | Labeled samples only. No real daily puzzle answers. |
| `content/games/stat/` | Clearly marked placeholder quiz items. | `/play/stat` on permitted preview builds | Labeled sample text only. Never real questions or answer keys. |
| `content/games/suture/` | Word-search grids and word paths. | Word path on `/play` | Labeled samples only. No unreleased words or clues. |
| `content/games/triage/` | Older sorting-game sample files. | Not the current Sudoku game. Kept for older tests. | Labeled samples only. |
| `content/label-it/` | Sample images and labels for identifying pictured parts. | `/learn/study-skills/label-it` | Labeled samples with an image credit. Real images need documented rights. |
| `content/lessons/` | The text and order of each lesson. | `/learn` and `/learn/[lesson]` | Labeled samples or placeholders, or approved public lessons. Never unreleased drafts. |
| `content/organizer/` | Sample activities for placing items into groups. | `/learn/[lesson]/organizer` | Labeled samples only. |
| `content/questions/` | Sample question files used to test the study page. | `/learn/study-skills/questions` | Labeled samples only. Real question banks and keys stay private. |
| `content/videos/` | Video details for a lesson, such as its title and video ID. | Lesson pages when a video is published | Labeled draft placeholders or approved public video details. |
| `content/visuals/` | Source records for diagrams and body models. | Visual previews and approved lesson visuals | Draft or approved public records with documented sources and rights. |

## Before adding content

1. Find the folder above that matches what you are making.
2. Read [Content formats](CONTENT-FORMAT.md) for the required fields.
3. Keep real questions and answer data in the **private** review and database system, never in this public repository.
4. Ask Claude to run the project checks and review the change before any publication.

The folder list is checked by `tests/unit/content-map-doc.test.ts`. If a new folder appears or an old one is removed, that test will require this table to be updated.
