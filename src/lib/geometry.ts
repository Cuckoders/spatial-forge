import type { PlanRoom } from '../types';

export type Point2 = readonly [number, number];

export function roomVertices(room: Pick<PlanRoom, 'shape' | 'width' | 'depth' | 'vertices'>): Point2[] {
  if (room.shape === 'polygon' && room.vertices?.length) return room.vertices;
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

export function polygonArea(vertices: ReadonlyArray<Point2>) {
  return Math.abs(vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return next ? sum + point[0] * next[1] - next[0] * point[1] : sum;
  }, 0)) / 2;
}

export function polygonBounds(vertices: ReadonlyArray<Point2>) {
  const xs = vertices.map((point) => point[0]);
  const zs = vertices.map((point) => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

export function isSimplePolygon(vertices: ReadonlyArray<Point2>) {
  const orientation = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: Point2, b: Point2, point: Point2) => Math.abs(orientation(a, b, point)) < 1e-8
    && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0])
    && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1]);
  const intersects = (a: Point2, b: Point2, c: Point2, d: Point2) => {
    const abC = orientation(a, b, c); const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a); const cdB = orientation(c, d, b);
    if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
    return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
  };
  for (let first = 0; first < vertices.length; first += 1) {
    const firstEnd = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondEnd = (second + 1) % vertices.length;
      if (first === second || firstEnd === second || secondEnd === first) continue;
      if (intersects(vertices[first]!, vertices[firstEnd]!, vertices[second]!, vertices[secondEnd]!)) return false;
    }
  }
  return true;
}

export function roomArea(room: Pick<PlanRoom, 'shape' | 'width' | 'depth' | 'vertices'>) {
  return room.shape === 'polygon' ? polygonArea(roomVertices(room)) : room.shape === 'triangle' ? room.width * room.depth / 2 : room.width * room.depth;
}

export function normalizeDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
