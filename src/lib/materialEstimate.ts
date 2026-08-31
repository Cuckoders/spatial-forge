import { roomArea, roomVertices } from './geometry';
import { boundsForRoom, mergeBounds } from './snapping';
import type { PlanFloor, PlanRoom, PlanWall, StandaloneWallOpening, WallOpening } from '../types';

export interface ProjectQuantityInput {
  floors: PlanFloor[];
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: WallOpening[];
  wallOpenings: StandaloneWallOpening[];
}

export interface FloorQuantities {
  floorId: string;
  floorName: string;
  floorArea: number;
  wallArea: number;
  openingArea: number;
  slabArea: number;
  slabVolume: number;
  roofArea: number;
}

export interface ProjectQuantities {
  floors: FloorQuantities[];
  floorArea: number;
  wallArea: number;
  openingArea: number;
  slabArea: number;
  slabVolume: number;
  roofArea: number;
}

export interface EstimateRates {
  wastePercent: number;
  paintCoverage: number;
  paintCoats: number;
  paintPrice: number;
  wallpaperRollCoverage: number;
  wallpaperRollPrice: number;
  floorCoveringPrice: number;
  concretePrice: number;
  roofingPrice: number;
}

export type WallFinishMode = 'paint' | 'wallpaper';

export interface MaterialRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  cost: number;
}

export const DEFAULT_ESTIMATE_RATES: EstimateRates = {
  wastePercent: 10,
  paintCoverage: 10,
  paintCoats: 2,
  paintPrice: 650,
  wallpaperRollCoverage: 5,
  wallpaperRollPrice: 1_900,
  floorCoveringPrice: 2_500,
  concretePrice: 9_000,
  roofingPrice: 1_800,
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function roomWallQuantities(room: PlanRoom, openings: WallOpening[]) {
  const vertices = roomVertices(room);
  const grossArea = sum(vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    return end ? Math.hypot(end[0] - start[0], end[1] - start[1]) * room.wallHeight : 0;
  }));
  const openingArea = sum(openings.filter((opening) => opening.roomId === room.id).map((opening) => opening.width * opening.height));
  return { wallArea: Math.max(0, grossArea - openingArea), openingArea };
}

function standaloneWallQuantities(wall: PlanWall, openings: StandaloneWallOpening[]) {
  const grossArea = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ) * wall.height * 2;
  const openingArea = sum(openings.filter((opening) => opening.wallId === wall.id).map((opening) => opening.width * opening.height * 2));
  return { wallArea: Math.max(0, grossArea - openingArea), openingArea };
}

function roofArea(floor: PlanFloor, rooms: PlanRoom[]) {
  if (!floor.roof.enabled) return 0;
  const bounds = mergeBounds(rooms.map(boundsForRoom));
  if (!bounds) return 0;
  const width = bounds.maxX - bounds.minX + floor.roof.overhang * 2;
  const depth = bounds.maxZ - bounds.minZ + floor.roof.overhang * 2;
  if (floor.roof.type === 'flat') return width * depth;
  const ridgeLength = floor.roof.ridgeDirection === 'x' ? width : depth;
  const slopeSpan = (floor.roof.ridgeDirection === 'x' ? depth : width) / 2;
  return ridgeLength * Math.hypot(slopeSpan, floor.roof.height) * 2;
}

export function calculateProjectQuantities(input: ProjectQuantityInput): ProjectQuantities {
  const floors = input.floors.map((floor) => {
    const rooms = input.rooms.filter((room) => room.floorId === floor.id);
    const walls = input.walls.filter((wall) => wall.floorId === floor.id);
    const roomWalls = rooms.map((room) => roomWallQuantities(room, input.openings));
    const standaloneWalls = walls.map((wall) => standaloneWallQuantities(wall, input.wallOpenings));
    const floorArea = sum(rooms.map(roomArea));
    return {
      floorId: floor.id,
      floorName: floor.name,
      floorArea,
      wallArea: sum(roomWalls.map((item) => item.wallArea)) + sum(standaloneWalls.map((item) => item.wallArea)),
      openingArea: sum(roomWalls.map((item) => item.openingArea)) + sum(standaloneWalls.map((item) => item.openingArea)),
      slabArea: floor.slab.enabled ? floorArea : 0,
      slabVolume: floor.slab.enabled ? floorArea * floor.slab.thickness : 0,
      roofArea: roofArea(floor, rooms),
    };
  });
  return {
    floors,
    floorArea: sum(floors.map((floor) => floor.floorArea)),
    wallArea: sum(floors.map((floor) => floor.wallArea)),
    openingArea: sum(floors.map((floor) => floor.openingArea)),
    slabArea: sum(floors.map((floor) => floor.slabArea)),
    slabVolume: sum(floors.map((floor) => floor.slabVolume)),
    roofArea: sum(floors.map((floor) => floor.roofArea)),
  };
}

const roundUp = (value: number, precision = 1) => Math.ceil(value * 10 ** precision) / 10 ** precision;

export function materialEstimateRows(quantities: ProjectQuantities, rates: EstimateRates, wallMode: WallFinishMode) {
  const waste = 1 + Math.max(0, rates.wastePercent) / 100;
  const paintLiters = roundUp(quantities.wallArea * Math.max(1, rates.paintCoats) / Math.max(0.1, rates.paintCoverage) * waste);
  const wallpaperRolls = Math.ceil(quantities.wallArea * waste / Math.max(0.1, rates.wallpaperRollCoverage));
  const floorCovering = roundUp(quantities.floorArea * waste);
  const concrete = roundUp(quantities.slabVolume * waste, 2);
  const roofing = roundUp(quantities.roofArea * waste);
  const rows: MaterialRow[] = [];
  if (wallMode === 'paint' && paintLiters > 0) rows.push({ id: 'paint', name: `Краска для стен, ${rates.paintCoats} слоя`, quantity: paintLiters, unit: 'л', unitPrice: rates.paintPrice, cost: paintLiters * rates.paintPrice });
  if (wallMode === 'wallpaper' && wallpaperRolls > 0) rows.push({ id: 'wallpaper', name: 'Обои', quantity: wallpaperRolls, unit: 'рул.', unitPrice: rates.wallpaperRollPrice, cost: wallpaperRolls * rates.wallpaperRollPrice });
  if (floorCovering > 0) rows.push({ id: 'floor', name: 'Напольное покрытие', quantity: floorCovering, unit: 'м²', unitPrice: rates.floorCoveringPrice, cost: floorCovering * rates.floorCoveringPrice });
  if (concrete > 0) rows.push({ id: 'concrete', name: 'Бетон для перекрытий', quantity: concrete, unit: 'м³', unitPrice: rates.concretePrice, cost: concrete * rates.concretePrice });
  if (roofing > 0) rows.push({ id: 'roofing', name: 'Кровельное покрытие', quantity: roofing, unit: 'м²', unitPrice: rates.roofingPrice, cost: roofing * rates.roofingPrice });
  return { rows, paintLiters, wallpaperRolls, total: sum(rows.map((row) => row.cost)) };
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export function createEstimateCsv(projectName: string, quantities: ProjectQuantities, rows: MaterialRow[]) {
  const lines = [
    ['Проект', projectName],
    [],
    ['Показатель', 'Количество', 'Единица'],
    ['Площадь стен без проёмов', quantities.wallArea.toFixed(2), 'м²'],
    ['Площадь полов', quantities.floorArea.toFixed(2), 'м²'],
    ['Площадь перекрытий', quantities.slabArea.toFixed(2), 'м²'],
    ['Объём перекрытий', quantities.slabVolume.toFixed(3), 'м³'],
    ['Площадь кровли', quantities.roofArea.toFixed(2), 'м²'],
    [],
    ['Материал', 'Количество', 'Единица', 'Цена за единицу, ₽', 'Стоимость, ₽'],
    ...rows.map((row) => [row.name, row.quantity, row.unit, row.unitPrice, Math.round(row.cost)]),
    ['Итого', '', '', '', Math.round(sum(rows.map((row) => row.cost)))],
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}`;
}
