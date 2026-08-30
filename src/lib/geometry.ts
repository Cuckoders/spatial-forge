import type { PlanRoom } from '../types';

export type Point2 = readonly [number, number];

export function roomVertices(room: Pick<PlanRoom, 'shape' | 'width' | 'depth'>): Point2[] {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;
  if (room.shape === 'triangle') return [[-halfWidth, halfDepth], [halfWidth, halfDepth], [0, -halfDepth]];
  return [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]];
}

export function wallId(roomId: string, wallIndex: number) {
  return `${roomId}:wall:${wallIndex}`;
}

export function snapToGrid(value: number, step = 0.5) {
  return Math.round(value / step) * step;
}

export function roomArea(room: Pick<PlanRoom, 'shape' | 'width' | 'depth'>) {
  return room.shape === 'triangle' ? room.width * room.depth / 2 : room.width * room.depth;
}

export function normalizeDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
