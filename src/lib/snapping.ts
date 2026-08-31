import { roomVertices } from './geometry';
import type { ModelInstance, PlanRoom, SnapGuide } from '../types';

export interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface AxisFeature {
  kind: 'edge' | 'center';
  value: number;
}

const builtInSize: Record<string, readonly [number, number]> = {
  sofa: [1.1, 0.46], table: [0.9, 0.54], bed: [0.92, 1.12], tree: [1.35, 1.35], stairs: [0.64, 1.65],
};

const axisFeatures = (minimum: number, maximum: number): AxisFeature[] => [
  { kind: 'edge', value: minimum },
  { kind: 'center', value: (minimum + maximum) / 2 },
  { kind: 'edge', value: maximum },
];

const formatCoordinate = (value: number) => `${Number(value.toFixed(2))} м`;

export function boundsForRoom(room: PlanRoom): Bounds2D {
  const cosine = Math.cos(room.rotation); const sine = Math.sin(room.rotation);
  const points = roomVertices(room).map(([x, z]) => [room.x + x * cosine - z * sine, room.z + x * sine + z * cosine] as const);
  return {
    minX: Math.min(...points.map((point) => point[0])), maxX: Math.max(...points.map((point) => point[0])),
    minZ: Math.min(...points.map((point) => point[1])), maxZ: Math.max(...points.map((point) => point[1])),
  };
}

export function boundsForModel(model: ModelInstance): Bounds2D {
  const kind = model.assetId.startsWith('builtin:') ? model.assetId.slice(8) : '';
  const [localHalfX, localHalfZ] = builtInSize[kind] ?? [0.7, 0.7];
  const cosine = Math.abs(Math.cos(model.rotation)); const sine = Math.abs(Math.sin(model.rotation));
  const halfX = (localHalfX * cosine + localHalfZ * sine) * model.scale;
  const halfZ = (localHalfX * sine + localHalfZ * cosine) * model.scale;
  return { minX: model.x - halfX, maxX: model.x + halfX, minZ: model.z - halfZ, maxZ: model.z + halfZ };
}

export function mergeBounds(bounds: Bounds2D[]): Bounds2D | undefined {
  if (!bounds.length) return undefined;
  return bounds.reduce((result, current) => ({
    minX: Math.min(result.minX, current.minX), maxX: Math.max(result.maxX, current.maxX),
    minZ: Math.min(result.minZ, current.minZ), maxZ: Math.max(result.maxZ, current.maxZ),
  }));
}

export function translateBounds(bounds: Bounds2D, dx: number, dz: number): Bounds2D {
  return { minX: bounds.minX + dx, maxX: bounds.maxX + dx, minZ: bounds.minZ + dz, maxZ: bounds.maxZ + dz };
}

function snapAxis(moving: AxisFeature[], targets: AxisFeature[], threshold: number) {
  let best: { offset: number; movingKind: AxisFeature['kind']; targetKind: AxisFeature['kind']; value: number } | undefined;
  for (const source of moving) for (const target of targets) {
    const offset = target.value - source.value;
    if (Math.abs(offset) > threshold || best && Math.abs(offset) >= Math.abs(best.offset)) continue;
    best = { offset, movingKind: source.kind, targetKind: target.kind, value: target.value };
  }
  return best;
}

export function snapBounds(moving: Bounds2D, targets: Bounds2D[], threshold = 0.26): { dx: number; dz: number; guides: SnapGuide[] } {
  const targetX = targets.flatMap((bounds) => axisFeatures(bounds.minX, bounds.maxX));
  const targetZ = targets.flatMap((bounds) => axisFeatures(bounds.minZ, bounds.maxZ));
  const x = snapAxis(axisFeatures(moving.minX, moving.maxX), targetX, threshold);
  const z = snapAxis(axisFeatures(moving.minZ, moving.maxZ), targetZ, threshold);
  const guides: SnapGuide[] = [];
  if (x) guides.push({ axis: 'x', value: x.value, label: `${x.movingKind === 'center' && x.targetKind === 'center' ? 'Центр' : 'Край / угол'} · X ${formatCoordinate(x.value)}` });
  if (z) guides.push({ axis: 'z', value: z.value, label: `${z.movingKind === 'center' && z.targetKind === 'center' ? 'Центр' : 'Край / угол'} · Z ${formatCoordinate(z.value)}` });
  return { dx: x?.offset ?? 0, dz: z?.offset ?? 0, guides };
}
