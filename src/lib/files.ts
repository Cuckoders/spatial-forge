import { roomVertices } from './geometry';
import type { BuiltInModelKind, ModelAsset, ModelInstance, PlanFloor, PlanRoom, ProjectDocument, ProjectType, SiteSettings, TextureAsset, WallFinish, WallOpening } from '../types';

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
  return { id: value.id, name, elevation: value.elevation };
}

function readRoom(value: unknown, floorIds: Set<string>): PlanRoom | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.floorId !== 'string' || !floorIds.has(value.floorId)) return undefined;
  const name = text(value.name, 80);
  if (!name || !['rectangle', 'triangle'].includes(String(value.shape)) || !finite(value.x, -200, 200) || !finite(value.z, -200, 200)
    || !finite(value.width, 0.5, 50) || !finite(value.depth, 0.5, 50) || !finite(value.rotation, -Math.PI * 20, Math.PI * 20)
    || !finite(value.wallHeight, 0.2, 12) || !finite(value.wallThickness, 0.05, 1) || typeof value.floorColor !== 'string' || !colorPattern.test(value.floorColor)) return undefined;
  return { id: value.id, floorId: value.floorId, name, shape: value.shape as PlanRoom['shape'], x: value.x, z: value.z,
    width: value.width, depth: value.depth, rotation: value.rotation, wallHeight: value.wallHeight,
    wallThickness: value.wallThickness, floorColor: value.floorColor };
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

export function parseProjectDocument(value: unknown): ProjectDocument {
  if (!isRecord(value) || value.version !== 1 || !['apartment', 'plot'].includes(String(value.projectType)) || !isRecord(value.site)
    || !finite(value.site.width, 4, 200) || !finite(value.site.depth, 4, 200) || !Array.isArray(value.floors)
    || value.floors.length < 1 || value.floors.length > 12 || !Array.isArray(value.rooms) || value.rooms.length > 500
    || !isRecord(value.wallFinishes) || Object.keys(value.wallFinishes).length > 2_000 || (value.openings !== undefined && !Array.isArray(value.openings))
    || (Array.isArray(value.openings) && value.openings.length > 1_000) || !Array.isArray(value.modelInstances)
    || value.modelInstances.length > 200) throw new Error('Файл планировки имеет неподдерживаемую структуру.');
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
  const roomsById = new Map(validRooms.map((room) => [room.id, room]));
  const openings = (Array.isArray(value.openings) ? value.openings : []).map((opening) => readOpening(opening, roomsById));
  if (openings.some((opening) => !opening)) throw new Error('В файле есть некорректный дверной или оконный проём.');
  const validOpenings = openings as WallOpening[];
  if (new Set(validOpenings.map((opening) => opening.id)).size !== validOpenings.length
    || new Set(validOpenings.map((opening) => wallIdForOpening(opening))).size !== validOpenings.length) throw new Error('Проёмы в файле повторяются.');
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
  return { version: 1, name, projectType: value.projectType as ProjectType,
    site: { width: value.site.width, depth: value.site.depth }, floors: validFloors, rooms: validRooms,
    wallFinishes, openings: validOpenings, modelInstances: models as ModelInstance[] };
}

const wallIdForOpening = (opening: Pick<WallOpening, 'roomId' | 'wallIndex'>) => `${opening.roomId}:wall:${opening.wallIndex}`;

export function createProjectDocument(input: { name: string; projectType: ProjectType; site: SiteSettings; floors: PlanFloor[]; rooms: PlanRoom[]; wallFinishes: Record<string, WallFinish>; openings: WallOpening[]; modelInstances: ModelInstance[] }): ProjectDocument {
  const wallFinishes = Object.fromEntries(Object.entries(input.wallFinishes).map(([id, finish]) => [id, { color: finish.color, ...(finish.textureId && uuidPattern.test(finish.textureId) ? { textureId: finish.textureId } : {}) }]));
  return { version: 1, name: input.name, projectType: input.projectType, site: input.site, floors: input.floors,
    rooms: input.rooms, wallFinishes, openings: input.openings, modelInstances: input.modelInstances };
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
