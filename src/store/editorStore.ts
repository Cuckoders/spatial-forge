import { subscribeWithSelector } from 'zustand/middleware';
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

import { createProjectDocument, readAutosave, saveAutosave } from '../lib/files';
import { isSimplePolygon, polygonArea, polygonBounds, normalizeDegrees, roomVertices, snapToGrid, wallId, type Point2 } from '../lib/geometry';
import { findAvailableOpeningOffset, MAX_OPENINGS_PER_WALL, OPENING_EDGE_CLEARANCE, openingsOverlap, type OpeningLike } from '../lib/openings';
import { pointsMatch, snapWallPoint } from '../lib/wallSnapping';
import type { BuiltInModelKind, CameraPreset, EditorTool, ModelAsset, ModelInstance, ObjectSelection, PlanFloor, PlanRoom, PlanWall, ProjectDocument, ProjectType, Selection, SiteSettings, SnapGuide, StandaloneWallOpening, TextureAsset, TransformMode, WallFinish, WallOpening, WallSnapTarget } from '../types';

interface EditorState {
  projectName: string;
  projectType: ProjectType;
  site: SiteSettings;
  floors: PlanFloor[];
  rooms: PlanRoom[];
  walls: PlanWall[];
  wallOpenings: StandaloneWallOpening[];
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
  draftWallStart: Point2 | null;
  draftWallStartSnap: WallSnapTarget | null;
  draftWallEnd: Point2 | null;
  draftWallSnap: WallSnapTarget | null;
  draftWallChain: { start: Point2; segmentCount: number } | null;
  draftWallPrecision: boolean;
  selection: Selection | null;
  snapGuides: SnapGuide[];
  transformMode: TransformMode;
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
  select: (selection: Selection | null, additive?: boolean) => void;
  selectObjects: (selections: ObjectSelection[], additive?: boolean) => void;
  setSnapGuides: (guides: SnapGuide[]) => void;
  setTransformMode: (mode: TransformMode) => void;
  addRoomAt: (shape: PlanRoom['shape'], x: number, z: number) => void;
  addPolygonPoint: (x: number, z: number) => void;
  previewWall: (x: number, z: number) => void;
  addWallPoint: (x: number, z: number, exact?: boolean) => void;
  setWallDraftPolar: (length: number, angleDegrees: number) => void;
  commitWallDraft: () => void;
  completeWallChain: () => void;
  completePolygon: () => void;
  cancelPolygon: () => void;
  updatePolygonVertex: (id: string, index: number, patch: { x?: number; z?: number }) => void;
  insertPolygonVertex: (id: string, afterIndex: number) => void;
  removePolygonVertex: (id: string, index: number) => void;
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void;
  duplicateRoom: (id: string) => void;
  removeRoom: (id: string) => void;
  updateWall: (id: string, patch: Partial<PlanWall>) => void;
  setStandaloneWallFinish: (id: string, side: 'front' | 'back', finish: WallFinish) => void;
  clearStandaloneWallFinish: (id: string, side: 'front' | 'back') => void;
  duplicateWall: (id: string) => void;
  removeWall: (id: string) => void;
  addStandaloneWallOpening: (wallId: string, kind: StandaloneWallOpening['kind']) => void;
  updateStandaloneWallOpening: (id: string, patch: Partial<StandaloneWallOpening>) => void;
  removeStandaloneWallOpening: (id: string) => void;
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
  moveSelectedObjects: (dx: number, dz: number) => void;
  rotateSelectedObjects: (radians: number, center?: { x: number; z: number }) => void;
  scaleSelectedObjects: (factor: number, center?: { x: number; z: number }) => void;
  duplicateSelection: () => void;
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

type HistorySnapshot = Pick<EditorState, 'projectName' | 'projectType' | 'site' | 'floors' | 'rooms' | 'walls' | 'wallOpenings' | 'wallFinishes' | 'openings' | 'textures' | 'modelAssets' | 'modelInstances' | 'activeFloorId' | 'showAllFloors'>;

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
const objectSelectionKey = (selection: ObjectSelection) => `${selection.kind}:${selection.id}`;
const isObjectSelection = (selection: Selection): selection is ObjectSelection => selection.kind === 'room' || selection.kind === 'model';
const collapseObjectSelection = (items: ObjectSelection[]): Selection | null => items.length === 0 ? null : items.length === 1 ? items[0]! : { kind: 'group', items };

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
    version: 1, name: 'Дом у сада', projectType: 'apartment', site: { width: 20, depth: 16 }, floors, rooms, walls: [], wallOpenings: [],
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

function normalizedWall(wall: PlanWall): PlanWall {
  const normalizeFinish = (finish: WallFinish): WallFinish => ({
    color: /^#[0-9a-f]{6}$/i.test(finish.color) ? finish.color : '#E9E4DA',
    ...(finish.textureId ? { textureId: finish.textureId } : {}),
  });
  return { ...wall, name: cleanText(wall.name, 80) || 'Стена', startX: clamp(wall.startX, -200, 200), startZ: clamp(wall.startZ, -200, 200),
    endX: clamp(wall.endX, -200, 200), endZ: clamp(wall.endZ, -200, 200), height: clamp(wall.height, 0.2, 12),
    thickness: clamp(wall.thickness, 0.05, 1), color: /^#[0-9a-f]{6}$/i.test(wall.color) ? wall.color : '#E9E4DA',
    ...(wall.frontFinish ? { frontFinish: normalizeFinish(wall.frontFinish) } : {}),
    ...(wall.backFinish ? { backFinish: normalizeFinish(wall.backFinish) } : {}) };
}

function fitStandaloneOpening(opening: StandaloneWallOpening, wall: PlanWall): StandaloneWallOpening | undefined {
  const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
  if (length < 0.37 || wall.height < 0.34) return undefined;
  const width = clamp(opening.width, 0.25, Math.min(5, length - 0.12));
  const sillHeight = opening.kind === 'door' ? 0 : clamp(opening.sillHeight, 0, Math.max(0, wall.height - 0.34));
  const height = clamp(opening.height, 0.3, Math.min(4, wall.height - sillHeight - 0.04));
  const halfOffset = (width / 2 + OPENING_EDGE_CLEARANCE) / length;
  return { ...opening, width, height, sillHeight, offset: clamp(opening.offset, halfOffset, 1 - halfOffset) };
}

function fitOpeningGroup<T extends OpeningLike>(openings: T[], wallLength: number, fit: (opening: T) => T | undefined) {
  const accepted: T[] = [];
  for (const opening of [...openings].sort((left, right) => left.offset - right.offset)) {
    const fitted = fit(opening);
    if (!fitted) continue;
    if (!openingsOverlap(fitted, accepted, wallLength)) { accepted.push(fitted); continue; }
    const offset = findAvailableOpeningOffset(wallLength, fitted.width, accepted, fitted.offset);
    if (offset !== undefined) accepted.push({ ...fitted, offset });
  }
  return accepted;
}

function fitStandaloneOpeningGroup(openings: StandaloneWallOpening[], wall: PlanWall) {
  const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
  return fitOpeningGroup(openings, length, (opening) => fitStandaloneOpening(opening, wall));
}

function splitWallsAtTargets(walls: PlanWall[], wallOpenings: StandaloneWallOpening[], targets: Array<WallSnapTarget | null>) {
  const targetsByWall = new Map<string, WallSnapTarget[]>();
  for (const target of targets) {
    if (target?.kind !== 'segment') continue;
    const wallTargets = targetsByWall.get(target.wallId) ?? [];
    if (!wallTargets.some((item) => pointsMatch(item.x, item.z, target.x, target.z))) wallTargets.push(target);
    targetsByWall.set(target.wallId, wallTargets);
  }
  let nextWalls = walls;
  let nextOpenings = wallOpenings;
  let splitCount = 0;

  for (const [wallId, wallTargets] of targetsByWall) {
    const sortedTargets = wallTargets.filter((target) => target.kind === 'segment').sort((left, right) => right.position - left.position);
    for (const target of sortedTargets) {
      const wallIndex = nextWalls.findIndex((wall) => wall.id === wallId);
      const source = nextWalls[wallIndex];
      if (!source) continue;
      const firstLength = Math.hypot(target.x - source.startX, target.z - source.startZ);
      const secondLength = Math.hypot(source.endX - target.x, source.endZ - target.z);
      if (firstLength < 0.25 || secondLength < 0.25) continue;
      const first = normalizedWall({ ...source, endX: target.x, endZ: target.z });
      const second = normalizedWall({ ...source, id: newId('wall'), name: `${source.name} · часть`.slice(0, 80), startX: target.x, startZ: target.z });
      nextWalls = [...nextWalls.slice(0, wallIndex), first, second, ...nextWalls.slice(wallIndex + 1)];

      const sourceOpenings = nextOpenings.filter((opening) => opening.wallId === source.id);
      if (sourceOpenings.length) {
        const sourceLength = firstLength + secondLength;
        const firstOpenings: StandaloneWallOpening[] = [];
        const secondOpenings: StandaloneWallOpening[] = [];
        for (const opening of sourceOpenings) {
          const openingCenter = opening.offset * sourceLength;
          if (openingCenter < firstLength) firstOpenings.push({ ...opening, wallId: first.id, offset: openingCenter / firstLength });
          else secondOpenings.push({ ...opening, wallId: second.id, offset: (openingCenter - firstLength) / secondLength });
        }
        nextOpenings = [...nextOpenings.filter((opening) => opening.wallId !== source.id),
          ...fitStandaloneOpeningGroup(firstOpenings, first), ...fitStandaloneOpeningGroup(secondOpenings, second)];
      }
      splitCount += 1;
    }
  }
  return { walls: nextWalls, wallOpenings: nextOpenings, splitCount };
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
  const halfOffset = (width / 2 + OPENING_EDGE_CLEARANCE) / wallLength;
  return { ...opening, width, height, sillHeight, offset: clamp(opening.offset, halfOffset, 1 - halfOffset) };
}

function fitRoomOpeningGroups(openings: WallOpening[], room: PlanRoom) {
  const vertices = roomVertices(room);
  const result: WallOpening[] = [];
  for (let wallIndex = 0; wallIndex < vertices.length; wallIndex += 1) {
    const start = vertices[wallIndex]; const end = vertices[(wallIndex + 1) % vertices.length];
    if (!start || !end) continue;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    result.push(...fitOpeningGroup(openings.filter((opening) => opening.wallIndex === wallIndex), length,
      (opening) => fitOpeningToRoom(opening, room)));
  }
  return result;
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
  walls: initialProject.walls,
  wallOpenings: initialProject.wallOpenings,
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
  draftWallStart: null,
  draftWallStartSnap: null,
  draftWallEnd: null,
  draftWallSnap: null,
  draftWallChain: null,
  draftWallPrecision: false,
  selection: null,
  snapGuides: [],
  transformMode: 'translate',
  cameraPreset: 'perspective',
  cameraRevision: 0,
  captureRevision: 0,
  message: null,
  canUndo: false,
  canRedo: false,
  setProjectName: (name) => set({ projectName: cleanText(name, 80) || 'Новый проект' }),
  setProjectType: (projectType) => set({ projectType, selection: null, snapGuides: [] }),
  updateSite: (patch) => set((state) => ({ site: { width: clamp(patch.width ?? state.site.width, 4, 200), depth: clamp(patch.depth ?? state.site.depth, 4, 200) } })),
  setTool: (tool) => set({ tool, selection: null, draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [] }),
  select: (selection, additive = false) => set((state) => {
    if (!additive || !selection || !isObjectSelection(selection)) return { selection, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [] };
    const currentItems = state.selection?.kind === 'group' ? state.selection.items
      : state.selection && isObjectSelection(state.selection) ? [state.selection] : [];
    const key = objectSelectionKey(selection);
    const exists = currentItems.some((item) => objectSelectionKey(item) === key);
    const items = exists ? currentItems.filter((item) => objectSelectionKey(item) !== key) : [...currentItems, selection];
    return { selection: collapseObjectSelection(items), tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [] };
  }),
  selectObjects: (selections, additive = false) => set((state) => {
    const currentItems = additive
      ? state.selection?.kind === 'group' ? state.selection.items : state.selection && isObjectSelection(state.selection) ? [state.selection] : []
      : [];
    const items = new Map(currentItems.map((item) => [objectSelectionKey(item), item]));
    for (const selection of selections) items.set(objectSelectionKey(selection), selection);
    return { selection: collapseObjectSelection([...items.values()]), tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [] };
  }),
  setSnapGuides: (snapGuides) => set({ snapGuides }),
  setTransformMode: (transformMode) => set({ transformMode, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [] }),
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
  previewWall: (x, z) => set((state) => {
    if (state.tool !== 'wall' || !state.draftWallStart || state.draftWallPrecision) return state;
    const snapped = snapWallPoint(x, z, state.walls, state.wallOpenings, state.activeFloorId);
    return { draftWallEnd: snapped.point, draftWallSnap: snapped.target };
  }),
  addWallPoint: (x, z, exact = false) => set((state) => {
    if (state.tool !== 'wall') return state;
    const snapped = exact
      ? { point: [clamp(x, -200, 200), clamp(z, -200, 200)] as Point2, target: null }
      : snapWallPoint(x, z, state.walls, state.wallOpenings, state.activeFloorId);
    const point = snapped.point;
    if (!state.draftWallStart) return { draftWallStart: point, draftWallStartSnap: snapped.target, draftWallEnd: point, draftWallSnap: snapped.target,
      draftWallChain: { start: point, segmentCount: 0 },
      draftWallPrecision: false,
      message: snapped.target?.kind === 'segment' ? 'Начало привязано к середине стены · укажите конечную точку'
        : snapped.target ? 'Начало соединено со стеной · укажите конечную точку' : 'Укажите конечную точку стены' };
    const length = Math.hypot(point[0] - state.draftWallStart[0], point[1] - state.draftWallStart[1]);
    if (length < 0.25) return { draftWallEnd: point, draftWallSnap: snapped.target, message: 'Длина стены должна быть не меньше 0,25 м' };
    const chain = state.draftWallChain ?? { start: state.draftWallStart, segmentCount: 0 };
    const closesChain = pointsMatch(point[0], point[1], chain.start[0], chain.start[1]);
    if (closesChain && chain.segmentCount < 2) return { draftWallEnd: point, draftWallSnap: snapped.target,
      message: 'Для замкнутой цепочки нужны минимум три стены' };
    const id = newId('wall');
    const count = state.walls.filter((wall) => wall.floorId === state.activeFloorId).length + 1;
    const wall = normalizedWall({ id, floorId: state.activeFloorId, name: `Стена ${count}`,
      startX: state.draftWallStart[0], startZ: state.draftWallStart[1], endX: point[0], endZ: point[1],
      height: state.projectType === 'plot' ? 1.8 : 2.8, thickness: 0.16, color: '#E9E4DA' });
    const targets = [state.draftWallStartSnap, snapped.target];
    const split = splitWallsAtTargets(state.walls, state.wallOpenings, targets);
    const hasEndpointConnection = targets.some((target) => target?.kind === 'endpoint');
    const segmentCount = chain.segmentCount + 1;
    const connectionMessage = split.splitCount ? ` · Т-соединений: ${split.splitCount}` : hasEndpointConnection ? ' · соединение' : '';
    if (closesChain) return { walls: [...split.walls, wall], wallOpenings: split.wallOpenings, selection: { kind: 'partition', id }, tool: 'select',
      draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null,
      draftWallPrecision: false,
      message: `Цепочка замкнута · стен: ${segmentCount}${connectionMessage}` };
    return { walls: [...split.walls, wall], wallOpenings: split.wallOpenings, selection: null, tool: 'wall',
      draftWallStart: point, draftWallStartSnap: { wallId: id, kind: 'endpoint', endpoint: 'end', x: point[0], z: point[1] },
      draftWallEnd: point, draftWallSnap: null, draftWallChain: { start: chain.start, segmentCount },
      draftWallPrecision: false,
      message: `Сегмент ${segmentCount} создан · ${length.toFixed(2)} м${connectionMessage} · продолжайте цепочку` };
  }),
  setWallDraftPolar: (length, angleDegrees) => set((state) => {
    if (state.tool !== 'wall' || !state.draftWallStart || !Number.isFinite(length) || !Number.isFinite(angleDegrees)) return state;
    const safeLength = clamp(length, 0.25, 100);
    const angle = radians(normalizeDegrees(angleDegrees));
    const end = [state.draftWallStart[0] + Math.cos(angle) * safeLength, state.draftWallStart[1] + Math.sin(angle) * safeLength] as Point2;
    return { draftWallEnd: end, draftWallSnap: null, draftWallPrecision: true, message: null };
  }),
  commitWallDraft: () => {
    const state = get();
    if (state.tool !== 'wall' || !state.draftWallStart || !state.draftWallEnd) return;
    const length = Math.hypot(state.draftWallEnd[0] - state.draftWallStart[0], state.draftWallEnd[1] - state.draftWallStart[1]);
    if (length < 0.25) { set({ message: 'Введите длину стены не меньше 0,25 м' }); return; }
    get().addWallPoint(state.draftWallEnd[0], state.draftWallEnd[1], true);
  },
  completeWallChain: () => set((state) => {
    if (state.tool !== 'wall') return state;
    const segmentCount = state.draftWallChain?.segmentCount ?? 0;
    const lastWall = segmentCount ? state.walls.at(-1) : undefined;
    return { tool: 'select', selection: lastWall ? { kind: 'partition', id: lastWall.id } : null,
      draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null,
      draftWallPrecision: false,
      message: segmentCount ? `Цепочка завершена · стен: ${segmentCount}` : 'Построение стены отменено' };
  }),
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
  cancelPolygon: () => set((state) => {
    const segmentCount = state.draftWallChain?.segmentCount ?? 0;
    const lastWall = segmentCount ? state.walls.at(-1) : undefined;
    return { draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, tool: 'select',
      ...(state.tool === 'wall' && segmentCount ? { selection: lastWall ? { kind: 'partition' as const, id: lastWall.id } : null, message: `Цепочка завершена · стен: ${segmentCount}` }
        : state.draftPolygon.length || state.draftWallStart ? { message: 'Построение отменено' } : {}) };
  }),
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
    const openings = [...state.openings.filter((opening) => opening.roomId !== id),
      ...fitRoomOpeningGroups(state.openings.filter((opening) => opening.roomId === id), updatedRoom)];
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
    const remappedOpenings = state.openings.flatMap((opening) => {
      if (opening.roomId !== id) return [opening];
      const remapped = opening.wallIndex < afterIndex ? opening
        : opening.wallIndex > afterIndex ? { ...opening, wallIndex: opening.wallIndex + 1 }
          : opening.offset <= 0.5 ? { ...opening, offset: opening.offset * 2 }
            : { ...opening, wallIndex: opening.wallIndex + 1, offset: (opening.offset - 0.5) * 2 };
      const fitted = fitOpeningToRoom(remapped, updatedRoom); return fitted ? [fitted] : [];
    });
    const openings = [...remappedOpenings.filter((opening) => opening.roomId !== id),
      ...fitRoomOpeningGroups(remappedOpenings.filter((opening) => opening.roomId === id), updatedRoom)];
    const selection = state.selection?.kind === 'vertex' && state.selection.roomId === id && state.selection.vertexIndex > afterIndex
      ? { ...state.selection, vertexIndex: state.selection.vertexIndex + 1 } as Selection : state.selection;
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item), selection,
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
    const selection = state.selection?.kind === 'vertex' && state.selection.roomId === id
      ? state.selection.vertexIndex === index ? { kind: 'room', id } as Selection
        : state.selection.vertexIndex > index ? { ...state.selection, vertexIndex: state.selection.vertexIndex - 1 } : state.selection
      : state.selection;
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item), selection,
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
    const openings = [...state.openings.filter((opening) => opening.roomId !== id),
      ...fitRoomOpeningGroups(state.openings.filter((opening) => opening.roomId === id), nextRoom)];
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
    selection: state.selection?.kind === 'room' && state.selection.id === id || state.selection?.kind === 'vertex' && state.selection.roomId === id
      || state.selection?.kind === 'wall' && state.selection.roomId === id ? null : state.selection })),
  updateWall: (id, patch) => set((state) => {
    const source = state.walls.find((wall) => wall.id === id); if (!source) return state;
    const wall = normalizedWall({ ...source, ...patch, id: source.id, floorId: source.floorId });
    if (Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ) < 0.25) return { message: 'Длина стены должна быть не меньше 0,25 м' };
    const startMoved = !pointsMatch(source.startX, source.startZ, wall.startX, wall.startZ);
    const endMoved = !pointsMatch(source.endX, source.endZ, wall.endX, wall.endZ);
    const affectedWallIds = new Set<string>([id]);
    const walls = state.walls.map((item) => {
      if (item.id === id) return wall;
      if (item.floorId !== source.floorId || !startMoved && !endMoved) return item;
      let next = item;
      const moveEndpoint = (endpoint: 'start' | 'end', x: number, z: number) => {
        next = endpoint === 'start' ? { ...next, startX: x, startZ: z } : { ...next, endX: x, endZ: z };
      };
      if (startMoved) {
        if (pointsMatch(item.startX, item.startZ, source.startX, source.startZ)) moveEndpoint('start', wall.startX, wall.startZ);
        if (pointsMatch(item.endX, item.endZ, source.startX, source.startZ)) moveEndpoint('end', wall.startX, wall.startZ);
      }
      if (endMoved) {
        if (pointsMatch(item.startX, item.startZ, source.endX, source.endZ)) moveEndpoint('start', wall.endX, wall.endZ);
        if (pointsMatch(item.endX, item.endZ, source.endX, source.endZ)) moveEndpoint('end', wall.endX, wall.endZ);
      }
      if (next === item) return item;
      affectedWallIds.add(item.id);
      return normalizedWall(next);
    });
    if (walls.some((item) => affectedWallIds.has(item.id) && Math.hypot(item.endX - item.startX, item.endZ - item.startZ) < 0.25)) {
      return { message: 'Изменение сделает соединённую стену короче 0,25 м' };
    }
    const wallsById = new Map(walls.map((item) => [item.id, item]));
    const wallOpenings = state.wallOpenings.filter((opening) => !affectedWallIds.has(opening.wallId));
    for (const wallId of affectedWallIds) {
      const affectedWall = wallsById.get(wallId); if (!affectedWall) continue;
      wallOpenings.push(...fitStandaloneOpeningGroup(state.wallOpenings.filter((opening) => opening.wallId === wallId), affectedWall));
    }
    return { walls, wallOpenings };
  }),
  setStandaloneWallFinish: (id, side, finish) => set((state) => {
    const color = /^#[0-9a-f]{6}$/i.test(finish.color) ? finish.color : '#E9E4DA';
    const textureId = finish.textureId && state.textures.some((texture) => texture.id === finish.textureId) ? finish.textureId : undefined;
    const property = side === 'front' ? 'frontFinish' : 'backFinish';
    return { walls: state.walls.map((wall) => wall.id === id ? { ...wall, [property]: { color, ...(textureId ? { textureId } : {}) } } : wall) };
  }),
  clearStandaloneWallFinish: (id, side) => set((state) => {
    const property = side === 'front' ? 'frontFinish' : 'backFinish';
    return { walls: state.walls.map((wall) => {
      if (wall.id !== id) return wall;
      const next = { ...wall }; delete next[property]; return next;
    }) };
  }),
  duplicateWall: (id) => set((state) => {
    const source = state.walls.find((wall) => wall.id === id); if (!source) return state;
    const copy = normalizedWall({ ...source, id: newId('wall'), name: `${source.name} — копия`.slice(0, 80),
      startX: source.startX + 0.5, startZ: source.startZ + 0.5, endX: source.endX + 0.5, endZ: source.endZ + 0.5 });
    const openings = state.wallOpenings.filter((opening) => opening.wallId === source.id)
      .map((opening) => ({ ...opening, id: newId('wall-opening'), wallId: copy.id }));
    return { walls: [...state.walls, copy], wallOpenings: [...state.wallOpenings, ...openings],
      selection: { kind: 'partition', id: copy.id }, message: 'Стена скопирована' };
  }),
  removeWall: (id) => set((state) => ({ walls: state.walls.filter((wall) => wall.id !== id),
    wallOpenings: state.wallOpenings.filter((opening) => opening.wallId !== id),
    selection: state.selection?.kind === 'partition' && state.selection.id === id ? null : state.selection, message: 'Стена удалена' })),
  addStandaloneWallOpening: (wallId, kind) => set((state) => {
    const wall = state.walls.find((item) => item.id === wallId); if (!wall) return state;
    const existing = state.wallOpenings.filter((opening) => opening.wallId === wallId);
    if (existing.length >= MAX_OPENINGS_PER_WALL) return { message: `На одной стене можно разместить до ${MAX_OPENINGS_PER_WALL} проёмов` };
    const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
    let width = Math.max(0.25, Math.min(kind === 'door' ? 0.9 : 1.6, length - 0.12));
    const sillHeight = kind === 'door' ? 0 : Math.min(0.9, Math.max(0.1, wall.height - 0.7));
    const height = Math.max(0.3, Math.min(kind === 'door' ? 2.1 : 1.2, wall.height - sillHeight - 0.05));
    let offset = findAvailableOpeningOffset(length, width, existing);
    if (offset === undefined && width > 0.25) { width = 0.25; offset = findAvailableOpeningOffset(length, width, existing); }
    if (offset === undefined) return { message: 'На стене не осталось места для нового проёма' };
    const opening = fitStandaloneOpening({ id: newId('wall-opening'), wallId, kind, offset, width, height, sillHeight }, wall);
    if (!opening) return { message: 'Эта стена слишком мала для проёма' };
    return { wallOpenings: [...state.wallOpenings, opening],
      message: kind === 'door' ? 'Дверной проём добавлен в стену' : 'Оконный проём добавлен в стену' };
  }),
  updateStandaloneWallOpening: (id, patch) => set((state) => {
    const opening = state.wallOpenings.find((item) => item.id === id); if (!opening) return state;
    const wall = state.walls.find((item) => item.id === opening.wallId); if (!wall) return state;
    const fitted = fitStandaloneOpening({ ...opening, ...patch, id: opening.id, wallId: opening.wallId }, wall);
    const length = Math.hypot(wall.endX - wall.startX, wall.endZ - wall.startZ);
    const others = state.wallOpenings.filter((item) => item.wallId === opening.wallId && item.id !== id);
    if (!fitted || openingsOverlap(fitted, others, length)) return { message: 'Проёмы не должны пересекаться; оставьте между ними 0,12 м' };
    return { wallOpenings: state.wallOpenings.map((item) => item.id === id ? fitted : item) };
  }),
  removeStandaloneWallOpening: (id) => set((state) => ({ wallOpenings: state.wallOpenings.filter((opening) => opening.id !== id), message: 'Проём удалён' })),
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
    const existing = state.openings.filter((opening) => opening.roomId === roomId && opening.wallIndex === wallIndex);
    if (existing.length >= MAX_OPENINGS_PER_WALL) return { message: `На одной стене можно разместить до ${MAX_OPENINGS_PER_WALL} проёмов` };
    let width = Math.max(0.25, Math.min(kind === 'door' ? 0.9 : 1.6, wallLength - 0.12));
    const sillHeight = kind === 'door' ? 0 : Math.min(0.9, Math.max(0.1, room.wallHeight - 0.7));
    const height = Math.max(0.3, Math.min(kind === 'door' ? 2.1 : 1.2, room.wallHeight - sillHeight - 0.05));
    let offset = findAvailableOpeningOffset(wallLength, width, existing);
    if (offset === undefined && width > 0.25) { width = 0.25; offset = findAvailableOpeningOffset(wallLength, width, existing); }
    if (offset === undefined) return { message: 'На стене не осталось места для нового проёма' };
    const opening = fitOpeningToRoom({ id: newId('opening'), roomId, wallIndex, kind, offset, width, height, sillHeight }, room);
    if (!opening) return { message: 'Стена слишком мала для проёма' };
    return { openings: [...state.openings, opening], message: kind === 'door' ? 'Дверной проём добавлен' : 'Оконный проём добавлен' };
  }),
  updateWallOpening: (id, patch) => set((state) => {
    const opening = state.openings.find((item) => item.id === id); if (!opening) return state;
    const room = state.rooms.find((item) => item.id === opening.roomId); if (!room) return state;
    const fitted = fitOpeningToRoom({ ...opening, width: patch.width ?? opening.width, height: patch.height ?? opening.height,
      sillHeight: patch.sillHeight ?? opening.sillHeight, offset: patch.offset ?? opening.offset }, room);
    const vertices = roomVertices(room); const start = vertices[opening.wallIndex]; const end = vertices[(opening.wallIndex + 1) % vertices.length];
    if (!fitted || !start || !end) return state;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const others = state.openings.filter((item) => item.roomId === opening.roomId && item.wallIndex === opening.wallIndex && item.id !== id);
    if (openingsOverlap(fitted, others, length)) return { message: 'Проёмы не должны пересекаться; оставьте между ними 0,12 м' };
    return { openings: state.openings.map((item) => item.id === id ? fitted : item) };
  }),
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
    const sourceWalls = state.walls.filter((wall) => wall.floorId === sourceFloor.id);
    const wallIds = new Map(sourceWalls.map((wall) => [wall.id, newId('wall')]));
    const walls = sourceWalls.map((wall) => ({ ...wall, id: wallIds.get(wall.id) ?? newId('wall'), floorId: floor.id }));
    const wallOpenings = state.wallOpenings.flatMap((opening) => {
      const wallId = wallIds.get(opening.wallId); return wallId ? [{ ...opening, id: newId('wall-opening'), wallId }] : [];
    });
    return { floors: [...state.floors, floor], rooms: [...state.rooms, ...rooms], openings: [...state.openings, ...openings],
      walls: [...state.walls, ...walls], wallOpenings: [...state.wallOpenings, ...wallOpenings], wallFinishes,
      modelInstances: [...state.modelInstances, ...models], activeFloorId: floor.id, selection: null,
      showAllFloors: false, message: 'Этаж скопирован вместе с содержимым' };
  }),
  setActiveFloor: (activeFloorId) => set((state) => state.floors.some((floor) => floor.id === activeFloorId)
    ? { activeFloorId, selection: null, draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [] } : state),
  removeActiveFloor: () => set((state) => {
    if (state.floors.length === 1) return { message: 'В проекте должен остаться хотя бы один этаж' };
    const remaining = state.floors.filter((floor) => floor.id !== state.activeFloorId);
    const removedRoomIds = new Set(state.rooms.filter((room) => room.floorId === state.activeFloorId).map((room) => room.id));
    const removedWallIds = new Set(state.walls.filter((wall) => wall.floorId === state.activeFloorId).map((wall) => wall.id));
    return { floors: remaining, rooms: state.rooms.filter((room) => room.floorId !== state.activeFloorId), walls: state.walls.filter((wall) => wall.floorId !== state.activeFloorId),
      wallOpenings: state.wallOpenings.filter((opening) => !removedWallIds.has(opening.wallId)),
      wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => ![...removedRoomIds].some((id) => key.startsWith(`${id}:wall:`)))),
      openings: state.openings.filter((opening) => !removedRoomIds.has(opening.roomId)),
      modelInstances: state.modelInstances.filter((model) => model.floorId !== state.activeFloorId), activeFloorId: remaining[0]?.id ?? '', selection: null, message: 'Этаж удалён' };
  }),
  toggleAllFloors: () => set((state) => ({ showAllFloors: !state.showAllFloors })),
  toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),
  addTexture: (asset) => set((state) => ({ textures: [...state.textures, asset], message: 'Текстура готова к применению' })),
  removeTexture: (id) => set((state) => ({
    textures: state.textures.filter((texture) => texture.id !== id),
    walls: state.walls.map((wall) => ({ ...wall,
      ...(wall.frontFinish ? { frontFinish: wall.frontFinish.textureId === id ? { color: wall.frontFinish.color } : wall.frontFinish } : {}),
      ...(wall.backFinish ? { backFinish: wall.backFinish.textureId === id ? { color: wall.backFinish.color } : wall.backFinish } : {}),
    })),
    wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).map(([key, finish]) => [key,
      finish.textureId === id ? { color: finish.color } : finish])),
    message: 'Текстура удалена из библиотеки',
  })),
  addModelAsset: (asset) => set((state) => ({ modelAssets: [...state.modelAssets, asset], message: 'GLB-модель добавлена в библиотеку' })),
  removeModelAsset: (id) => set((state) => {
    const selectedModelId = state.selection?.kind === 'model' ? state.selection.id : undefined;
    return { modelAssets: state.modelAssets.filter((asset) => asset.id !== id),
      modelInstances: state.modelInstances.filter((model) => model.assetId !== id),
      selection: selectedModelId && state.modelInstances.some((model) => model.id === selectedModelId && model.assetId === id) ? null : state.selection,
      message: 'Модель и её экземпляры удалены' };
  }),
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
  moveSelectedObjects: (dx, dz) => set((state) => {
    if (state.selection?.kind !== 'group' || !Number.isFinite(dx) || !Number.isFinite(dz)) return state;
    const roomIds = new Set(state.selection.items.filter((item) => item.kind === 'room').map((item) => item.id));
    const modelIds = new Set(state.selection.items.filter((item) => item.kind === 'model').map((item) => item.id));
    return {
      rooms: state.rooms.map((room) => roomIds.has(room.id) ? normalizedRoom({ ...room, x: room.x + dx, z: room.z + dz }) : room),
      modelInstances: state.modelInstances.map((model) => modelIds.has(model.id) ? normalizedModel({ ...model, x: model.x + dx, z: model.z + dz }) : model),
    };
  }),
  rotateSelectedObjects: (angle, center) => set((state) => {
    if (!Number.isFinite(angle) || Math.abs(angle) < 0.000001) return state;
    const selection = state.selection;
    const items = selection?.kind === 'group' ? selection.items : selection && isObjectSelection(selection) ? [selection] : [];
    if (!items.length) return state;
    const roomIds = new Set(items.filter((item) => item.kind === 'room').map((item) => item.id));
    const modelIds = new Set(items.filter((item) => item.kind === 'model').map((item) => item.id));
    const selected = [...state.rooms.filter((room) => roomIds.has(room.id)), ...state.modelInstances.filter((model) => modelIds.has(model.id))];
    if (!selected.length) return state;
    const pivot = center ?? selected.reduce((result, item) => ({ x: result.x + item.x / selected.length, z: result.z + item.z / selected.length }), { x: 0, z: 0 });
    const cosine = Math.cos(angle); const sine = Math.sin(angle);
    const rotatePoint = (x: number, z: number) => ({ x: pivot.x + (x - pivot.x) * cosine - (z - pivot.z) * sine, z: pivot.z + (x - pivot.x) * sine + (z - pivot.z) * cosine });
    return {
      rooms: state.rooms.map((room) => roomIds.has(room.id) ? normalizedRoom({ ...room, ...rotatePoint(room.x, room.z), rotation: room.rotation + angle }) : room),
      modelInstances: state.modelInstances.map((model) => modelIds.has(model.id) ? normalizedModel({ ...model, ...rotatePoint(model.x, model.z), rotation: model.rotation + angle }) : model),
    };
  }),
  scaleSelectedObjects: (requestedFactor, center) => set((state) => {
    if (!Number.isFinite(requestedFactor) || requestedFactor <= 0 || Math.abs(requestedFactor - 1) < 0.000001) return state;
    const selection = state.selection;
    const items = selection?.kind === 'group' ? selection.items : selection && isObjectSelection(selection) ? [selection] : [];
    if (!items.length) return state;
    const roomIds = new Set(items.filter((item) => item.kind === 'room').map((item) => item.id));
    const modelIds = new Set(items.filter((item) => item.kind === 'model').map((item) => item.id));
    const selectedRooms = state.rooms.filter((room) => roomIds.has(room.id));
    const selectedModels = state.modelInstances.filter((model) => modelIds.has(model.id));
    const selected = [...selectedRooms, ...selectedModels];
    if (!selected.length) return state;
    const minimumFactor = Math.max(0.01, ...selectedRooms.map((room) => 0.5 / Math.min(room.width, room.depth)), ...selectedModels.map((model) => 0.05 / model.scale));
    const maximumFactor = Math.min(100, ...selectedRooms.map((room) => 50 / Math.max(room.width, room.depth)), ...selectedModels.map((model) => 20 / model.scale));
    const factor = clamp(requestedFactor, minimumFactor, maximumFactor);
    const pivot = center ?? selected.reduce((result, item) => ({ x: result.x + item.x / selected.length, z: result.z + item.z / selected.length }), { x: 0, z: 0 });
    const rooms = state.rooms.map((room) => {
      if (!roomIds.has(room.id)) return room;
      return normalizedRoom({ ...room, x: pivot.x + (room.x - pivot.x) * factor, z: pivot.z + (room.z - pivot.z) * factor,
        width: room.width * factor, depth: room.depth * factor,
        ...(room.vertices ? { vertices: room.vertices.map((point) => [point[0] * factor, point[1] * factor] as [number, number]) } : {}) });
    });
    const openings = state.openings.filter((opening) => !roomIds.has(opening.roomId));
    for (const room of rooms) {
      if (roomIds.has(room.id)) openings.push(...fitRoomOpeningGroups(state.openings.filter((opening) => opening.roomId === room.id), room));
    }
    return { rooms, openings, modelInstances: state.modelInstances.map((model) => modelIds.has(model.id)
      ? normalizedModel({ ...model, x: pivot.x + (model.x - pivot.x) * factor, z: pivot.z + (model.z - pivot.z) * factor, scale: model.scale * factor }) : model) };
  }),
  duplicateSelection: () => {
    const selection = get().selection;
    if (selection?.kind === 'room') { get().duplicateRoom(selection.id); return; }
    if (selection?.kind === 'model') { get().duplicateModel(selection.id); return; }
    if (selection?.kind !== 'group') return;
    set((state) => {
      const rooms = [...state.rooms]; const modelInstances = [...state.modelInstances]; const openings = [...state.openings];
      const wallFinishes = { ...state.wallFinishes }; const items: ObjectSelection[] = [];
      for (const item of selection.items) {
        if (item.kind === 'room') {
          const source = state.rooms.find((room) => room.id === item.id); if (!source) continue;
          const copy = { ...source, id: newId('block'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 1, z: source.z + 1 };
          rooms.push(copy); items.push({ kind: 'room', id: copy.id });
          openings.push(...state.openings.filter((opening) => opening.roomId === source.id)
            .map((opening) => ({ ...opening, id: newId('opening'), roomId: copy.id })));
          for (const [key, finish] of Object.entries(state.wallFinishes)) {
            if (key.startsWith(`${source.id}:wall:`)) wallFinishes[`${copy.id}${key.slice(source.id.length)}`] = finish;
          }
        } else {
          const source = state.modelInstances.find((model) => model.id === item.id); if (!source) continue;
          const copy = { ...source, id: newId('object'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 1, z: source.z + 1 };
          modelInstances.push(copy); items.push({ kind: 'model', id: copy.id });
        }
      }
      return { rooms, modelInstances, openings, wallFinishes, selection: collapseObjectSelection(items), message: `Скопировано элементов: ${items.length}` };
    });
  },
  deleteSelection: () => {
    const selection = get().selection;
    if (selection?.kind === 'room') get().removeRoom(selection.id);
    else if (selection?.kind === 'vertex') get().removePolygonVertex(selection.roomId, selection.vertexIndex);
    else if (selection?.kind === 'model') get().removeModel(selection.id);
    else if (selection?.kind === 'partition') get().removeWall(selection.id);
    else if (selection?.kind === 'wall') get().clearWallFinish(selection.roomId, selection.wallIndex);
    else if (selection?.kind === 'group') set((state) => {
      const roomIds = new Set(selection.items.filter((item) => item.kind === 'room').map((item) => item.id));
      const modelIds = new Set(selection.items.filter((item) => item.kind === 'model').map((item) => item.id));
      return {
        rooms: state.rooms.filter((room) => !roomIds.has(room.id)),
        modelInstances: state.modelInstances.filter((model) => !modelIds.has(model.id)),
        openings: state.openings.filter((opening) => !roomIds.has(opening.roomId)),
        wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => {
          const separator = key.indexOf(':wall:'); return separator < 0 || !roomIds.has(key.slice(0, separator));
        })),
        selection: null,
        message: `Удалено элементов: ${roomIds.size + modelIds.size}`,
      };
    });
  },
  rotateSelection: (degrees) => get().rotateSelectedObjects(radians(degrees)),
  setCameraPreset: (cameraPreset) => set((state) => ({ cameraPreset, cameraRevision: state.cameraRevision + 1 })),
  requestCapture: () => set((state) => ({ captureRevision: state.captureRevision + 1 })),
  loadProject: (project) => set({ projectName: project.name, projectType: project.projectType, site: project.site,
    floors: project.floors, rooms: project.rooms, walls: project.walls, wallOpenings: project.wallOpenings, wallFinishes: project.wallFinishes, openings: project.openings, modelInstances: project.modelInstances,
    activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [], message: 'Планировка загружена' }),
  resetProject: () => {
    const project = demoProject();
    set({ projectName: project.name, projectType: project.projectType, site: project.site, floors: project.floors,
      rooms: project.rooms, walls: project.walls, wallOpenings: project.wallOpenings, wallFinishes: project.wallFinishes, openings: project.openings, modelInstances: project.modelInstances,
      activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [], message: 'Демо-проект восстановлен' });
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
    rooms: state.rooms, walls: state.walls, wallOpenings: state.wallOpenings, wallFinishes: state.wallFinishes, openings: state.openings, textures: state.textures, modelAssets: state.modelAssets,
    modelInstances: state.modelInstances, activeFloorId: state.activeFloorId, showAllFloors: state.showAllFloors,
  };
}

function sameHistory(left: HistorySnapshot, right: HistorySnapshot) {
  return left.projectName === right.projectName && left.projectType === right.projectType && left.site === right.site
    && left.floors === right.floors && left.rooms === right.rooms && left.walls === right.walls && left.wallOpenings === right.wallOpenings && left.wallFinishes === right.wallFinishes && left.openings === right.openings
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
  useEditorStore.setState({ ...previous, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [], message: 'Действие отменено', canUndo: historyPast.length > 0, canRedo: true });
}

function redoHistory() {
  if (historyBatchStart) endHistoryBatch();
  const next = historyFuture.pop();
  if (!next) return;
  historyPast.push(captureHistory(useEditorStore.getState()));
  restoringHistory = true;
  useEditorStore.setState({ ...next, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false, snapGuides: [], message: 'Действие повторено', canUndo: true, canRedo: historyFuture.length > 0 });
}

lastHistorySnapshot = captureHistory(useEditorStore.getState());

useEditorStore.subscribe(
  (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.walls, state.wallOpenings, state.wallFinishes, state.openings, state.textures, state.modelAssets, state.modelInstances, state.activeFloorId, state.showAllFloors] as const,
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
    (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.walls, state.wallOpenings, state.wallFinishes, state.openings, state.modelInstances] as const,
    ([name, projectType, site, floors, rooms, walls, wallOpenings, wallFinishes, openings, modelInstances]) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveAutosave(createProjectDocument({ name, projectType, site, floors, rooms, walls, wallOpenings, wallFinishes, openings, modelInstances })), 180);
    },
    { equalityFn: shallow },
  );
}
