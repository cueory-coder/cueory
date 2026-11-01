/**
 * Every drawn 2D diagram, by its visual id (D-81). A diagram's words and parts come only from its source file in
 * content/visuals; the unit tests check each one against that file.
 */
import type { ComponentType } from 'react';
import type { Visual } from '../sources';
import type { DrawingStep } from '../drawing';
import FluidCompartments, { steps as fluidCompartmentsSteps } from './FluidCompartments';
import OsmosisFluidShifts, { steps as osmosisFluidShiftsSteps } from './OsmosisFluidShifts';
import SodiumPotassiumPump, { steps as sodiumPotassiumPumpSteps } from './SodiumPotassiumPump';

export interface DrawingProps {
  visual: Visual;
  shown?: number;
  idPrefix?: string;
}

export interface Drawing {
  Component: ComponentType<DrawingProps>;
  steps: readonly DrawingStep[];
}

export const drawings: Readonly<Record<string, Drawing>> = {
  'fluid-compartments': { Component: FluidCompartments, steps: fluidCompartmentsSteps },
  'osmosis-fluid-shifts': { Component: OsmosisFluidShifts, steps: osmosisFluidShiftsSteps },
  'sodium-potassium-pump': { Component: SodiumPotassiumPump, steps: sodiumPotassiumPumpSteps },
};
