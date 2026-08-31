import { isSimplePolygon, polygonArea, polygonBounds, roomVertices } from './geometry';
import { createDefaultRoofSettings, createDefaultSlabSettings } from './floorStructures';
import { MAX_OPENINGS_PER_WALL, openingsOverlap, type OpeningLike } from './openings';
import { UTILITY_DEVICE_KINDS } from './utilities';
import type { BuiltInModelKind, ModelAsset, ModelInstance, PlanFloor, PlanRoom, PlanUtilityDevice, PlanUtilityRiser, PlanUtilityRoute, PlanWall, ProjectDocument, ProjectType, SiteSettings, StandaloneWallOpening, TextureAsset, UtilityKind, UtilityWallMount, WallFinish, WallOpening } from '../types';

export const AUTOSAVE_KEY = 'spatial-forge.project.v1';
export const MAX_PROJECT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXTURE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_MODEL_FILE_BYTES = 25 * 1024 * 1024;

const idPattern = /^[A-Za-z0-9:_-]{1,80}$/;
const colorPattern = /^#[0-9A-Fa-f]{6}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const builtInAssets = new Set<BuiltInModelKind>(['sofa', 'table', 'bed', 'tree', 'stairs']);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, minimum: number, maximum: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const stripControls = (value: string) => Array.from(value, (character) => {
  const code = character.charCodeAt(0);
  return code <= 31 || code === 127 ? ' ' : character;
}).join('');

function text(value: unknown, maximum: number) {
  if (typeof value !== 'string') return undefined;
  const clean = stripControls(value).replace(/\s+/g, ' ').trim();
  return clean && clean.length <= maximum ? clean : undefined;
}

function readFloor(value: unknown): PlanFloor | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id)) return undefined;
  const name = text(value.name, 80);
  if (!name || !finite(value.elevation, -20, 60)) return undefined;
  const slab = value.slab === undefined ? createDefaultSlabSettings() : readSlab(value.slab);
  const roof = value.roof === undefined ? createDefaultRoofSettings() : readRoof(value.roof);
  if (!slab || !roof) return undefined;
  return { id: value.id, name, elevation: value.elevation, slab, roof };
}

function readSlab(value: unknown): PlanFloor['slab'] | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || !finite(value.thickness, 0.08, 1)
    || typeof value.color !== 'string' || !colorPattern.test(value.color)) return undefined;
  return { enabled: value.enabled, thickness: value.thickness, color: value.color };
}

function readRoof(value: unknown): PlanFloor['roof'] | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || !['flat', 'gable'].includes(String(value.type))
    || !finite(value.height, 0.2, 8) || !finite(value.overhang, 0, 3)
    || typeof value.color !== 'string' || !colorPattern.test(value.color) || !['x', 'z'].includes(String(value.ridgeDirection))) return undefined;
  return { enabled: value.enabled, type: value.type as PlanFloor['roof']['type'], height: value.height, overhang: value.overhang,
    color: value.color, ridgeDirection: value.ridgeDirection as PlanFloor['roof']['ridgeDirection'] };
}

function readRoom(value: unknown, floorIds: Set<string>): PlanRoom | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.floorId !== 'string' || !floorIds.has(value.floorId)) return undefined;
  const name = text(value.name, 80);
  if (!name || !['rectangle', 'triangle', 'polygon'].includes(String(value.shape)) || !finite(value.x, -200, 200) || !finite(value.z, -200, 200)
    || !finite(value.width, 0.5, 50) || !finite(value.depth, 0.5, 50) || !finite(value.rotation, -Math.PI * 20, Math.PI * 20)
    || !finite(value.wallHeight, 0.2, 12) || !finite(value.wallThickness, 0.05, 1) || typeof value.floorColor !== 'string' || !colorPattern.test(value.floorColor)) return undefined;
  let vertices: Array<[number, number]> | undefined;
  let width = value.width; let depth = value.depth;
  if (value.shape === 'polygon') {
    if (!Array.isArray(value.vertices) || value.vertices.length < 3 || value.vertices.length > 24) return undefined;
    vertices = value.vertices.flatMap((point) => Array.isArray(point) && point.length === 2 && finite(point[0], -50, 50) && finite(point[1], -50, 50)
      ? [[point[0], point[1]] as [number, number]] : []);
    if (vertices.length !== value.vertices.length || !isSimplePolygon(vertices) || polygonArea(vertices) < 0.25) return undefined;
    const bounds = polygonBounds(vertices); width = bounds.width; depth = bounds.depth;
    if (width < 0.5 || width > 50 || depth < 0.5 || depth > 50) return undefined;
  }
  return { id: value.id, floorId: value.floorId, name, shape: value.shape as PlanRoom['shape'], x: value.x, z: value.z,
    width, depth, rotation: value.rotation, wallHeight: value.wallHeight,
    wallThickness: value.wallThickness, floorColor: value.floorColor, ...(vertices ? { vertices } : {}) };
}

function readFinish(value: unknown): WallFinish | undefined {
  if (!isRecord(value) || typeof value.color !== 'string' || !colorPattern.test(value.color)
    || (value.textureId !== undefined && (typeof value.textureId !== 'string' || !uuidPattern.test(value.textureId)))) return undefined;
  return { color: value.color, ...(typeof value.textureId === 'string' ? { textureId: value.textureId } : {}) };
}

function readWall(value: unknown, floorIds: Set<string>): PlanWall | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.floorId !== 'string' || !floorIds.has(value.floorId)) return undefined;
  const name = text(value.name, 80);
  if (!name || !finite(value.startX, -200, 200) || !finite(value.startZ, -200, 200) || !finite(value.endX, -200, 200)
    || !finite(value.endZ, -200, 200) || !finite(value.height, 0.2, 12) || !finite(value.thickness, 0.05, 1)
    || typeof value.color !== 'string' || !colorPattern.test(value.color)
    || Math.hypot(value.endX - value.startX, value.endZ - value.startZ) < 0.25) return undefined;
  const frontFinish = value.frontFinish === undefined ? undefined : readFinish(value.frontFinish);
  const backFinish = value.backFinish === undefined ? undefined : readFinish(value.backFinish);
  if (value.frontFinish !== undefined && !frontFinish || value.backFinish !== undefined && !backFinish) return undefined;
  return { id: value.id, floorId: value.floorId, name, startX: value.startX, startZ: value.startZ,
    endX: value.endX, endZ: value.endZ, height: value.height, thickness: value.thickness, color: value.color,
    ...(frontFinish ? { frontFinish } : {}), ...(backFinish ? { backFinish } : {}) };
}

function readModel(value: unknown, floorIds: Set<string>): ModelInstance | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.floorId !== 'string' || !floorIds.has(value.floorId)
    || typeof value.assetId !== 'string' || (!uuidPattern.test(value.assetId)
      && (!value.assetId.startsWith('builtin:') || !builtInAssets.has(value.assetId.slice(8) as BuiltInModelKind)))) return undefined;
  const name = text(value.name, 80);
  if (!name || !finite(value.x, -200, 200) || !finite(value.y, -10, 50) || !finite(value.z, -200, 200)
    || !finite(value.rotation, -Math.PI * 20, Math.PI * 20) || !finite(value.scale, 0.05, 20)) return undefined;
  return { id: value.id, floorId: value.floorId, assetId: value.assetId, name, x: value.x, y: value.y, z: value.z, rotation: value.rotation, scale: value.scale };
}

function readUtility(value: unknown, floorIds: Set<string>): PlanUtilityRoute | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.floorId !== 'string' || !floorIds.has(value.floorId)
    || !['electric', 'water', 'heating'].includes(String(value.kind)) || !finite(value.startX, -200, 200) || !finite(value.startZ, -200, 200)
    || !finite(value.endX, -200, 200) || !finite(value.endZ, -200, 200) || !finite(value.elevation, 0.01, 12)
    || !finite(value.diameter, 0.005, 0.5) || Math.hypot(value.endX - value.startX, value.endZ - value.startZ) < 0.1) return undefined;
  const name = text(value.name, 80);
  if (!name) return undefined;
  return { id: value.id, floorId: value.floorId, name, kind: value.kind as PlanUtilityRoute['kind'], startX: value.startX,
    startZ: value.startZ, endX: value.endX, endZ: value.endZ, elevation: value.elevation, diameter: value.diameter };
}

function readUtilityRiser(value: unknown, floorIds: Set<string>): PlanUtilityRiser | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.fromFloorId !== 'string'
    || typeof value.toFloorId !== 'string' || value.fromFloorId === value.toFloorId || !floorIds.has(value.fromFloorId) || !floorIds.has(value.toFloorId)
    || !['electric', 'water', 'heating'].includes(String(value.kind)) || !finite(value.x, -200, 200) || !finite(value.z, -200, 200)
    || !finite(value.diameter, 0.005, 0.5)
    || (value.fromRouteId !== undefined && (typeof value.fromRouteId !== 'string' || !idPattern.test(value.fromRouteId)))
    || (value.toRouteId !== undefined && (typeof value.toRouteId !== 'string' || !idPattern.test(value.toRouteId)))) return undefined;
  const name = text(value.name, 80); if (!name) return undefined;
  return { id: value.id, name, kind: value.kind as UtilityKind, x: value.x, z: value.z, fromFloorId: value.fromFloorId,
    toFloorId: value.toFloorId, diameter: value.diameter,
    ...(typeof value.fromRouteId === 'string' ? { fromRouteId: value.fromRouteId } : {}),
    ...(typeof value.toRouteId === 'string' ? { toRouteId: value.toRouteId } : {}) };
}

function readUtilityWallMount(value: unknown): UtilityWallMount | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !['room', 'partition'].includes(String(value.kind)) || typeof value.sourceId !== 'string' || !idPattern.test(value.sourceId)
    || !finite(value.offset, 0, 1) || value.side !== -1 && value.side !== 1) return null;
  if (value.kind === 'room') {
    if (typeof value.wallIndex !== 'number' || !Number.isInteger(value.wallIndex) || value.wallIndex < 0 || value.wallIndex > 499) return null;
    return { kind: 'room', sourceId: value.sourceId, wallIndex: value.wallIndex, offset: value.offset, side: value.side };
  }
  return { kind: 'partition', sourceId: value.sourceId, offset: value.offset, side: value.side };
}

function readUtilityDevice(value: unknown, floorIds: Set<string>): PlanUtilityDevice | undefined {
  const wallMount = isRecord(value) ? readUtilityWallMount(value.wallMount) : null;
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.floorId !== 'string' || !floorIds.has(value.floorId)
    || !['outlet', 'switch', 'panel', 'waterPoint', 'drain', 'radiator'].includes(String(value.kind))
    || !finite(value.x, -200, 200) || !finite(value.z, -200, 200) || !finite(value.elevation, 0.01, 12)
    || !finite(value.rotation, -Math.PI * 20, Math.PI * 20) || !finite(value.rating, 0.1, 1_000)
    || (value.routeId !== undefined && (typeof value.routeId !== 'string' || !idPattern.test(value.routeId))) || wallMount === null) return undefined;
  const name = text(value.name, 80);
  if (!name) return undefined;
  return { id: value.id, floorId: value.floorId, name, kind: value.kind as PlanUtilityDevice['kind'], x: value.x, z: value.z,
    elevation: value.elevation, rotation: value.rotation, rating: value.rating, ...(typeof value.routeId === 'string' ? { routeId: value.routeId } : {}),
    ...(wallMount ? { wallMount } : {}) };
}

function readOpening(value: unknown, roomsById: Map<string, PlanRoom>): WallOpening | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.roomId !== 'string'
    || !roomsById.has(value.roomId) || typeof value.wallIndex !== 'number' || !Number.isInteger(value.wallIndex) || !['door', 'window'].includes(String(value.kind))
    || !finite(value.offset, 0.02, 0.98) || !finite(value.width, 0.25, 5) || !finite(value.height, 0.3, 4)
    || !finite(value.sillHeight, 0, 3)) return undefined;
  const room = roomsById.get(value.roomId);
  if (!room) return undefined;
  const vertices = roomVertices(room);
  if (value.wallIndex < 0 || value.wallIndex >= vertices.length) return undefined;
  const start = vertices[value.wallIndex]; const end = vertices[(value.wallIndex + 1) % vertices.length];
  if (!start || !end) return undefined;
  const wallLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const halfOpening = value.width / wallLength / 2;
  if (value.width > wallLength - 0.12 || value.offset < halfOpening || value.offset > 1 - halfOpening
    || value.sillHeight + value.height > room.wallHeight - 0.04) return undefined;
  return { id: value.id, roomId: value.roomId, wallIndex: value.wallIndex, kind: value.kind as WallOpening['kind'],
    offset: value.offset, width: value.width, height: value.height, sillHeight: value.sillHeight };
}

function readStandaloneOpening(value: unknown, wallsById: Map<string, PlanWall>): StandaloneWallOpening | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.wallId !== 'string'
    || !wallsById.has(value.wallId) || !['door', 'window'].includes(String(value.kind)) || !finite(value.offset, 0.02, 0.98)
    || !finite(value.width, 0.25, 5) || !finite(value.height, 0.3, 4) || !finite(value.sillHeight, 0, 3)) return undefined;
  const wall = wallsById.get(value.wallId); if (!wall) return undefined;
  const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
  const halfOpening = value.width / length / 2;
  if (value.width > length - 0.12 || value.offset < halfOpening || value.offset > 1 - halfOpening
    || value.sillHeight + value.height > wall.height - 0.04 || value.kind === 'door' && value.sillHeight !== 0) return undefined;
  return { id: value.id, wallId: value.wallId, kind: value.kind as StandaloneWallOpening['kind'], offset: value.offset,
    width: value.width, height: value.height, sillHeight: value.sillHeight };
}

function invalidOpeningGroup<T extends OpeningLike>(openings: T[], wallLength: number) {
  if (openings.length > MAX_OPENINGS_PER_WALL) return true;
  const accepted: T[] = [];
  for (const opening of [...openings].sort((left, right) => left.offset - right.offset)) {
    if (openingsOverlap(opening, accepted, wallLength, false)) return true;
    accepted.push(opening);
  }
  return false;
}

export function parseProjectDocument(value: unknown): ProjectDocument {
  if (!isRecord(value) || value.version !== 1 || !['apartment', 'plot'].includes(String(value.projectType)) || !isRecord(value.site)
    || !finite(value.site.width, 4, 200) || !finite(value.site.depth, 4, 200) || !Array.isArray(value.floors)
    || value.floors.length < 1 || value.floors.length > 12 || !Array.isArray(value.rooms) || value.rooms.length > 500
    || (value.walls !== undefined && !Array.isArray(value.walls)) || (Array.isArray(value.walls) && value.walls.length > 1_000)
    || (value.wallOpenings !== undefined && !Array.isArray(value.wallOpenings)) || (Array.isArray(value.wallOpenings) && value.wallOpenings.length > 1_000)
    || !isRecord(value.wallFinishes) || Object.keys(value.wallFinishes).length > 2_000 || (value.openings !== undefined && !Array.isArray(value.openings))
    || (Array.isArray(value.openings) && value.openings.length > 1_000) || !Array.isArray(value.modelInstances)
    || value.modelInstances.length > 200 || (value.utilities !== undefined && !Array.isArray(value.utilities))
    || (Array.isArray(value.utilities) && value.utilities.length > 2_000) || (value.utilityDevices !== undefined && !Array.isArray(value.utilityDevices))
    || (Array.isArray(value.utilityDevices) && value.utilityDevices.length > 2_000) || (value.utilityRisers !== undefined && !Array.isArray(value.utilityRisers))
    || (Array.isArray(value.utilityRisers) && value.utilityRisers.length > 1_000)) throw new Error('Файл планировки имеет неподдерживаемую структуру.');
  const name = text(value.name, 80);
  if (!name) throw new Error('В файле отсутствует название проекта.');
  const floors = value.floors.map(readFloor);
  if (floors.some((floor) => !floor)) throw new Error('В файле есть некорректный этаж.');
  const validFloors = floors as PlanFloor[];
  const floorIds = new Set(validFloors.map((floor) => floor.id));
  if (floorIds.size !== validFloors.length) throw new Error('Идентификаторы этажей повторяются.');
  const rooms = value.rooms.map((room) => readRoom(room, floorIds));
  if (rooms.some((room) => !room)) throw new Error('В файле есть некорректный блок.');
  const validRooms = rooms as PlanRoom[];
  if (new Set(validRooms.map((room) => room.id)).size !== validRooms.length) throw new Error('Идентификаторы блоков повторяются.');
  const walls = (Array.isArray(value.walls) ? value.walls : []).map((wall) => readWall(wall, floorIds));
  if (walls.some((wall) => !wall)) throw new Error('В файле есть некорректная самостоятельная стена.');
  const validWalls = walls as PlanWall[];
  if (new Set(validWalls.map((wall) => wall.id)).size !== validWalls.length) throw new Error('Идентификаторы стен повторяются.');
  const wallsById = new Map(validWalls.map((wall) => [wall.id, wall]));
  const wallOpenings = (Array.isArray(value.wallOpenings) ? value.wallOpenings : []).map((opening) => readStandaloneOpening(opening, wallsById));
  if (wallOpenings.some((opening) => !opening)) throw new Error('В файле есть некорректный проём самостоятельной стены.');
  const validWallOpenings = wallOpenings as StandaloneWallOpening[];
  if (new Set(validWallOpenings.map((opening) => opening.id)).size !== validWallOpenings.length) throw new Error('Идентификаторы проёмов самостоятельных стен повторяются.');
  const wallOpeningGroups = new Map<string, StandaloneWallOpening[]>();
  for (const opening of validWallOpenings) wallOpeningGroups.set(opening.wallId, [...(wallOpeningGroups.get(opening.wallId) ?? []), opening]);
  for (const wall of validWalls) {
    if (invalidOpeningGroup(wallOpeningGroups.get(wall.id) ?? [], Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ))) {
      throw new Error('Проёмы самостоятельной стены пересекаются или превышают допустимое количество.');
    }
  }
  const roomsById = new Map(validRooms.map((room) => [room.id, room]));
  const openings = (Array.isArray(value.openings) ? value.openings : []).map((opening) => readOpening(opening, roomsById));
  if (openings.some((opening) => !opening)) throw new Error('В файле есть некорректный дверной или оконный проём.');
  const validOpenings = openings as WallOpening[];
  if (new Set(validOpenings.map((opening) => opening.id)).size !== validOpenings.length) throw new Error('Идентификаторы проёмов повторяются.');
  const openingGroups = new Map<string, WallOpening[]>();
  for (const opening of validOpenings) {
    const key = wallIdForOpening(opening); openingGroups.set(key, [...(openingGroups.get(key) ?? []), opening]);
  }
  for (const room of validRooms) {
    const vertices = roomVertices(room);
    for (let wallIndex = 0; wallIndex < vertices.length; wallIndex += 1) {
      const start = vertices[wallIndex]; const end = vertices[(wallIndex + 1) % vertices.length];
      if (!start || !end) continue;
      const group = openingGroups.get(wallIdForOpening({ roomId: room.id, wallIndex })) ?? [];
      if (invalidOpeningGroup(group, Math.hypot(end[0] - start[0], end[1] - start[1]))) {
        throw new Error('Проёмы стены пересекаются или превышают допустимое количество.');
      }
    }
  }
  const wallFinishes: Record<string, WallFinish> = {};
  for (const [key, finish] of Object.entries(value.wallFinishes)) {
    if (!idPattern.test(key) || !isRecord(finish) || typeof finish.color !== 'string' || !colorPattern.test(finish.color)
      || (finish.textureId !== undefined && (typeof finish.textureId !== 'string' || !uuidPattern.test(finish.textureId)))) {
      throw new Error('В файле есть некорректная отделка стены.');
    }
    wallFinishes[key] = { color: finish.color, ...(typeof finish.textureId === 'string' ? { textureId: finish.textureId } : {}) };
  }
  const models = value.modelInstances.map((model) => readModel(model, floorIds));
  if (models.some((model) => !model)) throw new Error('В файле есть некорректный объект.');
  const utilities = (Array.isArray(value.utilities) ? value.utilities : []).map((utility) => readUtility(utility, floorIds));
  if (utilities.some((utility) => !utility)) throw new Error('В файле есть некорректная инженерная трасса.');
  const validUtilities = utilities as PlanUtilityRoute[];
  if (new Set(validUtilities.map((utility) => utility.id)).size !== validUtilities.length) throw new Error('Идентификаторы инженерных трасс повторяются.');
  const utilityDevices = (Array.isArray(value.utilityDevices) ? value.utilityDevices : []).map((device) => readUtilityDevice(device, floorIds));
  if (utilityDevices.some((device) => !device)) throw new Error('В файле есть некорректная инженерная точка.');
  const validUtilityDevices = utilityDevices as PlanUtilityDevice[];
  if (new Set(validUtilityDevices.map((device) => device.id)).size !== validUtilityDevices.length) throw new Error('Идентификаторы инженерных точек повторяются.');
  const utilityRisers = (Array.isArray(value.utilityRisers) ? value.utilityRisers : []).map((riser) => readUtilityRiser(riser, floorIds));
  if (utilityRisers.some((riser) => !riser)) throw new Error('В файле есть некорректный инженерный стояк.');
  const validUtilityRisers = utilityRisers as PlanUtilityRiser[];
  if (new Set(validUtilityRisers.map((riser) => riser.id)).size !== validUtilityRisers.length) throw new Error('Идентификаторы инженерных стояков повторяются.');
  const utilitiesById = new Map(validUtilities.map((route) => [route.id, route]));
  for (const device of validUtilityDevices) {
    if (!device.routeId) continue;
    const route = utilitiesById.get(device.routeId);
    if (!route || route.floorId !== device.floorId || route.kind !== UTILITY_DEVICE_KINDS[device.kind].utilityKind) {
      throw new Error('Инженерная точка привязана к несовместимой трассе.');
    }
  }
  for (const device of validUtilityDevices) {
    if (!device.wallMount) continue;
    const source = device.wallMount.kind === 'room' ? roomsById.get(device.wallMount.sourceId) : wallsById.get(device.wallMount.sourceId);
    if (!source || source.floorId !== device.floorId || device.wallMount.kind === 'room' && device.wallMount.wallIndex >= roomVertices(source as PlanRoom).length) {
      throw new Error('Инженерная точка привязана к отсутствующей стене.');
    }
  }
  const floorsById = new Map(validFloors.map((floor) => [floor.id, floor]));
  for (const riser of validUtilityRisers) {
    const fromFloor = floorsById.get(riser.fromFloorId); const toFloor = floorsById.get(riser.toFloorId);
    if (!fromFloor || !toFloor) throw new Error('Инженерный стояк имеет некорректный диапазон этажей.');
    for (const [routeId, floorId] of [[riser.fromRouteId, riser.fromFloorId], [riser.toRouteId, riser.toFloorId]] as const) {
      if (!routeId) continue;
      const route = utilitiesById.get(routeId);
      if (!route || route.floorId !== floorId || route.kind !== riser.kind) throw new Error('Инженерный стояк привязан к несовместимой трассе.');
    }
  }
  return { version: 1, name, projectType: value.projectType as ProjectType,
    site: { width: value.site.width, depth: value.site.depth }, floors: validFloors, rooms: validRooms, walls: validWalls, wallOpenings: validWallOpenings,
    wallFinishes, openings: validOpenings, modelInstances: models as ModelInstance[], utilities: validUtilities, utilityDevices: validUtilityDevices, utilityRisers: validUtilityRisers };
}

const wallIdForOpening = (opening: Pick<WallOpening, 'roomId' | 'wallIndex'>) => `${opening.roomId}:wall:${opening.wallIndex}`;

export function createProjectDocument(input: { name: string; projectType: ProjectType; site: SiteSettings; floors: PlanFloor[]; rooms: PlanRoom[]; walls: PlanWall[]; wallOpenings: StandaloneWallOpening[]; wallFinishes: Record<string, WallFinish>; openings: WallOpening[]; modelInstances: ModelInstance[]; utilities?: PlanUtilityRoute[]; utilityDevices?: PlanUtilityDevice[]; utilityRisers?: PlanUtilityRiser[] }): ProjectDocument {
  const wallFinishes = Object.fromEntries(Object.entries(input.wallFinishes).map(([id, finish]) => [id, { color: finish.color, ...(finish.textureId && uuidPattern.test(finish.textureId) ? { textureId: finish.textureId } : {}) }]));
  return { version: 1, name: input.name, projectType: input.projectType, site: input.site, floors: input.floors,
    rooms: input.rooms, walls: input.walls, wallOpenings: input.wallOpenings, wallFinishes, openings: input.openings, modelInstances: input.modelInstances,
    utilities: input.utilities ?? [], utilityDevices: input.utilityDevices ?? [], utilityRisers: input.utilityRisers ?? [] };
}

export function saveAutosave(document: ProjectDocument) {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(document)); } catch { /* Storage can be unavailable or full. */ }
}

export function readAutosave() {
  try {
    const value = localStorage.getItem(AUTOSAVE_KEY);
    return value ? parseProjectDocument(JSON.parse(value) as unknown) : undefined;
  } catch { return undefined; }
}

export function downloadProject(project: ProjectDocument) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeDownloadName(project.name)}.spatial.json`);
}

export function safeDownloadName(value: string) {
  return value.replace(/[^A-Za-zА-Яа-я0-9_-]+/g, '-').slice(0, 60) || 'spatial-forge';
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file: File) {
  const lowerName = file.name.toLowerCase();
  if (file.size < 2 || file.size > MAX_PROJECT_FILE_BYTES || (!lowerName.endsWith('.json') && !lowerName.endsWith('.spatial.json'))
    || !['', 'application/json', 'text/json'].includes(file.type)) throw new Error('Выберите JSON-планировку размером до 2 МБ.');
  try { return parseProjectDocument(JSON.parse(await file.text()) as unknown); }
  catch (error) { throw error instanceof Error ? error : new Error('Не удалось прочитать планировку.'); }
}

function safeAssetName(value: string) {
  return stripControls(value).replace(/[/\\]+/g, '_').trim().slice(0, 100) || 'Без названия';
}

async function imageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Изображение не удалось декодировать.'));
    image.src = url;
  });
}

export async function createTextureAsset(file: File): Promise<TextureAsset> {
  const lowerName = file.name.toLowerCase();
  const allowedExtension = ['.png', '.jpg', '.jpeg', '.webp'].some((extension) => lowerName.endsWith(extension));
  if (!allowedExtension || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size < 16 || file.size > MAX_TEXTURE_FILE_BYTES) {
    throw new Error('Нужен PNG, JPEG или WebP размером до 8 МБ.');
  }
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await imageDimensions(url);
    if (dimensions.width < 2 || dimensions.height < 2 || dimensions.width > 8_192 || dimensions.height > 8_192
      || dimensions.width * dimensions.height > 64_000_000) throw new Error('Размер текстуры превышает 8192×8192 пикселей.');
    return { id: crypto.randomUUID(), name: safeAssetName(file.name), url, width: dimensions.width, height: dimensions.height, size: file.size };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

function containsExternalUri(value: unknown) {
  const stack: unknown[] = [value]; let visited = 0;
  while (stack.length) {
    const item = stack.pop(); visited += 1;
    if (visited > 50_000) throw new Error('Структура GLB слишком сложная.');
    if (Array.isArray(item)) { stack.push(...item); continue; }
    if (!isRecord(item)) continue;
    for (const [key, child] of Object.entries(item)) {
      if (key === 'uri' && typeof child === 'string') return true;
      if (typeof child === 'object' && child !== null) stack.push(child);
    }
  }
  return false;
}

export async function createModelAsset(file: File): Promise<ModelAsset> {
  if (!file.name.toLowerCase().endsWith('.glb') || !['', 'model/gltf-binary', 'application/octet-stream'].includes(file.type)
    || file.size < 20 || file.size > MAX_MODEL_FILE_BYTES) throw new Error('Нужна самодостаточная GLB-модель размером до 25 МБ.');
  const buffer = await file.arrayBuffer(); const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== file.size
    || view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(12, true) > file.size - 20) throw new Error('GLB-файл повреждён или использует неподдерживаемую версию.');
  try {
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 20, jsonLength)).replace(/\0+$/g, '').trim()) as unknown;
    if (!isRecord(json) || !isRecord(json.asset) || typeof json.asset.version !== 'string' || !json.asset.version.startsWith('2') || containsExternalUri(json)) {
      throw new Error('GLB должна быть версии 2.0 и не содержать внешних файлов.');
    }
  } catch (error) { throw error instanceof Error ? error : new Error('Не удалось проверить GLB-модель.'); }
  return { id: crypto.randomUUID(), name: safeAssetName(file.name), url: URL.createObjectURL(file), size: file.size };
}
