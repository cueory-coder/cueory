/**
 * The sodium-potassium pump (visuals kit, first batch; D-72, D-81). Drawn only from
 * content/visuals/sodium-potassium-pump.json: every word is one of its labels and every part names the depiction it
 * shows (`data-depiction`), which the unit tests check both ways.
 *
 * Sodium is a circle and potassium a square, named in a key, so the two ions differ by shape and words, never by color
 * alone. "More" is shown as more of an ion on one side than the other; the drawing has no counts, no ratio and no ATP,
 * because the book states none.
 */
import type { ReactNode } from 'react';
import type { Visual } from '../sources';
import type { DrawingStep } from '../drawing';
import { ArrowHead, Label, type LabelProps } from './parts';

export const steps: readonly DrawingStep[] = [
  {
    id: 'two-sides',
    caption: [['sodium'], ['potassium'], ['cell-membrane']],
    depictions: ['more-sodium-outside', 'more-potassium-inside'],
  },
  {
    id: 'pump',
    caption: [['pump', 'uses-energy'], ['active-transport'], ['against-gradient']],
    depictions: ['pump-in-membrane', 'lower-to-higher', 'energy-needed'],
  },
];

const WIDTH = 360;
const HEIGHT = 560;

type Point = readonly [number, number];

/** Where the ions sit. More sodium outside the cell and more potassium inside it, as the book states. */
export const ions: { sodium: { outside: Point[]; inside: Point[] }; potassium: { outside: Point[]; inside: Point[] } } = {
  sodium: {
    outside: [[40, 112], [84, 150], [128, 104], [150, 176], [60, 186], [326, 150], [292, 188], [172, 120]],
    inside: [[96, 330], [300, 372]],
  },
  potassium: {
    outside: [[40, 152], [110, 190]],
    inside: [[44, 290], [92, 372], [140, 300], [164, 360], [292, 296], [326, 336], [52, 344], [252, 384]],
  },
};

function Sodium({ at: [x, y] }: { at: Point }) {
  return <circle data-ion="sodium" cx={x} cy={y} r="7" strokeWidth="2" className="fill-surface stroke-ink" />;
}

function Potassium({ at: [x, y] }: { at: Point }) {
  return <rect data-ion="potassium" x={x - 6.5} y={y - 6.5} width="13" height="13" strokeWidth="2" className="fill-ink stroke-ink" />;
}

/** A plain lightning bolt: the energy symbol. */
function Bolt({ x, y }: { x: number; y: number }) {
  return <path d={`M${x + 3} ${y} L${x - 7} ${y + 15} H${x} L${x - 3} ${y + 28} L${x + 9} ${y + 10} H${x + 2} Z`} className="fill-highlight stroke-ink" strokeWidth="1.5" />;
}

interface Props {
  visual: Visual;
  /** How many steps are on screen: 1 shows the first step, `steps.length` (the default) shows the whole drawing. */
  shown?: number;
  /** Prefix for the drawing's marker ids, so two copies on one page don't share them. */
  idPrefix?: string;
}

export default function SodiumPotassiumPump({ visual, shown = steps.length, idPrefix = 'sodium-potassium-pump' }: Props) {
  const arrow = `${idPrefix}-arrow`;
  const text = (id: string, x: number, y: number, options: Omit<LabelProps, 'visual' | 'id' | 'x' | 'y'> = {}): ReactNode => (
    <Label visual={visual} id={id} x={x} y={y} {...options} />
  );

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-auto w-full max-w-md"
      aria-hidden="true"
      focusable="false"
      data-visual={visual.id}
    >
      <defs>
        <ArrowHead id={arrow} />
      </defs>

      {/* Step 1: the two sides of the cell membrane, with more sodium outside and more potassium inside. */}
      <g data-depiction="more-sodium-outside more-potassium-inside">
        <rect x="8" y="40" width="344" height="172" rx="12" strokeWidth="1.5" className="fill-page stroke-line" />
        {text('ecf', 20, 66, { strong: true })}
        <rect x="8" y="244" width="344" height="172" rx="12" strokeWidth="1.5" className="fill-surface stroke-line" />
        {text('icf', 20, 404, { strong: true })}
        <rect x="8" y="212" width="344" height="32" className="fill-surface" />
        <line x1="8" y1="212" x2="352" y2="212" strokeWidth="2" className="stroke-ink" />
        <line x1="8" y1="244" x2="352" y2="244" strokeWidth="2" className="stroke-ink" />
        {text('cell-membrane', 20, 233, { size: 13 })}
        <g data-depiction="more-sodium-outside">
          {ions.sodium.outside.map((at) => <Sodium key={at.join()} at={at} />)}
          {ions.sodium.inside.map((at) => <Sodium key={at.join()} at={at} />)}
        </g>
        <g data-depiction="more-potassium-inside">
          {ions.potassium.outside.map((at) => <Potassium key={at.join()} at={at} />)}
          {ions.potassium.inside.map((at) => <Potassium key={at.join()} at={at} />)}
        </g>
        <Sodium at={[20, 446]} />
        {text('sodium', 36, 451, { size: 14 })}
        <Potassium at={[190, 446]} />
        {text('potassium', 206, 451, { size: 14 })}
      </g>

      {/* Step 2: the pump in the membrane, carrying each ion toward the side where it is higher, using energy. */}
      {shown >= 2 && (
        <g data-depiction="pump-in-membrane lower-to-higher energy-needed">
          {text('active-transport', 8, 24, { size: 17, strong: true })}
          <g data-depiction="pump-in-membrane">
            <rect x="196" y="190" width="64" height="76" rx="16" strokeWidth="2.5" className="fill-page stroke-ink" />
            {text('pump', 344, 100, { size: 14, max: 18, anchor: 'end', strong: true })}
            <path d="M300 120 L248 188" fill="none" strokeWidth="1" className="stroke-ink-soft" />
          </g>
          <g data-depiction="lower-to-higher">
            <Sodium at={[212, 300]} />
            <path d="M212 290 V150" fill="none" strokeWidth="2" className="stroke-ink" markerEnd={`url(#${arrow})`} />
            <Potassium at={[244, 150]} />
            <path d="M244 160 V300" fill="none" strokeWidth="2" className="stroke-ink" markerEnd={`url(#${arrow})`} />
            {text('against-gradient', 8, 486, { size: 14 })}
          </g>
          <g data-depiction="energy-needed">
            <Bolt x={228} y={214} />
            <Bolt x={20} y={510} />
            {text('uses-energy', 40, 530, { size: 14 })}
          </g>
        </g>
      )}
    </svg>
  );
}
