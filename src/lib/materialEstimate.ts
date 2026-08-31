import { roomArea, roomVertices } from './geometry';
import { boundsForRoom, mergeBounds } from './snapping';
import { UTILITY_DEVICE_KINDS, UTILITY_KINDS, utilityLength, utilityRouteProjection } from './utilities';
import { resolveUtilityDeviceMount } from './utilityWallMounts';
import type { PlanFloor, PlanRoom, PlanUtilityDevice, PlanUtilityJunction, PlanUtilityRiser, PlanUtilityRoute, PlanWall, StandaloneWallOpening, UtilityKind, WallOpening } from '../types';

export interface ProjectQuantityInput {
  floors: PlanFloor[];
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: WallOpening[];
  wallOpenings: StandaloneWallOpening[];
  utilities: PlanUtilityRoute[];
  utilityDevices: PlanUtilityDevice[];
  utilityRisers: PlanUtilityRiser[];
  utilityJunctions: PlanUtilityJunction[];
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
  utilities: Record<UtilityKind, UtilityQuantities>;
  utilityLength: number;
}

export interface UtilityQuantities {
  routeLength: number;
  riserLength: number;
  connectionLength: number;
  totalLength: number;
  routeCount: number;
  riserCount: number;
  deviceCount: number;
  junctionCount: number;
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
  electricCablePrice: number;
  waterPipePrice: number;
  heatingPipePrice: number;
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
  electricCablePrice: 180,
  waterPipePrice: 420,
  heatingPipePrice: 520,
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

const emptyUtilityQuantities = (): UtilityQuantities => ({ routeLength: 0, riserLength: 0, connectionLength: 0, totalLength: 0,
  routeCount: 0, riserCount: 0, deviceCount: 0, junctionCount: 0 });

function calculateUtilityQuantities(input: ProjectQuantityInput) {
  const result: Record<UtilityKind, UtilityQuantities> = {
    electric: emptyUtilityQuantities(), water: emptyUtilityQuantities(), heating: emptyUtilityQuantities(),
  };
  const routesById = new Map(input.utilities.map((route) => [route.id, route]));
  const floorsById = new Map(input.floors.map((floor) => [floor.id, floor]));
  for (const route of input.utilities) {
    result[route.kind].routeLength += utilityLength(route);
    result[route.kind].routeCount += 1;
  }
  for (const device of input.utilityDevices) {
    const kind = UTILITY_DEVICE_KINDS[device.kind].utilityKind;
    result[kind].deviceCount += 1;
    const route = device.routeId ? routesById.get(device.routeId) : undefined; if (!route || route.kind !== kind) continue;
    const resolved = resolveUtilityDeviceMount(device, input.rooms, input.walls);
    const projection = utilityRouteProjection(route, resolved.x, resolved.z);
    result[kind].connectionLength += Math.hypot(projection.distance, device.elevation - route.elevation);
  }
  for (const riser of input.utilityRisers) {
    const fromFloor = floorsById.get(riser.fromFloorId); const toFloor = floorsById.get(riser.toFloorId);
    if (!fromFloor || !toFloor) continue;
    const fromRoute = riser.fromRouteId ? routesById.get(riser.fromRouteId) : undefined;
    const toRoute = riser.toRouteId ? routesById.get(riser.toRouteId) : undefined;
    const defaults = UTILITY_KINDS[riser.kind];
    const fromY = fromFloor.elevation + (fromRoute?.elevation ?? defaults.defaultElevation);
    const toY = toFloor.elevation + (toRoute?.elevation ?? defaults.defaultElevation);
    result[riser.kind].riserLength += Math.abs(toY - fromY);
    if (fromRoute) result[riser.kind].connectionLength += utilityRouteProjection(fromRoute, riser.x, riser.z).distance;
    if (toRoute) result[riser.kind].connectionLength += utilityRouteProjection(toRoute, riser.x, riser.z).distance;
    result[riser.kind].riserCount += 1;
  }
  for (const junction of input.utilityJunctions) {
    for (const routeId of junction.routeIds) {
      const route = routesById.get(routeId); if (!route) continue;
      const projection = utilityRouteProjection(route, junction.x, junction.z);
      result[junction.kind].connectionLength += Math.hypot(projection.distance, junction.elevation - route.elevation);
    }
    result[junction.kind].junctionCount += 1;
  }
  for (const quantities of Object.values(result)) {
    quantities.totalLength = quantities.routeLength + quantities.riserLength + quantities.connectionLength;
  }
  return result;
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
  const utilities = calculateUtilityQuantities(input);
  return {
    floors,
    floorArea: sum(floors.map((floor) => floor.floorArea)),
    wallArea: sum(floors.map((floor) => floor.wallArea)),
    openingArea: sum(floors.map((floor) => floor.openingArea)),
    slabArea: sum(floors.map((floor) => floor.slabArea)),
    slabVolume: sum(floors.map((floor) => floor.slabVolume)),
    roofArea: sum(floors.map((floor) => floor.roofArea)),
    utilities,
    utilityLength: sum(Object.values(utilities).map((item) => item.totalLength)),
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
  const cable = roundUp(quantities.utilities.electric.totalLength * waste);
  const waterPipe = roundUp(quantities.utilities.water.totalLength * waste);
  const heatingPipe = roundUp(quantities.utilities.heating.totalLength * waste);
  const rows: MaterialRow[] = [];
  if (wallMode === 'paint' && paintLiters > 0) rows.push({ id: 'paint', name: `Краска для стен, ${rates.paintCoats} слоя`, quantity: paintLiters, unit: 'л', unitPrice: rates.paintPrice, cost: paintLiters * rates.paintPrice });
  if (wallMode === 'wallpaper' && wallpaperRolls > 0) rows.push({ id: 'wallpaper', name: 'Обои', quantity: wallpaperRolls, unit: 'рул.', unitPrice: rates.wallpaperRollPrice, cost: wallpaperRolls * rates.wallpaperRollPrice });
  if (floorCovering > 0) rows.push({ id: 'floor', name: 'Напольное покрытие', quantity: floorCovering, unit: 'м²', unitPrice: rates.floorCoveringPrice, cost: floorCovering * rates.floorCoveringPrice });
  if (concrete > 0) rows.push({ id: 'concrete', name: 'Бетон для перекрытий', quantity: concrete, unit: 'м³', unitPrice: rates.concretePrice, cost: concrete * rates.concretePrice });
  if (roofing > 0) rows.push({ id: 'roofing', name: 'Кровельное покрытие', quantity: roofing, unit: 'м²', unitPrice: rates.roofingPrice, cost: roofing * rates.roofingPrice });
  if (cable > 0) rows.push({ id: 'electric-cable', name: 'Электрический кабель', quantity: cable, unit: 'м', unitPrice: rates.electricCablePrice, cost: cable * rates.electricCablePrice });
  if (waterPipe > 0) rows.push({ id: 'water-pipe', name: 'Труба водоснабжения', quantity: waterPipe, unit: 'м', unitPrice: rates.waterPipePrice, cost: waterPipe * rates.waterPipePrice });
  if (heatingPipe > 0) rows.push({ id: 'heating-pipe', name: 'Труба отопления', quantity: heatingPipe, unit: 'м', unitPrice: rates.heatingPipePrice, cost: heatingPipe * rates.heatingPipePrice });
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
    ['Общая длина инженерных сетей', quantities.utilityLength.toFixed(2), 'м'],
    [],
    ['Инженерная сеть', 'Горизонтальные трассы, м', 'Стояки, м', 'Отводы, м', 'Всего, м'],
    ...(['electric', 'water', 'heating'] as UtilityKind[]).map((kind) => [UTILITY_KINDS[kind].label,
      quantities.utilities[kind].routeLength.toFixed(2), quantities.utilities[kind].riserLength.toFixed(2),
      quantities.utilities[kind].connectionLength.toFixed(2), quantities.utilities[kind].totalLength.toFixed(2)]),
    [],
    ['Материал', 'Количество', 'Единица', 'Цена за единицу, ₽', 'Стоимость, ₽'],
    ...rows.map((row) => [row.name, row.quantity, row.unit, row.unitPrice, Math.round(row.cost)]),
    ['Итого', '', '', '', Math.round(sum(rows.map((row) => row.cost)))],
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}`;
}
