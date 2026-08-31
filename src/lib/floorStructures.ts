import type { FloorRoofSettings, FloorSlabSettings, PlanFloor } from '../types';

export function createDefaultSlabSettings(): FloorSlabSettings {
  return { enabled: true, thickness: 0.22, color: '#B8B9B2' };
}

export function createDefaultRoofSettings(): FloorRoofSettings {
  return { enabled: false, type: 'gable', height: 1.8, overhang: 0.45, color: '#76594B', ridgeDirection: 'x' };
}

export function createPlanFloor(id: string, name: string, elevation: number): PlanFloor {
  return { id, name, elevation, slab: createDefaultSlabSettings(), roof: createDefaultRoofSettings() };
}
