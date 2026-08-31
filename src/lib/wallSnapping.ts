import { snapToGrid, type Point2 } from './geometry';
import type { PlanWall, WallEndpointSnap } from '../types';

const WALL_SNAP_DISTANCE = 0.65;

export interface WallPointSnap {
  point: Point2;
  target: WallEndpointSnap | null;
}

export function snapWallPoint(x: number, z: number, walls: PlanWall[], floorId: string): WallPointSnap {
  let target: WallEndpointSnap | null = null;
  let nearestDistance = WALL_SNAP_DISTANCE;

  for (const wall of walls) {
    if (wall.floorId !== floorId) continue;
    const endpoints = [
      { endpoint: 'start' as const, x: wall.startX, z: wall.startZ },
      { endpoint: 'end' as const, x: wall.endX, z: wall.endZ },
    ];
    for (const endpoint of endpoints) {
      const distance = Math.hypot(endpoint.x - x, endpoint.z - z);
      if (distance > nearestDistance) continue;
      nearestDistance = distance;
      target = { wallId: wall.id, ...endpoint };
    }
  }

  return target
    ? { point: [target.x, target.z], target }
    : { point: [snapToGrid(x), snapToGrid(z)], target: null };
}

export function pointsMatch(ax: number, az: number, bx: number, bz: number) {
  return Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6;
}
