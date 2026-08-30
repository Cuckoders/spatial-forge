import { subscribeWithSelector } from 'zustand/middleware';
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

import { createProjectDocument, readAutosave, saveAutosave } from '../lib/files';
import { normalizeDegrees, snapToGrid, wallId } from '../lib/geometry';
import type { BuiltInModelKind, CameraPreset, EditorTool, ModelAsset, ModelInstance, PlanFloor, PlanRoom, ProjectDocument, ProjectType, Selection, SiteSettings, TextureAsset, WallFinish } from '../types';

interface EditorState {
  projectName: string;
  projectType: ProjectType;
  site: SiteSettings;
  floors: PlanFloor[];
  rooms: PlanRoom[];
  wallFinishes: Record<string, WallFinish>;
  textures: TextureAsset[];
  modelAssets: ModelAsset[];
  modelInstances: ModelInstance[];
  activeFloorId: string;
  showAllFloors: boolean;
  tool: EditorTool;
  selection: Selection | null;
  cameraPreset: CameraPreset;
  cameraRevision: number;
  message: string | null;
  canUndo: boolean;
  canRedo: boolean;
  setProjectName: (name: string) => void;
  setProjectType: (type: ProjectType) => void;
  updateSite: (patch: Partial<SiteSettings>) => void;
  setTool: (tool: EditorTool) => void;
  select: (selection: Selection | null) => void;
  addRoomAt: (shape: PlanRoom['shape'], x: number, z: number) => void;
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void;
  duplicateRoom: (id: string) => void;
  removeRoom: (id: string) => void;
  setWallFinish: (roomId: string, wallIndex: number, finish: WallFinish) => void;
  clearWallFinish: (roomId: string, wallIndex: number) => void;
  addFloor: () => void;
  setActiveFloor: (id: string) => void;
  removeActiveFloor: () => void;
  toggleAllFloors: () => void;
  addTexture: (asset: TextureAsset) => void;
  addModelAsset: (asset: ModelAsset) => void;
  addBuiltInModel: (kind: BuiltInModelKind) => void;
  addCustomModel: (assetId: string) => void;
  updateModel: (id: string, patch: Partial<ModelInstance>) => void;
  duplicateModel: (id: string) => void;
  removeModel: (id: string) => void;
  deleteSelection: () => void;
  rotateSelection: (degrees: number) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  loadProject: (project: ProjectDocument) => void;
  resetProject: () => void;
  notify: (message: string | null) => void;
  undo: () => void;
  redo: () => void;
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;
}

type HistorySnapshot = Pick<EditorState, 'projectName' | 'projectType' | 'site' | 'floors' | 'rooms' | 'wallFinishes' | 'textures' | 'modelAssets' | 'modelInstances' | 'activeFloorId' | 'showAllFloors'>;

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

export const useEditorStore = create<EditorState>()(subscribeWithSelector((set, get) => ({
  projectName: initialProject.name,
  projectType: initialProject.projectType,
  site: initialProject.site,
  floors: initialProject.floors,
  rooms: initialProject.rooms,
  wallFinishes: initialProject.wallFinishes,
  textures: [],
  modelAssets: [],
  modelInstances: initialProject.modelInstances,
  activeFloorId: initialProject.floors[0]?.id ?? 'floor-1',
  showAllFloors: false,
  tool: 'select',
  selection: null,
  cameraPreset: 'perspective',
  cameraRevision: 0,
  message: null,
  canUndo: false,
  canRedo: false,
  setProjectName: (name) => set({ projectName: cleanText(name, 80) || 'Новый проект' }),
  setProjectType: (projectType) => set({ projectType, selection: null }),
  updateSite: (patch) => set((state) => ({ site: { width: clamp(patch.width ?? state.site.width, 4, 200), depth: clamp(patch.depth ?? state.site.depth, 4, 200) } })),
  setTool: (tool) => set({ tool, selection: null }),
  select: (selection) => set({ selection, tool: 'select' }),
  addRoomAt: (shape, x, z) => set((state) => {
    const id = newId('block'); const count = state.rooms.filter((room) => room.floorId === state.activeFloorId).length + 1;
    const room: PlanRoom = { id, floorId: state.activeFloorId, name: shape === 'triangle' ? `Треугольник ${count}` : `Комната ${count}`,
      shape, x: snapToGrid(x), z: snapToGrid(z), width: shape === 'triangle' ? 4 : 4, depth: shape === 'triangle' ? 3.5 : 3,
      rotation: 0, wallHeight: state.projectType === 'plot' ? 1.2 : 2.8, wallThickness: 0.16,
      floorColor: colors[state.rooms.length % colors.length] ?? '#D8CFBB' };
    return { rooms: [...state.rooms, room], selection: { kind: 'room', id }, tool: 'select', message: 'Блок добавлен на сетку' };
  }),
  updateRoom: (id, patch) => set((state) => ({ rooms: state.rooms.map((room) => room.id === id ? normalizedRoom({ ...room, ...patch, id: room.id, floorId: room.floorId, shape: room.shape }) : room) })),
  duplicateRoom: (id) => set((state) => {
    const source = state.rooms.find((room) => room.id === id); if (!source) return state;
    const copy = { ...source, id: newId('block'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 1, z: source.z + 1 };
    return { rooms: [...state.rooms, copy], selection: { kind: 'room', id: copy.id }, message: 'Блок скопирован' };
  }),
  removeRoom: (id) => set((state) => ({ rooms: state.rooms.filter((room) => room.id !== id),
    wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => !key.startsWith(`${id}:wall:`))),
    selection: state.selection?.kind === 'room' && state.selection.id === id || state.selection?.kind === 'wall' && state.selection.roomId === id ? null : state.selection })),
  setWallFinish: (roomId, wallIndex, finish) => set((state) => {
    const color = /^#[0-9a-f]{6}$/i.test(finish.color) ? finish.color : '#E7E1D7';
    const textureId = finish.textureId && state.textures.some((texture) => texture.id === finish.textureId) ? finish.textureId : undefined;
    return { wallFinishes: { ...state.wallFinishes, [wallId(roomId, wallIndex)]: { color, ...(textureId ? { textureId } : {}) } } };
  }),
  clearWallFinish: (roomId, wallIndex) => set((state) => {
    const finishes = { ...state.wallFinishes }; delete finishes[wallId(roomId, wallIndex)]; return { wallFinishes: finishes };
  }),
  addFloor: () => set((state) => {
    if (state.floors.length >= 12) return { message: 'Можно создать не больше 12 этажей' };
    const floor: PlanFloor = { id: newId('floor'), name: `${state.floors.length + 1} этаж`, elevation: Math.max(...state.floors.map((item) => item.elevation)) + 3.2 };
    return { floors: [...state.floors, floor], activeFloorId: floor.id, selection: null, showAllFloors: false, message: 'Новый этаж создан' };
  }),
  setActiveFloor: (activeFloorId) => set((state) => state.floors.some((floor) => floor.id === activeFloorId) ? { activeFloorId, selection: null } : state),
  removeActiveFloor: () => set((state) => {
    if (state.floors.length === 1) return { message: 'В проекте должен остаться хотя бы один этаж' };
    const remaining = state.floors.filter((floor) => floor.id !== state.activeFloorId);
    const removedRoomIds = new Set(state.rooms.filter((room) => room.floorId === state.activeFloorId).map((room) => room.id));
    return { floors: remaining, rooms: state.rooms.filter((room) => room.floorId !== state.activeFloorId),
      wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => ![...removedRoomIds].some((id) => key.startsWith(`${id}:wall:`)))),
      modelInstances: state.modelInstances.filter((model) => model.floorId !== state.activeFloorId), activeFloorId: remaining[0]?.id ?? '', selection: null, message: 'Этаж удалён' };
  }),
  toggleAllFloors: () => set((state) => ({ showAllFloors: !state.showAllFloors })),
  addTexture: (asset) => set((state) => ({ textures: [...state.textures, asset], message: 'Текстура готова к применению' })),
  addModelAsset: (asset) => set((state) => ({ modelAssets: [...state.modelAssets, asset], message: 'GLB-модель добавлена в библиотеку' })),
  addBuiltInModel: (kind) => set((state) => {
    const labels: Record<BuiltInModelKind, string> = { sofa: 'Диван', table: 'Стол', bed: 'Кровать', tree: 'Дерево' };
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
  loadProject: (project) => set({ projectName: project.name, projectType: project.projectType, site: project.site,
    floors: project.floors, rooms: project.rooms, wallFinishes: project.wallFinishes, modelInstances: project.modelInstances,
    activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', message: 'Планировка загружена' }),
  resetProject: () => {
    const project = demoProject();
    set({ projectName: project.name, projectType: project.projectType, site: project.site, floors: project.floors,
      rooms: project.rooms, wallFinishes: project.wallFinishes, modelInstances: project.modelInstances,
      activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', message: 'Демо-проект восстановлен' });
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
    rooms: state.rooms, wallFinishes: state.wallFinishes, textures: state.textures, modelAssets: state.modelAssets,
    modelInstances: state.modelInstances, activeFloorId: state.activeFloorId, showAllFloors: state.showAllFloors,
  };
}

function sameHistory(left: HistorySnapshot, right: HistorySnapshot) {
  return left.projectName === right.projectName && left.projectType === right.projectType && left.site === right.site
    && left.floors === right.floors && left.rooms === right.rooms && left.wallFinishes === right.wallFinishes
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
  useEditorStore.setState({ ...previous, selection: null, tool: 'select', message: 'Действие отменено', canUndo: historyPast.length > 0, canRedo: true });
}

function redoHistory() {
  if (historyBatchStart) endHistoryBatch();
  const next = historyFuture.pop();
  if (!next) return;
  historyPast.push(captureHistory(useEditorStore.getState()));
  restoringHistory = true;
  useEditorStore.setState({ ...next, selection: null, tool: 'select', message: 'Действие повторено', canUndo: true, canRedo: historyFuture.length > 0 });
}

lastHistorySnapshot = captureHistory(useEditorStore.getState());

useEditorStore.subscribe(
  (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.wallFinishes, state.textures, state.modelAssets, state.modelInstances, state.activeFloorId, state.showAllFloors] as const,
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
    (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.wallFinishes, state.modelInstances] as const,
    ([name, projectType, site, floors, rooms, wallFinishes, modelInstances]) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveAutosave(createProjectDocument({ name, projectType, site, floors, rooms, wallFinishes, modelInstances })), 180);
    },
    { equalityFn: shallow },
  );
}
