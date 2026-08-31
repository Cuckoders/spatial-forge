import type { StandaloneWallOpening, WallOpening } from '../types';

export type OpeningLike = Pick<StandaloneWallOpening | WallOpening, 'id' | 'offset' | 'width' | 'height' | 'sillHeight' | 'kind'>;

export const MAX_OPENINGS_PER_WALL = 8;
export const OPENING_EDGE_CLEARANCE = 0.06;
export const OPENING_GAP = 0.12;

export interface OpeningLayout<T extends OpeningLike> {
  opening: T;
  center: number;
  start: number;
  end: number;
  height: number;
  sillHeight: number;
}

function interval(opening: Pick<OpeningLike, 'offset' | 'width'>, wallLength: number) {
  const center = opening.offset * wallLength;
  return { start: center - opening.width / 2, end: center + opening.width / 2 };
}

export function openingsOverlap(candidate: Pick<OpeningLike, 'offset' | 'width'>, others: Array<Pick<OpeningLike, 'offset' | 'width'>>, wallLength: number, checkEdges = true) {
  const candidateInterval = interval(candidate, wallLength);
  return checkEdges && (candidateInterval.start < OPENING_EDGE_CLEARANCE - 1e-6
    || candidateInterval.end > wallLength - OPENING_EDGE_CLEARANCE + 1e-6)
    || others.some((opening) => {
      const otherInterval = interval(opening, wallLength);
      return candidateInterval.start < otherInterval.end + OPENING_GAP - 1e-6
        && candidateInterval.end > otherInterval.start - OPENING_GAP + 1e-6;
    });
}

export function findAvailableOpeningOffset(wallLength: number, width: number, openings: Array<Pick<OpeningLike, 'offset' | 'width'>>, preferredOffset = 0.5) {
  const preferredCenter = preferredOffset * wallLength;
  const occupied = openings.map((opening) => interval(opening, wallLength)).sort((left, right) => left.start - right.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = OPENING_EDGE_CLEARANCE;
  for (const current of occupied) {
    const end = current.start - OPENING_GAP;
    if (end - cursor >= width - 1e-6) gaps.push({ start: cursor, end });
    cursor = Math.max(cursor, current.end + OPENING_GAP);
  }
  const end = wallLength - OPENING_EDGE_CLEARANCE;
  if (end - cursor >= width - 1e-6) gaps.push({ start: cursor, end });
  if (!gaps.length) return undefined;
  const centers = gaps.map((gap) => Math.min(gap.end - width / 2, Math.max(gap.start + width / 2, preferredCenter)));
  const center = centers.reduce((nearest, candidate) => Math.abs(candidate - preferredCenter) < Math.abs(nearest - preferredCenter) ? candidate : nearest);
  return center / wallLength;
}

export function layoutOpenings<T extends OpeningLike>(openings: T[], wallLength: number, wallHeight: number): OpeningLayout<T>[] {
  return openings.map((opening) => {
    const width = Math.min(opening.width, Math.max(0.2, wallLength - OPENING_EDGE_CLEARANCE * 2));
    const center = Math.min(wallLength / 2 - width / 2, Math.max(-wallLength / 2 + width / 2, -wallLength / 2 + opening.offset * wallLength));
    const sillHeight = Math.min(opening.sillHeight, Math.max(0, wallHeight - 0.3));
    const height = Math.min(opening.height, Math.max(0.3, wallHeight - sillHeight - 0.03));
    return { opening, center, start: center - width / 2, end: center + width / 2, height, sillHeight };
  }).sort((left, right) => left.start - right.start);
}
