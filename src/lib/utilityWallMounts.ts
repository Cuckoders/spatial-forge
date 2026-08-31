import { roomVertices } from './geometry';
import type { PlanRoom, PlanUtilityDevice, PlanWall, UtilityWallMount } from '../types';

const MOUNT_CLEARANCE = 0.075;

function roomWorldVertices(room: PlanRoom) {
  const cosine = Math.cos(room.rotation); const sine = Math.sin(room.rotation);
  return roomVertices(room).map(([x, z]) => [room.x + x * cosine - z * sine, room.z + x * sine + z * cosine] as const);
}

function mountSegment(mount: UtilityWallMount, rooms: PlanRoom[], walls: PlanWall[]) {
  if (mount.kind === 'partition') {
    const wall = walls.find((item) => item.id === mount.sourceId);
    return wall ? { startX: wall.startX, startZ: wall.startZ, endX: wall.endX, endZ: wall.endZ, thickness: wall.thickness } : undefined;
  }
  const room = rooms.find((item) => item.id === mount.sourceId); if (!room) return undefined;
  const vertices = roomWorldVertices(room); const start = vertices[mount.wallIndex]; const end = vertices[(mount.wallIndex + 1) % vertices.length];
  return start && end ? { startX: start[0], startZ: start[1], endX: end[0], endZ: end[1], thickness: room.wallThickness } : undefined;
}

function pointOnSegment(segment: { startX: number; startZ: number; endX: number; endZ: number; thickness: number }, offset: number, side: -1 | 1) {
  const dx = segment.endX - segment.startX; const dz = segment.endZ - segment.startZ;
  const length = Math.hypot(dx, dz); if (length < 0.001) return undefined;
  const normalX = -dz / length * side; const normalZ = dx / length * side;
  const surfaceOffset = segment.thickness / 2 + MOUNT_CLEARANCE;
  return { x: segment.startX + dx * offset + normalX * surfaceOffset, z: segment.startZ + dz * offset + normalZ * surfaceOffset,
    rotation: -Math.atan2(dz, dx) };
}

export function resolveUtilityDeviceMount(device: PlanUtilityDevice, rooms: PlanRoom[], walls: PlanWall[]) {
  if (!device.wallMount) return device;
  const segment = mountSegment(device.wallMount, rooms, walls);
  const placement = segment ? pointOnSegment(segment, device.wallMount.offset, device.wallMount.side) : undefined;
  return placement ? { ...device, ...placement } : { ...device, wallMount: undefined };
}

export function nearestUtilityWallMount(rooms: PlanRoom[], walls: PlanWall[], floorId: string, x: number, z: number, maximumDistance = 0.75) {
  let result: { mount: UtilityWallMount; x: number; z: number; rotation: number; distance: number } | undefined;
  const consider = (mount: UtilityWallMount, segment: { startX: number; startZ: number; endX: number; endZ: number; thickness: number }) => {
    const dx = segment.endX - segment.startX; const dz = segment.endZ - segment.startZ; const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 0.01) return;
    const rawOffset = ((x - segment.startX) * dx + (z - segment.startZ) * dz) / lengthSquared;
    const offset = Math.max(0.03, Math.min(0.97, rawOffset));
    const centerX = segment.startX + dx * offset; const centerZ = segment.startZ + dz * offset;
    const distance = Math.hypot(x - centerX, z - centerZ);
    if (distance > maximumDistance || result && distance >= result.distance) return;
    const side: -1 | 1 = dx * (z - centerZ) - dz * (x - centerX) < 0 ? -1 : 1;
    const placement = pointOnSegment(segment, offset, side); if (!placement) return;
    result = { mount: { ...mount, offset, side }, ...placement, distance };
  };
  for (const room of rooms) {
    if (room.floorId !== floorId) continue;
    const vertices = roomWorldVertices(room);
    vertices.forEach((start, wallIndex) => { const end = vertices[(wallIndex + 1) % vertices.length]; if (end) consider(
      { kind: 'room', sourceId: room.id, wallIndex, offset: 0, side: 1 },
      { startX: start[0], startZ: start[1], endX: end[0], endZ: end[1], thickness: room.wallThickness },
    ); });
  }
  for (const wall of walls) if (wall.floorId === floorId) consider(
    { kind: 'partition', sourceId: wall.id, offset: 0, side: 1 },
    { startX: wall.startX, startZ: wall.startZ, endX: wall.endX, endZ: wall.endZ, thickness: wall.thickness },
  );
  return result;
}

export function utilityWallMountLabel(mount: UtilityWallMount, rooms: PlanRoom[], walls: PlanWall[]) {
  if (mount.kind === 'partition') return walls.find((wall) => wall.id === mount.sourceId)?.name ?? 'Самостоятельная стена';
  const room = rooms.find((item) => item.id === mount.sourceId);
  return room ? `${room.name} · грань ${mount.wallIndex + 1}` : 'Стена помещения';
}
