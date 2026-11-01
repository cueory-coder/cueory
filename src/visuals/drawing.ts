/**
 * Helpers for the visuals kit's 2D drawings (Task 6, D-81). Every word a drawing shows is a label from its source file
 * (`labelText`), and every part it draws names the depiction it shows, so a test can prove the drawing shows nothing its
 * source file doesn't state. Plain functions with no browser imports, so they can be unit tested.
 */
import { labelText, type Visual } from './sources';
import type { DiagramStep } from './steps';

/** One step of a drawing: which label ids its caption reads, and which depictions it adds to the picture. */
export interface DrawingStep {
  id: string;
  /**
   * The caption, built only from labels: each inner list is joined with ": " (a label and what it says about it), and
   * the groups are joined with " · ". No other words are added.
   */
  caption: readonly (readonly string[])[];
  depictions: readonly string[];
}

/** How long a step stays up when the student presses play. */
export const STEP_MS = 4500;

/** A step's caption, made only from the visual's own labels. */
export function captionFrom(visual: Pick<Visual, 'id' | 'labels'>, caption: DrawingStep['caption']): string {
  return caption.map((group) => group.map((labelId) => labelText(visual, labelId)).join(': ')).join(' · ');
}

/** The steps the diagram player shows, with captions made only from labels. */
export function playerSteps(visual: Pick<Visual, 'id' | 'labels'>, steps: readonly DrawingStep[]): DiagramStep[] {
  return steps.map((step) => ({ id: step.id, caption: captionFrom(visual, step.caption), durationMs: STEP_MS }));
}

/** The written description under a drawing: what it shows, in the words of the source file that Christian approved. */
export function describedParts(
  visual: Pick<Visual, 'id' | 'depictions'>,
  steps: readonly DrawingStep[],
): string[] {
  const ids = [...new Set(steps.flatMap((step) => step.depictions))];
  return ids.map((id) => {
    const depiction = visual.depictions.find((candidate) => candidate.id === id);
    if (!depiction) {
      throw new Error(`The drawing of "${visual.id}" shows "${id}", which isn't a depiction in content/visuals/${visual.id}.json.`);
    }
    return depiction.what;
  });
}

/**
 * Breaks a label into lines of at most `maxChars` characters, at spaces only, so long labels fit a narrow drawing. The
 * words and their order never change.
 */
export function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
