import { snapToGrid, type Point2 } from './geometry';
import type { PlanWall, StandaloneWallOpening, WallSnapTarget } from '../types';

const ENDPOINT_SNAP_DISTANCE = 0.65;
const SEGMENT_SNAP_DISTANCE = 0.45;
const MINIMUM_WALL_LENGTH = 0.25;
const OPENING_CLEARANCE = 0.12;

export interface WallPointSnap {
  point: Point2;
  target: WallSnapTarget | null;
}

export function snapWallPoint(x: number, z: number, walls: PlanWall[], wallOpenings: StandaloneWallOpening[], floorId: string): WallPointSnap {
  let target: WallSnapTarget | null = null;
  let nearestDistance = ENDPOINT_SNAP_DISTANCE;

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
      target = { wallId: wall.id, kind: 'endpoint', ...endpoint };
    }
  }

  if (target) return { point: [target.x, target.z], target };

  const openingsByWall = new Map<string, StandaloneWallOpening[]>();
  for (const opening of wallOpenings) {
    const entries = openingsByWall.get(opening.wallId) ?? [];
    entries.push(opening); openingsByWall.set(opening.wallId, entries);
  }
  nearestDistance = SEGMENT_SNAP_DISTANCE;
  for (const wall of walls) {
    if (wall.floorId !== floorId) continue;
    const dx = wall.endX - wall.startX;
    const dz = wall.endZ - wall.startZ;
    const lengthSquared = dx * dx + dz * dz;
    const length = Math.sqrt(lengthSquared);
    if (length < MINIMUM_WALL_LENGTH * 2) continue;
    const projectedPosition = ((x - wall.startX) * dx + (z - wall.startZ) * dz) / lengthSquared;
    const position = snapToGrid(projectedPosition * length) / length;
    const minimumPosition = MINIMUM_WALL_LENGTH / length;
    if (position <= minimumPosition || position >= 1 - minimumPosition) continue;
    const targetX = wall.startX + dx * position;
    const targetZ = wall.startZ + dz * position;
    const distance = Math.hypot(targetX - x, targetZ - z);
    if (distance > nearestDistance) continue;
    const openings = openingsByWall.get(wall.id) ?? [];
    if (openings.length) {
      const splitDistance = position * length;
      if (openings.some((opening) => {
        const openingCenter = opening.offset * length;
        return splitDistance >= openingCenter - opening.width / 2 - OPENING_CLEARANCE
          && splitDistance <= openingCenter + opening.width / 2 + OPENING_CLEARANCE;
      })) continue;
    }
    nearestDistance = distance;
    target = { wallId: wall.id, kind: 'segment', position, x: targetX, z: targetZ };
  }

  return target
    ? { point: [target.x, target.z], target }
    : { point: [snapToGrid(x), snapToGrid(z)], target: null };
}

export function pointsMatch(ax: number, az: number, bx: number, bz: number) {
  return Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6;
}
