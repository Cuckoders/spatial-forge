import type { PlanWall } from '../types';

interface Direction2 {
  x: number;
  z: number;
}

interface EndpointConnection {
  wall: PlanWall;
  endpoint: 'start' | 'end';
}

export interface WallEndOffsets {
  positive: number;
  negative: number;
}

export interface WallJoinOffsets {
  start: WallEndOffsets;
  end: WallEndOffsets;
}

const EMPTY_OFFSETS: WallEndOffsets = { positive: 0, negative: 0 };
const cross = (left: Direction2, right: Direction2) => left.x * right.z - left.z * right.x;
const dot = (left: Direction2, right: Direction2) => left.x * right.x + left.z * right.z;
const normalized = (x: number, z: number): Direction2 | null => {
  const length = Math.hypot(x, z);
  return length > 1e-8 ? { x: x / length, z: z / length } : null;
};

function endpointOffsets(wall: PlanWall, connections: EndpointConnection[], endpoint: 'start' | 'end', wallDirection: Direction2, length: number): WallEndOffsets {
  const joint = endpoint === 'start' ? { x: wall.startX, z: wall.startZ } : { x: wall.endX, z: wall.endZ };
  const away = endpoint === 'start' ? wallDirection : { x: -wallDirection.x, z: -wallDirection.z };
  const connected = connections.flatMap((connection) => {
    if (connection.wall.id === wall.id) return [];
    const direction = connection.endpoint === 'start'
      ? normalized(connection.wall.endX - joint.x, connection.wall.endZ - joint.z)
      : normalized(connection.wall.startX - joint.x, connection.wall.startZ - joint.z);
    return direction ? [{ wall: connection.wall, direction }] : [];
  });
  if (!connected.length || connected.some((candidate) => dot(away, candidate.direction) < -0.999)) return EMPTY_OFFSETS;

  const candidates = connected.flatMap((candidate) => {
    const angle = Math.atan2(cross(away, candidate.direction), dot(away, candidate.direction));
    return Math.abs(Math.sin(angle)) > 0.02 ? [{ ...candidate, angle }] : [];
  });
  if (!candidates.length) return EMPTY_OFFSETS;
  const currentNormal = { x: -away.z, z: away.x };
  const halfThickness = wall.thickness / 2;
  const maximumMiter = Math.max(2, 6 * Math.max(wall.thickness, ...candidates.map((candidate) => candidate.wall.thickness)));

  const offsetForSide = (side: 1 | -1) => {
    const onSide = candidates.filter((candidate) => side > 0 ? candidate.angle > 0 : candidate.angle < 0);
    const neighbor = (onSide.length ? onSide : candidates).reduce((nearest, candidate) => (
      Math.abs(candidate.angle) < Math.abs(nearest.angle) ? candidate : nearest
    ));
    const neighborNormal = { x: -neighbor.direction.z, z: neighbor.direction.x };
    const firstPoint = { x: joint.x + currentNormal.x * side * halfThickness, z: joint.z + currentNormal.z * side * halfThickness };
    const neighborHalfThickness = neighbor.wall.thickness / 2;
    const secondPoint = { x: joint.x - neighborNormal.x * side * neighborHalfThickness, z: joint.z - neighborNormal.z * side * neighborHalfThickness };
    const denominator = cross(away, neighbor.direction);
    if (Math.abs(denominator) < 1e-8) return 0;
    const delta = { x: secondPoint.x - firstPoint.x, z: secondPoint.z - firstPoint.z };
    const distanceAlongAway = cross(delta, neighbor.direction) / denominator;
    const point = { x: firstPoint.x + away.x * distanceAlongAway, z: firstPoint.z + away.z * distanceAlongAway };
    if (Math.hypot(point.x - joint.x, point.z - joint.z) > maximumMiter) return 0;
    const localOffset = (point.x - joint.x) * wallDirection.x + (point.z - joint.z) * wallDirection.z;
    return endpoint === 'start' ? Math.min(localOffset, length * 0.45) : Math.max(localOffset, -length * 0.45);
  };

  const first = offsetForSide(1);
  const second = offsetForSide(-1);
  return endpoint === 'start' ? { positive: first, negative: second } : { positive: second, negative: first };
}

const endpointKey = (floorId: string, x: number, z: number) => `${floorId}:${Math.round(x * 1e6)}:${Math.round(z * 1e6)}`;

export function wallJoinOffsetsMap(walls: PlanWall[]) {
  const connections = new Map<string, EndpointConnection[]>();
  for (const wall of walls) {
    for (const endpoint of ['start', 'end'] as const) {
      const x = endpoint === 'start' ? wall.startX : wall.endX;
      const z = endpoint === 'start' ? wall.startZ : wall.endZ;
      const key = endpointKey(wall.floorId, x, z);
      connections.set(key, [...(connections.get(key) ?? []), { wall, endpoint }]);
    }
  }

  return new Map(walls.map((wall) => {
    const dx = wall.endX - wall.startX;
    const dz = wall.endZ - wall.startZ;
    const length = Math.hypot(dx, dz);
    const direction = normalized(dx, dz);
    if (!direction || length < 1e-8) return [wall.id, { start: EMPTY_OFFSETS, end: EMPTY_OFFSETS }] as const;
    return [wall.id, {
      start: endpointOffsets(wall, connections.get(endpointKey(wall.floorId, wall.startX, wall.startZ)) ?? [], 'start', direction, length),
      end: endpointOffsets(wall, connections.get(endpointKey(wall.floorId, wall.endX, wall.endZ)) ?? [], 'end', direction, length),
    }] as const;
  }));
}
