import { subscribeWithSelector } from 'zustand/middleware';
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

import { createProjectDocument, readAutosave, saveAutosave } from '../lib/files';
import { isSimplePolygon, polygonArea, polygonBounds, normalizeDegrees, roomVertices, snapToGrid, wallId, type Point2 } from '../lib/geometry';
import type { BuiltInModelKind, CameraPreset, EditorTool, ModelAsset, ModelInstance, PlanFloor, PlanRoom, ProjectDocument, ProjectType, Selection, SiteSettings, TextureAsset, WallFinish, WallOpening } from '../types';

interface EditorState {
  projectName: string;
  projectType: ProjectType;
  site: SiteSettings;
  floors: PlanFloor[];
  rooms: PlanRoom[];
  wallFinishes: Record<string, WallFinish>;
  openings: WallOpening[];
  textures: TextureAsset[];
  modelAssets: ModelAsset[];
  modelInstances: ModelInstance[];
  activeFloorId: string;
  showAllFloors: boolean;
  showDimensions: boolean;
  tool: EditorTool;
  draftPolygon: Point2[];
  selection: Selection | null;
  cameraPreset: CameraPreset;
  cameraRevision: number;
  captureRevision: number;
  message: string | null;
  canUndo: boolean;
  canRedo: boolean;
  setProjectName: (name: string) => void;
  setProjectType: (type: ProjectType) => void;
  updateSite: (patch: Partial<SiteSettings>) => void;
  setTool: (tool: EditorTool) => void;
  select: (selection: Selection | null) => void;
  addRoomAt: (shape: PlanRoom['shape'], x: number, z: number) => void;
  addPolygonPoint: (x: number, z: number) => void;
  completePolygon: () => void;
  cancelPolygon: () => void;
  updatePolygonVertex: (id: string, index: number, patch: { x?: number; z?: number }) => void;
  insertPolygonVertex: (id: string, afterIndex: number) => void;
  removePolygonVertex: (id: string, index: number) => void;
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void;
  duplicateRoom: (id: string) => void;
  removeRoom: (id: string) => void;
  setWallFinish: (roomId: string, wallIndex: number, finish: WallFinish) => void;
  clearWallFinish: (roomId: string, wallIndex: number) => void;
  addWallOpening: (roomId: string, wallIndex: number, kind: WallOpening['kind']) => void;
  updateWallOpening: (id: string, patch: Partial<WallOpening>) => void;
  removeWallOpening: (id: string) => void;
  addFloor: () => void;
  updateFloor: (id: string, patch: Partial<Pick<PlanFloor, 'name' | 'elevation'>>) => void;
  duplicateActiveFloor: () => void;
  setActiveFloor: (id: string) => void;
  removeActiveFloor: () => void;
  toggleAllFloors: () => void;
  toggleDimensions: () => void;
  addTexture: (asset: TextureAsset) => void;
  removeTexture: (id: string) => void;
  addModelAsset: (asset: ModelAsset) => void;
  removeModelAsset: (id: string) => void;
  hydrateAssets: (textures: TextureAsset[], models: ModelAsset[]) => void;
  addBuiltInModel: (kind: BuiltInModelKind) => void;
  addCustomModel: (assetId: string) => void;
  updateModel: (id: string, patch: Partial<ModelInstance>) => void;
  duplicateModel: (id: string) => void;
  removeModel: (id: string) => void;
  deleteSelection: () => void;
  rotateSelection: (degrees: number) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  requestCapture: () => void;
  loadProject: (project: ProjectDocument) => void;
  resetProject: () => void;
  notify: (message: string | null) => void;
  undo: () => void;
  redo: () => void;
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;
}

type HistorySnapshot = Pick<EditorState, 'projectName' | 'projectType' | 'site' | 'floors' | 'rooms' | 'wallFinishes' | 'openings' | 'textures' | 'modelAssets' | 'modelInstances' | 'activeFloorId' | 'showAllFloors'>;

const historyPast: HistorySnapshot[] = [];
const historyFuture: HistorySnapshot[] = [];
let lastHistorySnapshot: HistorySnapshot;
let historyBatchStart: HistorySnapshot | null = null;
let restoringHistory = false;
const HISTORY_LIMIT = 60;

const colors = ['#E8DFC9', '#D8E4DD', '#E5D7D7', '#D9DCE8', '#DED6C7'];
const cleanText = (value: string, maximum: number) => Array.from(value, (character) => {
  const code = character.charCodeAt(0);
  return code <= 31 || code === 127 ? ' ' : character;
}).join('').replace(/\s+/g, ' ').trim().slice(0, maximum);
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
const radians = (degrees: number) => degrees * Math.PI / 180;
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function demoProject(): ProjectDocument {
  const floors: PlanFloor[] = [
    { id: 'floor-1', name: '1 этаж', elevation: 0 },
    { id: 'floor-2', name: '2 этаж', elevation: 3.2 },
  ];
  const rooms: PlanRoom[] = [
    { id: 'living', floorId: 'floor-1', name: 'Гостиная', shape: 'rectangle', x: -2.5, z: -1.5, width: 5, depth: 4, rotation: 0, wallHeight: 2.8, wallThickness: 0.16, floorColor: '#CDBA9A' },
    { id: 'kitchen', floorId: 'floor-1', name: 'Кухня', shape: 'rectangle', x: 2.25, z: -1.5, width: 4.5, depth: 4, rotation: 0, wallHeight: 2.8, wallThickness: 0.16, floorColor: '#B9C8BE' },
    { id: 'bedroom', floorId: 'floor-1', name: 'Спальня', shape: 'rectangle', x: -2.75, z: 2.25, width: 4.5, depth: 3.5, rotation: 0, wallHeight: 2.8, wallThickness: 0.16, floorColor: '#C8C4D3' },
    { id: 'terrace', floorId: 'floor-1', name: 'Терраса', shape: 'triangle', x: 2.25, z: 2.25, width: 4.5, depth: 3.5, rotation: 0, wallHeight: 1.1, wallThickness: 0.12, floorColor: '#B9A88A' },
    { id: 'studio', floorId: 'floor-2', name: 'Студия', shape: 'rectangle', x: 0, z: 0, width: 7, depth: 5, rotation: 0, wallHeight: 2.7, wallThickness: 0.16, floorColor: '#D8CFBB' },
  ];
  return {
    version: 1, name: 'Дом у сада', projectType: 'apartment', site: { width: 20, depth: 16 }, floors, rooms,
    wallFinishes: {
      [wallId('living', 0)]: { color: '#EEE8DC' }, [wallId('living', 1)]: { color: '#D7E2DA' },
      [wallId('kitchen', 2)]: { color: '#C9D8CE' }, [wallId('bedroom', 0)]: { color: '#DAD4E4' },
    },
    openings: [
      { id: 'demo-door', roomId: 'living', wallIndex: 2, kind: 'door', offset: 0.68, width: 0.9, height: 2.1, sillHeight: 0 },
      { id: 'demo-window', roomId: 'kitchen', wallIndex: 0, kind: 'window', offset: 0.5, width: 1.6, height: 1.15, sillHeight: 0.9 },
    ],
    modelInstances: [
      { id: 'demo-sofa', floorId: 'floor-1', assetId: 'builtin:sofa', name: 'Диван', x: -2.4, y: 0, z: -1.2, rotation: 0, scale: 1 },
      { id: 'demo-table', floorId: 'floor-1', assetId: 'builtin:table', name: 'Стол', x: 2.2, y: 0, z: -1.3, rotation: 0, scale: 1 },
    ],
  };
}

const initialProject = typeof window === 'undefined' ? demoProject() : readAutosave() ?? demoProject();

function normalizedRoom(room: PlanRoom): PlanRoom {
  return { ...room, name: cleanText(room.name, 80) || 'Блок', x: clamp(room.x, -200, 200), z: clamp(room.z, -200, 200),
    width: clamp(room.width, 0.5, 50), depth: clamp(room.depth, 0.5, 50), rotation: radians(normalizeDegrees(room.rotation * 180 / Math.PI)),
    wallHeight: clamp(room.wallHeight, 0.2, 12), wallThickness: clamp(room.wallThickness, 0.05, 1),
    floorColor: /^#[0-9a-f]{6}$/i.test(room.floorColor) ? room.floorColor : '#D8CFBB' };
}

function normalizedModel(model: ModelInstance): ModelInstance {
  return { ...model, name: cleanText(model.name, 80) || 'Объект', x: clamp(model.x, -200, 200), y: clamp(model.y, -10, 50),
    z: clamp(model.z, -200, 200), rotation: radians(normalizeDegrees(model.rotation * 180 / Math.PI)), scale: clamp(model.scale, 0.05, 20) };
}

function fitOpeningToRoom(opening: WallOpening, room: PlanRoom): WallOpening | undefined {
  const vertices = roomVertices(room); const start = vertices[opening.wallIndex]; const end = vertices[(opening.wallIndex + 1) % vertices.length];
  if (!start || !end || room.wallHeight < 0.34) return undefined;
  const wallLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (wallLength < 0.37) return undefined;
  const width = clamp(opening.width, 0.25, Math.min(5, wallLength - 0.12));
  const sillHeight = opening.kind === 'door' ? 0 : clamp(opening.sillHeight, 0, Math.max(0, room.wallHeight - 0.34));
  const height = clamp(opening.height, 0.3, Math.min(4, room.wallHeight - sillHeight - 0.04));
  const halfOffset = width / wallLength / 2;
  return { ...opening, width, height, sillHeight, offset: clamp(opening.offset, halfOffset, 1 - halfOffset) };
}

function remapRoomFinishes(finishes: Record<string, WallFinish>, roomId: string, sourceWallIndices: number[]) {
  const next = Object.fromEntries(Object.entries(finishes).filter(([key]) => !key.startsWith(`${roomId}:wall:`)));
  sourceWallIndices.forEach((sourceIndex, targetIndex) => {
    const finish = finishes[wallId(roomId, sourceIndex)];
    if (finish) next[wallId(roomId, targetIndex)] = finish;
  });
  return next;
}

export const useEditorStore = create<EditorState>()(subscribeWithSelector((set, get) => ({
  projectName: initialProject.name,
  projectType: initialProject.projectType,
  site: initialProject.site,
  floors: initialProject.floors,
  rooms: initialProject.rooms,
  wallFinishes: initialProject.wallFinishes,
  openings: initialProject.openings,
  textures: [],
  modelAssets: [],
  modelInstances: initialProject.modelInstances,
  activeFloorId: initialProject.floors[0]?.id ?? 'floor-1',
  showAllFloors: false,
  showDimensions: false,
  tool: 'select',
  draftPolygon: [],
  selection: null,
  cameraPreset: 'perspective',
  cameraRevision: 0,
  captureRevision: 0,
  message: null,
  canUndo: false,
  canRedo: false,
  setProjectName: (name) => set({ projectName: cleanText(name, 80) || 'Новый проект' }),
  setProjectType: (projectType) => set({ projectType, selection: null }),
  updateSite: (patch) => set((state) => ({ site: { width: clamp(patch.width ?? state.site.width, 4, 200), depth: clamp(patch.depth ?? state.site.depth, 4, 200) } })),
  setTool: (tool) => set({ tool, selection: null, draftPolygon: [] }),
  select: (selection) => set({ selection, tool: 'select', draftPolygon: [] }),
  addRoomAt: (shape, x, z) => set((state) => {
    const id = newId('block'); const count = state.rooms.filter((room) => room.floorId === state.activeFloorId).length + 1;
    const room: PlanRoom = { id, floorId: state.activeFloorId, name: shape === 'triangle' ? `Треугольник ${count}` : `Комната ${count}`,
      shape, x: snapToGrid(x), z: snapToGrid(z), width: shape === 'triangle' ? 4 : 4, depth: shape === 'triangle' ? 3.5 : 3,
      rotation: 0, wallHeight: state.projectType === 'plot' ? 1.2 : 2.8, wallThickness: 0.16,
      floorColor: colors[state.rooms.length % colors.length] ?? '#D8CFBB' };
    return { rooms: [...state.rooms, room], selection: { kind: 'room', id }, tool: 'select', draftPolygon: [], message: 'Блок добавлен на сетку' };
  }),
  addPolygonPoint: (x, z) => {
    const point = [snapToGrid(x), snapToGrid(z)] as const;
    const points = get().draftPolygon;
    const first = points[0]; const last = points.at(-1);
    if (first && points.length >= 3 && point[0] === first[0] && point[1] === first[1]) { get().completePolygon(); return; }
    if (last && point[0] === last[0] && point[1] === last[1]) return;
    if (points.length >= 24) { set({ message: 'В одном контуре можно поставить до 24 точек' }); return; }
    set({ draftPolygon: [...points, point], message: points.length === 0 ? 'Поставьте ещё минимум две точки' : null });
  },
  completePolygon: () => set((state) => {
    if (state.tool !== 'polygon') return state;
    const points = state.draftPolygon;
    if (points.length < 3) return { message: 'Для контура нужны минимум три точки' };
    if (!isSimplePolygon(points)) return { message: 'Линии контура не должны пересекаться' };
    if (polygonArea(points) < 0.25) return { message: 'Площадь контура должна быть не меньше 0,25 м²' };
    const bounds = polygonBounds(points);
    if (bounds.width < 0.5 || bounds.depth < 0.5 || bounds.width > 50 || bounds.depth > 50) return { message: 'Габариты контура должны быть от 0,5 до 50 м' };
    const x = (bounds.minX + bounds.maxX) / 2; const z = (bounds.minZ + bounds.maxZ) / 2;
    const vertices = points.map((point) => [point[0] - x, point[1] - z] as [number, number]);
    const id = newId('block'); const count = state.rooms.filter((room) => room.floorId === state.activeFloorId).length + 1;
    const room: PlanRoom = { id, floorId: state.activeFloorId, name: `Контур ${count}`, shape: 'polygon', vertices, x, z,
      width: bounds.width, depth: bounds.depth, rotation: 0, wallHeight: state.projectType === 'plot' ? 1.2 : 2.8,
      wallThickness: 0.16, floorColor: colors[state.rooms.length % colors.length] ?? '#D8CFBB' };
    return { rooms: [...state.rooms, room], selection: { kind: 'room', id }, tool: 'select', draftPolygon: [], message: 'Произвольный контур создан' };
  }),
  cancelPolygon: () => set((state) => ({ draftPolygon: [], tool: 'select', ...(state.draftPolygon.length ? { message: 'Построение контура отменено' } : {}) })),
  updatePolygonVertex: (id, index, patch) => set((state) => {
    const room = state.rooms.find((item) => item.id === id);
    if (!room || room.shape !== 'polygon' || !room.vertices?.[index]
      || patch.x !== undefined && !Number.isFinite(patch.x) || patch.z !== undefined && !Number.isFinite(patch.z)) return state;
    const vertices = room.vertices.map((point, pointIndex) => pointIndex === index
      ? [clamp(patch.x ?? point[0], -50, 50), clamp(patch.z ?? point[1], -50, 50)] as [number, number]
      : point);
    if (!isSimplePolygon(vertices)) return { message: 'Такое положение создаёт пересечение стен' };
    if (polygonArea(vertices) < 0.25) return { message: 'Площадь контура должна быть не меньше 0,25 м²' };
    const bounds = polygonBounds(vertices);
    if (bounds.width < 0.5 || bounds.depth < 0.5 || bounds.width > 50 || bounds.depth > 50) return { message: 'Габариты контура должны быть от 0,5 до 50 м' };
    const updatedRoom = { ...room, vertices, width: bounds.width, depth: bounds.depth };
    const openings = state.openings.flatMap((opening) => {
      if (opening.roomId !== id) return [opening];
      const fitted = fitOpeningToRoom(opening, updatedRoom); return fitted ? [fitted] : [];
    });
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item), openings };
  }),
  insertPolygonVertex: (id, afterIndex) => set((state) => {
    const room = state.rooms.find((item) => item.id === id);
    const source = room?.vertices;
    if (!room || room.shape !== 'polygon' || !source || !source[afterIndex]) return state;
    if (source.length >= 24) return { message: 'В одном контуре можно создать до 24 вершин' };
    const nextPoint = source[(afterIndex + 1) % source.length]; if (!nextPoint) return state;
    const midpoint = [(source[afterIndex][0] + nextPoint[0]) / 2, (source[afterIndex][1] + nextPoint[1]) / 2] as [number, number];
    const vertices = [...source.slice(0, afterIndex + 1), midpoint, ...source.slice(afterIndex + 1)];
    const updatedRoom = { ...room, vertices };
    const sourceWallIndices = vertices.map((_, targetIndex) => targetIndex <= afterIndex ? targetIndex : targetIndex === afterIndex + 1 ? afterIndex : targetIndex - 1);
    const openings = state.openings.flatMap((opening) => {
      if (opening.roomId !== id) return [opening];
      const remapped = opening.wallIndex < afterIndex ? opening
        : opening.wallIndex > afterIndex ? { ...opening, wallIndex: opening.wallIndex + 1 }
          : opening.offset <= 0.5 ? { ...opening, offset: opening.offset * 2 }
            : { ...opening, wallIndex: opening.wallIndex + 1, offset: (opening.offset - 0.5) * 2 };
      const fitted = fitOpeningToRoom(remapped, updatedRoom); return fitted ? [fitted] : [];
    });
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item),
      wallFinishes: remapRoomFinishes(state.wallFinishes, id, sourceWallIndices), openings, message: 'Новая вершина добавлена в середину стены' };
  }),
  removePolygonVertex: (id, index) => set((state) => {
    const room = state.rooms.find((item) => item.id === id);
    const source = room?.vertices;
    if (!room || room.shape !== 'polygon' || !source || !source[index]) return state;
    if (source.length <= 3) return { message: 'В контуре должны остаться минимум три вершины' };
    const vertices = source.filter((_, pointIndex) => pointIndex !== index);
    if (!isSimplePolygon(vertices)) return { message: 'Удаление этой вершины создаст пересечение стен' };
    if (polygonArea(vertices) < 0.25) return { message: 'После удаления площадь будет меньше 0,25 м²' };
    const bounds = polygonBounds(vertices);
    if (bounds.width < 0.5 || bounds.depth < 0.5) return { message: 'После удаления контур станет слишком узким' };
    const updatedRoom = { ...room, vertices, width: bounds.width, depth: bounds.depth };
    const sourceWallIndices = source.map((_, sourceIndex) => sourceIndex).filter((sourceIndex) => sourceIndex !== index);
    const previousIndex = (index - 1 + source.length) % source.length;
    const removedOpening = state.openings.some((opening) => opening.roomId === id && (opening.wallIndex === previousIndex || opening.wallIndex === index));
    const openings = state.openings.flatMap((opening) => {
      if (opening.roomId !== id) return [opening];
      if (opening.wallIndex === previousIndex || opening.wallIndex === index) return [];
      const wallIndex = sourceWallIndices.indexOf(opening.wallIndex); if (wallIndex < 0) return [];
      const fitted = fitOpeningToRoom({ ...opening, wallIndex }, updatedRoom); return fitted ? [fitted] : [];
    });
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item),
      wallFinishes: remapRoomFinishes(state.wallFinishes, id, sourceWallIndices), openings,
      message: removedOpening ? 'Вершина и проёмы соседних стен удалены' : 'Вершина удалена' };
  }),
  updateRoom: (id, patch) => set((state) => {
    let updatedRoom: PlanRoom | undefined;
    const rooms = state.rooms.map((room) => {
      if (room.id !== id) return room;
      updatedRoom = normalizedRoom({ ...room, ...patch, id: room.id, floorId: room.floorId, shape: room.shape });
      return updatedRoom;
    });
    if (!updatedRoom) return state;
    const nextRoom = updatedRoom;
    const openings = state.openings.flatMap((opening) => {
      if (opening.roomId !== id) return [opening];
      const fitted = fitOpeningToRoom(opening, nextRoom); return fitted ? [fitted] : [];
    });
    return { rooms, openings };
  }),
  duplicateRoom: (id) => set((state) => {
    const source = state.rooms.find((room) => room.id === id); if (!source) return state;
    const copy = { ...source, id: newId('block'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 1, z: source.z + 1 };
    const copiedOpenings = state.openings.filter((opening) => opening.roomId === source.id)
      .map((opening) => ({ ...opening, id: newId('opening'), roomId: copy.id }));
    return { rooms: [...state.rooms, copy], openings: [...state.openings, ...copiedOpenings], selection: { kind: 'room', id: copy.id }, message: 'Блок скопирован' };
  }),
  removeRoom: (id) => set((state) => ({ rooms: state.rooms.filter((room) => room.id !== id),
    wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => !key.startsWith(`${id}:wall:`))),
    openings: state.openings.filter((opening) => opening.roomId !== id),
    selection: state.selection?.kind === 'room' && state.selection.id === id || state.selection?.kind === 'wall' && state.selection.roomId === id ? null : state.selection })),
  setWallFinish: (roomId, wallIndex, finish) => set((state) => {
    const color = /^#[0-9a-f]{6}$/i.test(finish.color) ? finish.color : '#E7E1D7';
    const textureId = finish.textureId && state.textures.some((texture) => texture.id === finish.textureId) ? finish.textureId : undefined;
    return { wallFinishes: { ...state.wallFinishes, [wallId(roomId, wallIndex)]: { color, ...(textureId ? { textureId } : {}) } } };
  }),
  clearWallFinish: (roomId, wallIndex) => set((state) => {
    const finishes = { ...state.wallFinishes }; delete finishes[wallId(roomId, wallIndex)]; return { wallFinishes: finishes };
  }),
  addWallOpening: (roomId, wallIndex, kind) => set((state) => {
    const room = state.rooms.find((item) => item.id === roomId); if (!room) return state;
    const vertices = roomVertices(room); const start = vertices[wallIndex]; const end = vertices[(wallIndex + 1) % vertices.length];
    if (!start || !end) return state;
    const wallLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const width = Math.max(0.25, Math.min(kind === 'door' ? 0.9 : 1.6, wallLength - 0.12));
    const sillHeight = kind === 'door' ? 0 : Math.min(0.9, Math.max(0.1, room.wallHeight - 0.7));
    const height = Math.max(0.3, Math.min(kind === 'door' ? 2.1 : 1.2, room.wallHeight - sillHeight - 0.05));
    const existing = state.openings.find((opening) => opening.roomId === roomId && opening.wallIndex === wallIndex);
    const opening = fitOpeningToRoom({ id: existing?.id ?? newId('opening'), roomId, wallIndex, kind, offset: 0.5, width, height, sillHeight }, room);
    if (!opening) return { message: 'Стена слишком мала для проёма' };
    return { openings: existing ? state.openings.map((item) => item.id === existing.id ? opening : item) : [...state.openings, opening], message: kind === 'door' ? 'Дверной проём добавлен' : 'Оконный проём добавлен' };
  }),
  updateWallOpening: (id, patch) => set((state) => ({ openings: state.openings.map((opening) => {
    if (opening.id !== id) return opening;
    const room = state.rooms.find((item) => item.id === opening.roomId); if (!room) return opening;
    return fitOpeningToRoom({ ...opening, width: patch.width ?? opening.width, height: patch.height ?? opening.height,
      sillHeight: patch.sillHeight ?? opening.sillHeight, offset: patch.offset ?? opening.offset }, room) ?? opening;
  }) })),
  removeWallOpening: (id) => set((state) => ({ openings: state.openings.filter((opening) => opening.id !== id), message: 'Проём удалён' })),
  addFloor: () => set((state) => {
    if (state.floors.length >= 12) return { message: 'Можно создать не больше 12 этажей' };
    const floor: PlanFloor = { id: newId('floor'), name: `${state.floors.length + 1} этаж`, elevation: Math.max(...state.floors.map((item) => item.elevation)) + 3.2 };
    return { floors: [...state.floors, floor], activeFloorId: floor.id, selection: null, showAllFloors: false, message: 'Новый этаж создан' };
  }),
  updateFloor: (id, patch) => set((state) => ({ floors: state.floors.map((floor) => floor.id === id ? {
    ...floor, name: patch.name === undefined ? floor.name : cleanText(patch.name, 80) || floor.name,
    elevation: patch.elevation === undefined ? floor.elevation : clamp(patch.elevation, -20, 60),
  } : floor) })),
  duplicateActiveFloor: () => set((state) => {
    if (state.floors.length >= 12) return { message: 'Можно создать не больше 12 этажей' };
    const sourceFloor = state.floors.find((floor) => floor.id === state.activeFloorId); if (!sourceFloor) return state;
    const floor: PlanFloor = { id: newId('floor'), name: `${sourceFloor.name} — копия`.slice(0, 80), elevation: Math.min(60, Math.max(...state.floors.map((item) => item.elevation)) + 3.2) };
    const sourceRooms = state.rooms.filter((room) => room.floorId === sourceFloor.id);
    const roomIds = new Map(sourceRooms.map((room) => [room.id, newId('block')]));
    const rooms = sourceRooms.map((room) => ({ ...room, id: roomIds.get(room.id) ?? newId('block'), floorId: floor.id }));
    const openings = state.openings.flatMap((opening) => {
      const roomId = roomIds.get(opening.roomId); return roomId ? [{ ...opening, id: newId('opening'), roomId }] : [];
    });
    const wallFinishes = { ...state.wallFinishes };
    for (const sourceRoom of sourceRooms) {
      const targetRoomId = roomIds.get(sourceRoom.id); if (!targetRoomId) continue;
      const wallCount = roomVertices(sourceRoom).length;
      for (let index = 0; index < wallCount; index += 1) {
        const finish = state.wallFinishes[wallId(sourceRoom.id, index)];
        if (finish) wallFinishes[wallId(targetRoomId, index)] = finish;
      }
    }
    const models = state.modelInstances.filter((model) => model.floorId === sourceFloor.id)
      .map((model) => ({ ...model, id: newId('object'), floorId: floor.id }));
    return { floors: [...state.floors, floor], rooms: [...state.rooms, ...rooms], openings: [...state.openings, ...openings],
      wallFinishes, modelInstances: [...state.modelInstances, ...models], activeFloorId: floor.id, selection: null,
      showAllFloors: false, message: 'Этаж скопирован вместе с содержимым' };
  }),
  setActiveFloor: (activeFloorId) => set((state) => state.floors.some((floor) => floor.id === activeFloorId) ? { activeFloorId, selection: null, draftPolygon: [] } : state),
  removeActiveFloor: () => set((state) => {
    if (state.floors.length === 1) return { message: 'В проекте должен остаться хотя бы один этаж' };
    const remaining = state.floors.filter((floor) => floor.id !== state.activeFloorId);
    const removedRoomIds = new Set(state.rooms.filter((room) => room.floorId === state.activeFloorId).map((room) => room.id));
    return { floors: remaining, rooms: state.rooms.filter((room) => room.floorId !== state.activeFloorId),
      wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => ![...removedRoomIds].some((id) => key.startsWith(`${id}:wall:`)))),
      openings: state.openings.filter((opening) => !removedRoomIds.has(opening.roomId)),
      modelInstances: state.modelInstances.filter((model) => model.floorId !== state.activeFloorId), activeFloorId: remaining[0]?.id ?? '', selection: null, message: 'Этаж удалён' };
  }),
  toggleAllFloors: () => set((state) => ({ showAllFloors: !state.showAllFloors })),
  toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),
  addTexture: (asset) => set((state) => ({ textures: [...state.textures, asset], message: 'Текстура готова к применению' })),
  removeTexture: (id) => set((state) => ({
    textures: state.textures.filter((texture) => texture.id !== id),
    wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).map(([key, finish]) => [key,
      finish.textureId === id ? { color: finish.color } : finish])),
    message: 'Текстура удалена из библиотеки',
  })),
  addModelAsset: (asset) => set((state) => ({ modelAssets: [...state.modelAssets, asset], message: 'GLB-модель добавлена в библиотеку' })),
  removeModelAsset: (id) => set((state) => ({
    modelAssets: state.modelAssets.filter((asset) => asset.id !== id),
    modelInstances: state.modelInstances.filter((model) => model.assetId !== id),
    selection: state.selection?.kind === 'model' && state.modelInstances.some((model) => model.id === state.selection?.id && model.assetId === id) ? null : state.selection,
    message: 'Модель и её экземпляры удалены',
  })),
  hydrateAssets: (textures, models) => {
    restoringHistory = true;
    set({ textures, modelAssets: models });
  },
  addBuiltInModel: (kind) => set((state) => {
    const labels: Record<BuiltInModelKind, string> = { sofa: 'Диван', table: 'Стол', bed: 'Кровать', tree: 'Дерево', stairs: 'Лестница' };
    const model: ModelInstance = { id: newId('object'), floorId: state.activeFloorId, assetId: `builtin:${kind}`, name: labels[kind], x: 0, y: 0, z: 0, rotation: 0, scale: 1 };
    return { modelInstances: [...state.modelInstances, model], selection: { kind: 'model', id: model.id }, tool: 'select', message: `${labels[kind]} добавлен` };
  }),
  addCustomModel: (assetId) => set((state) => {
    const asset = state.modelAssets.find((item) => item.id === assetId); if (!asset) return state;
    const model: ModelInstance = { id: newId('object'), floorId: state.activeFloorId, assetId, name: asset.name.replace(/\.glb$/i, ''), x: 0, y: 0, z: 0, rotation: 0, scale: 1 };
    return { modelInstances: [...state.modelInstances, model], selection: { kind: 'model', id: model.id }, tool: 'select', message: 'Модель размещена в центре этажа' };
  }),
  updateModel: (id, patch) => set((state) => ({ modelInstances: state.modelInstances.map((model) => model.id === id ? normalizedModel({ ...model, ...patch, id: model.id, floorId: model.floorId, assetId: model.assetId }) : model) })),
  duplicateModel: (id) => set((state) => {
    const source = state.modelInstances.find((model) => model.id === id); if (!source) return state;
    const copy = { ...source, id: newId('object'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 1, z: source.z + 1 };
    return { modelInstances: [...state.modelInstances, copy], selection: { kind: 'model', id: copy.id }, message: 'Объект скопирован' };
  }),
  removeModel: (id) => set((state) => ({ modelInstances: state.modelInstances.filter((model) => model.id !== id), selection: state.selection?.kind === 'model' && state.selection.id === id ? null : state.selection })),
  deleteSelection: () => {
    const selection = get().selection;
    if (selection?.kind === 'room') get().removeRoom(selection.id);
    else if (selection?.kind === 'model') get().removeModel(selection.id);
    else if (selection?.kind === 'wall') get().clearWallFinish(selection.roomId, selection.wallIndex);
  },
  rotateSelection: (degrees) => {
    const selection = get().selection;
    if (selection?.kind === 'room') { const room = get().rooms.find((item) => item.id === selection.id); if (room) get().updateRoom(room.id, { rotation: room.rotation + radians(degrees) }); }
    if (selection?.kind === 'model') { const model = get().modelInstances.find((item) => item.id === selection.id); if (model) get().updateModel(model.id, { rotation: model.rotation + radians(degrees) }); }
  },
  setCameraPreset: (cameraPreset) => set((state) => ({ cameraPreset, cameraRevision: state.cameraRevision + 1 })),
  requestCapture: () => set((state) => ({ captureRevision: state.captureRevision + 1 })),
  loadProject: (project) => set({ projectName: project.name, projectType: project.projectType, site: project.site,
    floors: project.floors, rooms: project.rooms, wallFinishes: project.wallFinishes, openings: project.openings, modelInstances: project.modelInstances,
    activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', draftPolygon: [], message: 'Планировка загружена' }),
  resetProject: () => {
    const project = demoProject();
    set({ projectName: project.name, projectType: project.projectType, site: project.site, floors: project.floors,
      rooms: project.rooms, wallFinishes: project.wallFinishes, openings: project.openings, modelInstances: project.modelInstances,
      activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', draftPolygon: [], message: 'Демо-проект восстановлен' });
  },
  notify: (message) => set({ message }),
  undo: () => undoHistory(),
  redo: () => redoHistory(),
  beginHistoryBatch: () => beginHistoryBatch(),
  endHistoryBatch: () => endHistoryBatch(),
})));

function captureHistory(state: EditorState): HistorySnapshot {
  return {
    projectName: state.projectName, projectType: state.projectType, site: state.site, floors: state.floors,
    rooms: state.rooms, wallFinishes: state.wallFinishes, openings: state.openings, textures: state.textures, modelAssets: state.modelAssets,
    modelInstances: state.modelInstances, activeFloorId: state.activeFloorId, showAllFloors: state.showAllFloors,
  };
}

function sameHistory(left: HistorySnapshot, right: HistorySnapshot) {
  return left.projectName === right.projectName && left.projectType === right.projectType && left.site === right.site
    && left.floors === right.floors && left.rooms === right.rooms && left.wallFinishes === right.wallFinishes && left.openings === right.openings
    && left.textures === right.textures && left.modelAssets === right.modelAssets && left.modelInstances === right.modelInstances
    && left.activeFloorId === right.activeFloorId && left.showAllFloors === right.showAllFloors;
}

function updateHistoryAvailability() {
  useEditorStore.setState({ canUndo: historyPast.length > 0, canRedo: historyFuture.length > 0 });
}

function beginHistoryBatch() {
  historyBatchStart ??= captureHistory(useEditorStore.getState());
}

function endHistoryBatch() {
  if (!historyBatchStart) return;
  const current = captureHistory(useEditorStore.getState());
  if (!sameHistory(historyBatchStart, current)) {
    historyPast.push(historyBatchStart);
    if (historyPast.length > HISTORY_LIMIT) historyPast.shift();
    historyFuture.length = 0;
  }
  historyBatchStart = null;
  lastHistorySnapshot = current;
  updateHistoryAvailability();
}

function undoHistory() {
  if (historyBatchStart) endHistoryBatch();
  const previous = historyPast.pop();
  if (!previous) return;
  historyFuture.push(captureHistory(useEditorStore.getState()));
  restoringHistory = true;
  useEditorStore.setState({ ...previous, selection: null, tool: 'select', draftPolygon: [], message: 'Действие отменено', canUndo: historyPast.length > 0, canRedo: true });
}

function redoHistory() {
  if (historyBatchStart) endHistoryBatch();
  const next = historyFuture.pop();
  if (!next) return;
  historyPast.push(captureHistory(useEditorStore.getState()));
  restoringHistory = true;
  useEditorStore.setState({ ...next, selection: null, tool: 'select', draftPolygon: [], message: 'Действие повторено', canUndo: true, canRedo: historyFuture.length > 0 });
}

lastHistorySnapshot = captureHistory(useEditorStore.getState());

useEditorStore.subscribe(
  (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.wallFinishes, state.openings, state.textures, state.modelAssets, state.modelInstances, state.activeFloorId, state.showAllFloors] as const,
  () => {
    const current = captureHistory(useEditorStore.getState());
    if (restoringHistory) { restoringHistory = false; lastHistorySnapshot = current; return; }
    if (historyBatchStart) { lastHistorySnapshot = current; return; }
    historyPast.push(lastHistorySnapshot);
    if (historyPast.length > HISTORY_LIMIT) historyPast.shift();
    historyFuture.length = 0;
    lastHistorySnapshot = current;
    updateHistoryAvailability();
  },
  { equalityFn: shallow },
);

if (typeof window !== 'undefined') {
  let saveTimer: number | undefined;
  useEditorStore.subscribe(
    (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.wallFinishes, state.openings, state.modelInstances] as const,
    ([name, projectType, site, floors, rooms, wallFinishes, openings, modelInstances]) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveAutosave(createProjectDocument({ name, projectType, site, floors, rooms, wallFinishes, openings, modelInstances })), 180);
    },
    { equalityFn: shallow },
  );
}
