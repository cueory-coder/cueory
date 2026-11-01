# Med-surg I visuals kit (Task 6)

Cueory's own pictures for lessons and videos, so we never use other people's: a 3D body, animated 2D diagrams we draw
ourselves, and disease overlays on the healthy versions (Christian's decision, 2026-10-31; D-56).

Targets: the first visuals by about **14 November 2026**, the full kit by about **12 December 2026**.

## What's in the kit, in build order

| Order | Topic | 2D diagrams | 3D | Overlays ("simplified for learning") |
| --- | --- | --- | --- | --- |
| 1 | Fluids and electrolytes | fluid compartments; osmosis and fluid shifts; sodium-potassium pump | | |
| 2 | Heart and ECG | cardiac conduction matched to an ECG strip | heart: chambers, valves, coronary arteries, conduction pathway | plaque-narrowed artery; heart failure with pulmonary congestion |
| 3 | Lungs and gas exchange | alveolar gas exchange | lungs and airway | COPD vs healthy alveoli; pneumonia |
| 4 | Diabetes and insulin | insulin and glucose entering a cell | endocrine glands | diabetic foot changes |
| 5 | Kidneys and nephron | nephron filtration and reabsorption | kidneys and urinary tract | |
| 6 | GI | | GI tract with liver, pancreas and gallbladder | peptic ulcer |
| 7 | Skin and pressure injuries | | | skin layers and pressure-injury stages 1 to 4 |
| 8 | Fractures | | skeleton and major joints | fracture types |
| later | | acid-base and ABG logic; inflammation and clotting cascades (simplified) | brain and spinal cord basics | |

Each visual names the lesson it serves by its `lesson_id` from the [lesson map](curriculum/README.md). The first batch
serves `U01-T01-L01` (compartments), `U01-T01-L02` (osmosis, diffusion, active transport) and `U01-T01-L05` (IV
fluids).

## Sources: every label and depiction is cited

- A visual shows only what a cited open source states. Nothing is drawn or labeled from memory, and anatomy is never
  invented. Overlays carry the words "simplified for learning".
- Each visual has one source file, `content/visuals/<visual-id>.json`. For every label and every depiction (a shape,
  an arrow, a direction of movement, a number) it gives the source's exact words, the book, the section and the page
  address.
- **Text source: Open RN *Nursing Fundamentals, 2nd Edition*** (edited by Kim Ernstmeyer and Elizabeth Christman,
  WisTech Open, CC BY 4.0). WisTech Open's page for the book says: "You must give appropriate credit to WisTech Open,
  provide a link to the license, and indicate if changes were made." So every visual that quotes it shows "Words
  adapted from Nursing Fundamentals, 2nd Edition, edited by Kim Ernstmeyer and Elizabeth Christman (WisTech Open), CC
  BY 4.0.", linked to the license. Its figures carry their own licenses, so we cite its text, never copy its pictures.
- **OpenStax *Anatomy and Physiology 2e* is on hold** (D-57). OpenStax's help page says its books are CC BY-NC-SA
  (noncommercial, share-alike), not CC BY, and the book's pages say it may not be ingested into AI tools without
  OpenStax's written permission. It is used only if Christian decides so.
- Nothing licensed NonCommercial is used anywhere in the kit, because Cueory takes tips and plans videos.

## Files

| What | Where |
| --- | --- |
| A visual's labels, sources and review status | `content/visuals/<visual-id>.json` |
| The allowed books and the checks on every source file | `src/visuals/sources.ts` |
| A 2D diagram's drawing (SVG and its animation) | `src/visuals/` |
| 3D models (compressed glTF) and their license | `public/models/` |
| Review sheets, one per batch | the batch's pull request |

A visual's source file looks like this (shortened):

```json
{
  "id": "fluid-compartments",
  "title": "body fluid compartments",
  "kind": "diagram",
  "lessonIds": ["U01-T01-L01"],
  "status": "draft",
  "labels": [{ "id": "icf", "text": "intracellular fluid (ICF)", "source": "orn-15-2-icf" }],
  "depictions": [{ "id": "two-areas", "what": "fluid drawn in two areas: inside cells and outside cells", "source": "orn-15-2-areas" }],
  "sources": [
    {
      "id": "orn-15-2-icf",
      "quote": "Intracellular fluids (ICF) are found inside cells and are made up of protein, water, electrolytes, and solutes.",
      "book": "Open RN Nursing Fundamentals 2e",
      "section": "15.2 Basic Fluid and Electrolyte Concepts",
      "url": "https://wtcs.pressbooks.pub/nursingfundamentals/chapter/15-2-basic-fluid-and-electrolyte-concepts/",
      "license": "CC BY 4.0",
      "retrieved": "2026-11-01"
    }
  ]
}
```

`kind` is `diagram`, `model` (3D) or `overlay`; every overlay shows the words "simplified for learning". `retrieved`
is the day the words were copied from the page.

The build checks every source file and stops with a plain message when one breaks a rule:
- every label and depiction points to a source in the file, and every source is used;
- each source quotes an allowed book, links to the page it quotes inside that book's site, and gives the book's
  license;
- ids are unique, and every lesson id exists in the lesson map (the unit tests check this one);
- a drawing gets its label text only from the file, so a label that isn't in the file stops the build.

The only allowed book so far is Open RN *Nursing Fundamentals, 2nd Edition*. A new book joins the list in
`src/visuals/sources.ts` only after its license is checked, and nothing NonCommercial ever joins.

## Review and release

- Visuals with labels are content: their pull requests touch `content/`, so they always wait for Christian
  (`needs-christian`) and never release on their own.
- They go to him in batches. Each batch's pull request has a one-page review sheet: every visual as a picture, its
  labels, and each label's quote and link, so he can check them side by side.
- A draft never reaches the live site. Only a visual whose file says `"status": "approved"` can appear on a page, and
  that change is part of the pull request Christian merges.

## Animated 2D diagrams

- Drawn by us as SVG, in brand colors from `src/styles/tokens.css` only, with Inter for labels. Labels are real text,
  so they stay sharp and screen readers can read them.
- Each one has a written description, and color is never the only way to tell parts apart: labels, patterns or
  arrows carry the meaning too.
- Reduced motion: the diagram shows its key steps as still pictures with previous and next buttons instead of playing.
- Video frames for shorts: one command will render a diagram at 1080 × 1920 (portrait) and 1920 × 1080 (landscape)
  and save numbered frames that any video editor can join into a clip.

## 3D body

- Geometry from a free 3D atlas, exported only for the structures a lesson needs. Which atlas waits for Christian
  (STATUS):
  - Z-Anatomy (CC BY-SA 4.0): our changed models, and the videos that show them, must be shared under the same
    license. Its README lists two NonCommercial models among its parts (an inner ear and a kidney), which stay out.
  - BodyParts3D, the database Z-Anatomy is built on: CC BY 4.0 since its license page was updated on 27 February 2025,
    so credit is all it asks.
- BodyParts3D's parts list has no conduction pathway (SA node, AV node, bundle of His, bundle branches, Purkinje
  fibers), and whether Z-Anatomy added one isn't confirmed yet. If neither has it, we draw it on the heart ourselves,
  from a cited source.
- Pipeline: Blender in the background exports the named structures, then gltfpack compresses them with meshopt and
  keeps each structure separate (D-58). Models are restyled in brand colors.
- Viewer: a three.js React island. One body system loads at a time; a system filter and layer peeling (skin to bone)
  with buttons; rotate and zoom by drag, pinch, buttons and the keyboard; no auto-rotate with reduced motion.
- Phone budget per system: at most 3 MB to download and 150,000 triangles, and it must stay smooth on a mid-range
  phone. The viewer loads only when a student opens it.
- Credit under every 3D view, for example: "3D model: Cueory, adapted from BodyParts3D, © The Database Center for Life
  Science, CC BY 4.0."
