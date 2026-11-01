import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fluidCompartmentsFile from '../../content/visuals/fluid-compartments.json';
import { captionFrom, describedParts, playerSteps, wrapLines, type DrawingStep } from '../../src/visuals/drawing';
import FluidCompartments, { steps as fluidSteps } from '../../src/visuals/drawings/FluidCompartments';
import OsmosisFluidShifts, { steps as osmosisSteps } from '../../src/visuals/drawings/OsmosisFluidShifts';
import osmosisFile from '../../content/visuals/osmosis-fluid-shifts.json';
import pumpFile from '../../content/visuals/sodium-potassium-pump.json';
import SodiumPotassiumPump, { steps as pumpSteps } from '../../src/visuals/drawings/SodiumPotassiumPump';
import { labelText, visualProblems, type Visual } from '../../src/visuals/sources';
import { parseSteps } from '../../src/visuals/steps';

/**
 * The visuals kit's drawings (D-81) show only what their source files state: every word is a label, every part names
 * the depiction it shows, and every depiction the file promises is drawn.
 */
const drawings: { visual: Visual; steps: readonly DrawingStep[]; render: (shown?: number) => string }[] = [
  {
    visual: fluidCompartmentsFile as Visual,
    steps: fluidSteps,
    render: (shown) => renderToStaticMarkup(createElement(FluidCompartments, { visual: fluidCompartmentsFile as Visual, shown })),
  },
  {
    visual: osmosisFile as Visual,
    steps: osmosisSteps,
    render: (shown) => renderToStaticMarkup(createElement(OsmosisFluidShifts, { visual: osmosisFile as Visual, shown })),
  },
  {
    visual: pumpFile as Visual,
    steps: pumpSteps,
    render: (shown) => renderToStaticMarkup(createElement(SodiumPotassiumPump, { visual: pumpFile as Visual, shown })),
  },
];

const decode = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

/** Each `<text>` element's label id and the words it shows, with its line breaks joined back up. */
function texts(markup: string): { id: string | undefined; words: string }[] {
  return [...markup.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)].map(([, attributes, inner]) => ({
    id: /data-label="([^"]+)"/.exec(attributes!)?.[1],
    words: decode(
      [...inner!.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(([, line]) => line).join(' '),
    ),
  }));
}

function depictionsDrawn(markup: string): Set<string> {
  return new Set([...markup.matchAll(/data-depiction="([^"]+)"/g)].flatMap(([, ids]) => ids!.split(' ')));
}

describe.each(drawings)('the drawing of $visual.id', ({ visual, steps, render }) => {
  const markup = render();

  it('comes from a source file that passes its checks', () => {
    expect(visualProblems(visual)).toEqual([]);
  });

  it('shows only labels, each with its exact words', () => {
    const shown = texts(markup);
    expect(shown.length).toBeGreaterThan(0);
    for (const { id, words } of shown) {
      expect(id, `a text with no label id: "${words}"`).toBeDefined();
      expect(words).toBe(labelText(visual, id!));
    }
  });

  it('shows every label in its file', () => {
    const used = new Set(texts(markup).map(({ id }) => id));
    expect(visual.labels.filter((label) => !used.has(label.id)).map((label) => label.id)).toEqual([]);
  });

  it('draws every depiction in its file, and nothing else', () => {
    const drawn = depictionsDrawn(markup);
    expect([...drawn].sort()).toEqual(visual.depictions.map((depiction) => depiction.id).sort());
  });

  it('marks every shape with the depiction it shows', () => {
    // Every shape sits inside a group that names its depiction, apart from the patterns in <defs>.
    const body = markup.replace(/<defs>[\s\S]*?<\/defs>/, '');
    const outside = body.replace(/<g data-depiction="[^"]+"[\s\S]*<\/g>/, '');
    expect(outside).not.toMatch(/<(rect|path|circle|ellipse|line|polygon|text)\b/);
  });

  it('uses brand tokens only: no color is written into the drawing', () => {
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b(?!-)|rgb\(|hsl\(|(fill|stroke)="(?!url\(|none)[a-z]/i);
  });

  it('has steps the player accepts, captioned only with labels', () => {
    const player = parseSteps(playerSteps(visual, steps));
    expect(player).toHaveLength(steps.length);
    for (const step of steps) {
      for (const labelId of step.caption.flat()) expect(() => labelText(visual, labelId)).not.toThrow();
    }
  });

  it('adds each step\'s depictions on that step', () => {
    for (let shown = 1; shown <= steps.length; shown += 1) {
      const drawn = depictionsDrawn(render(shown));
      for (const id of steps.slice(0, shown).flatMap((step) => step.depictions)) expect(drawn.has(id)).toBe(true);
    }
    const first = depictionsDrawn(render(1));
    expect([...first].sort()).toEqual([...new Set(steps[0]!.depictions)].sort());
  });

  it('describes in words everything it draws', () => {
    const described = describedParts(visual, steps);
    expect(described.sort()).toEqual(visual.depictions.map((depiction) => depiction.what).sort());
  });
});

describe('body fluid compartments', () => {
  const visual = fluidCompartmentsFile as Visual;
  const markup = renderToStaticMarkup(createElement(FluidCompartments, { visual }));

  it('draws the ICF as 60% of the bar, as the book states', () => {
    const bars = [...markup.matchAll(/<rect x="([\d.]+)" y="54" width="([\d.]+)"/g)].map(([, x, width]) => ({
      x: Number(x),
      width: Number(width),
    }));
    expect(bars).toHaveLength(2);
    expect(bars[0]!.width / (bars[0]!.width + bars[1]!.width)).toBeCloseTo(0.6, 5);
  });

  it('puts no number on the ECF: the book\'s 40% is of body weight, not of body fluid', () => {
    expect(texts(markup).filter(({ words }) => /\d/.test(words)).map(({ id }) => id)).toEqual(['icf-share']);
  });

  it('captions its steps from labels only', () => {
    expect(captionFrom(visual, fluidSteps[0]!.caption)).toBe(
      'intracellular fluid (ICF): 60% of the volume of body fluids · extracellular fluid (ECF)',
    );
  });
});

describe('osmosis and fluid shifts', () => {
  const markup = renderToStaticMarkup(createElement(OsmosisFluidShifts, { visual: osmosisFile as Visual }));

  it('has no energy symbol: the book calls osmosis passive transport', () => {
    expect(markup).not.toMatch(/energy symbol|data-energy|⚡/);
    expect(texts(markup).map(({ id }) => id)).toContain('passive');
  });

  it('shows more solute dots on the greater-concentration side than on the lesser one', () => {
    const step1 = markup.slice(0, markup.indexOf('data-depiction="arterial-push'));
    const dots = [...step1.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="3"/g)].map(([, cx, cy]) => ({ x: Number(cx), y: Number(cy) }));
    const inside = dots.filter(({ y }) => y > 36 && y < 212);
    const lesser = inside.filter(({ x }) => x < 180).length;
    const greater = inside.filter(({ x }) => x > 180).length;
    expect(greater).toBeGreaterThan(lesser);
  });
});

describe('the sodium-potassium pump', () => {
  const markup = renderToStaticMarkup(createElement(SodiumPotassiumPump, { visual: pumpFile as Visual, shown: 1 }));
  const ionsAt = (kind: string) =>
    [...markup.matchAll(new RegExp(`data-ion="${kind}"[^>]*?(?:cy|y)="([\\d.]+)"`, 'g'))].map(([, y]) => Number(y));
  // Outside the cell is above the membrane (y < 212), inside is below it (212 < y < 416); the key sits lower down.
  const outside = (ys: number[]) => ys.filter((y) => y < 212).length;
  const inside = (ys: number[]) => ys.filter((y) => y > 244 && y < 416).length;

  it('draws more sodium outside the cell than inside', () => {
    const sodium = ionsAt('sodium');
    expect(outside(sodium)).toBeGreaterThan(inside(sodium));
  });

  it('draws more potassium inside the cell than outside', () => {
    const potassium = ionsAt('potassium');
    expect(inside(potassium)).toBeGreaterThan(outside(potassium));
  });

  it('carries sodium outward (up) and potassium inward (down)', () => {
    const full = renderToStaticMarkup(createElement(SodiumPotassiumPump, { visual: pumpFile as Visual }));
    const arrows = [...full.matchAll(/<path d="M(\d+) (\d+) V(\d+)"[^>]*marker-end/g)].map(([, x, from, to]) => ({
      x: Number(x),
      from: Number(from),
      to: Number(to),
    }));
    expect(arrows).toEqual([
      { x: 212, from: 290, to: 150 },
      { x: 244, from: 160, to: 300 },
    ]);
  });

  it('shows no numbers: the book gives no ion counts', () => {
    const words = [...markup.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(([, line]) => line);
    expect(words.filter((line) => /\d/.test(line!))).toEqual([]);
  });
});

describe('wrapLines', () => {
  it('breaks at spaces only and never changes the words', () => {
    const text = '60% of the volume of body fluids';
    const lines = wrapLines(text, 12);
    expect(lines.join(' ')).toBe(text);
    expect(lines.every((line) => line.length <= 12 || !line.includes(' '))).toBe(true);
  });

  it('keeps a word longer than the line whole', () => {
    expect(wrapLines('gastrointestinal system', 10)).toEqual(['gastrointestinal', 'system']);
  });
});
