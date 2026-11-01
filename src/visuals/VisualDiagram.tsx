/**
 * A drawn diagram as students will see it (D-81): the step player, the drawing, a written description of everything it
 * shows and its credit. It refuses a draft unless `allowDraft` is set, which only the review screenshots in the tests
 * use, so a draft can never reach a page (docs/VISUALS.md, "Review and release").
 */
import DiagramPlayer from './DiagramPlayer';
import { describedParts, playerSteps } from './drawing';
import { drawings } from './drawings';
import { creditsFor, notesFor, type Visual } from './sources';

interface Props {
  visual: Visual;
  /** Only for the review sheet's screenshots in tests. Pages never set it. */
  allowDraft?: boolean;
}

export default function VisualDiagram({ visual, allowDraft = false }: Props) {
  const drawing = drawings[visual.id];
  if (!drawing || (visual.status !== 'approved' && !allowDraft)) return null;
  const { Component, steps } = drawing;
  const descriptionId = `${visual.id}-described`;

  return (
    <div className="min-w-0 max-w-full">
      <DiagramPlayer title={visual.title} steps={playerSteps(visual, steps)}>
        {({ index }) => <Component visual={visual} shown={index + 1} idPrefix={visual.id} />}
      </DiagramPlayer>
      <div id={descriptionId} className="mt-3 text-sm text-ink-soft">
        <p className="font-medium text-ink">what the drawing shows</p>
        <ul className="mt-1 list-disc pl-5">
          {describedParts(visual, steps).map((part) => (
            <li key={part}>{part}</li>
          ))}
        </ul>
        {notesFor(visual).map((note) => (
          <p key={note} className="mt-2">{note}</p>
        ))}
        {creditsFor(visual).map((book) => (
          <p key={book.book} className="mt-2">
            {book.credit}{' '}
            <a className="underline" href={book.licenseUrl} rel="license noopener">
              the license
            </a>
          </p>
        ))}
      </div>
    </div>
  );
}
