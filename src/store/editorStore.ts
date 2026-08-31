import { subscribeWithSelector } from 'zustand/middleware';
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

import { createProjectDocument, readAutosave, saveAutosave } from '../lib/files';
import { createPlanFloor } from '../lib/floorStructures';
import { isSimplePolygon, polygonArea, polygonBounds, normalizeDegrees, roomVertices, snapToGrid, wallId, type Point2 } from '../lib/geometry';
import { findAvailableOpeningOffset, MAX_OPENINGS_PER_WALL, OPENING_EDGE_CLEARANCE, openingsOverlap, type OpeningLike } from '../lib/openings';
import { readProjectClipboard, summarizeProjectClipboard, writeProjectClipboard, type ProjectClipboardSummary } from '../lib/projectClipboard';
import { createProjectFromTemplate } from '../lib/projectTemplates';
import { nearestUtilityRoute, nearestUtilityRouteOfKind, UTILITY_DEVICE_KINDS, UTILITY_KINDS } from '../lib/utilities';
import { nearestUtilityWallMount, resolveUtilityDeviceMount } from '../lib/utilityWallMounts';
import { pointsMatch, snapWallPoint } from '../lib/wallSnapping';
import type { BuiltInModelKind, CameraPreset, EditorTool, ModelAsset, ModelInstance, ObjectSelection, PlanFloor, PlanRoom, PlanUtilityDevice, PlanUtilityRiser, PlanUtilityRoute, PlanWall, ProjectDocument, ProjectType, Selection, SiteSettings, SnapGuide, StandaloneWallOpening, TextureAsset, TransformMode, UtilityDeviceKind, UtilityKind, WallFinish, WallOpening, WallSnapTarget } from '../types';

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
  utilities: PlanUtilityRoute[];
  utilityDevices: PlanUtilityDevice[];
  utilityRisers: PlanUtilityRiser[];
  utilityKind: UtilityKind;
  utilityDeviceKind: UtilityDeviceKind;
  utilityVisibility: Record<UtilityKind, boolean>;
  projectClipboard: ProjectClipboardSummary | null;
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
  draftUtilityStart: Point2 | null;
  draftUtilityEnd: Point2 | null;
  draftUtilitySegmentCount: number;
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
  setUtilityKind: (kind: UtilityKind) => void;
  toggleUtilityVisibility: (kind: UtilityKind) => void;
  previewUtility: (x: number, z: number) => void;
  addUtilityPoint: (x: number, z: number) => void;
  completeUtilityChain: () => void;
  updateUtility: (id: string, patch: Partial<PlanUtilityRoute>) => void;
  duplicateUtility: (id: string) => void;
  removeUtility: (id: string) => void;
  setUtilityDeviceKind: (kind: UtilityDeviceKind) => void;
  addUtilityDeviceAt: (x: number, z: number) => void;
  updateUtilityDevice: (id: string, patch: Partial<PlanUtilityDevice>) => void;
  connectUtilityDevice: (id: string, routeId?: string) => void;
  autoConnectUtilityDevice: (id: string) => void;
  snapUtilityDeviceToWall: (id: string) => void;
  detachUtilityDeviceFromWall: (id: string) => void;
  duplicateUtilityDevice: (id: string) => void;
  removeUtilityDevice: (id: string) => void;
  addUtilityRiserAt: (x: number, z: number) => void;
  updateUtilityRiser: (id: string, patch: Partial<PlanUtilityRiser>) => void;
  connectUtilityRiser: (id: string, endpoint: 'from' | 'to', routeId?: string) => void;
  autoConnectUtilityRiser: (id: string) => void;
  duplicateUtilityRiser: (id: string) => void;
  removeUtilityRiser: (id: string) => void;
  completePolygon: () => void;
  cancelPolygon: () => void;
  updatePolygonVertex: (id: string, index: number, patch: { x?: number; z?: number }) => void;
  insertPolygonVertex: (id: string, afterIndex: number) => void;
  removePolygonVertex: (id: string, index: number) => void;
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void;
  duplicateRoom: (id: string) => void;
  copyRoomToClipboard: (id: string) => void;
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
  updateFloor: (id: string, patch: { name?: string; elevation?: number; slab?: Partial<PlanFloor['slab']>; roof?: Partial<PlanFloor['roof']> }) => void;
  duplicateActiveFloor: () => void;
  copyActiveFloorToClipboard: () => void;
  pasteProjectClipboard: () => void;
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

type HistorySnapshot = Pick<EditorState, 'projectName' | 'projectType' | 'site' | 'floors' | 'rooms' | 'walls' | 'wallOpenings' | 'wallFinishes' | 'openings' | 'textures' | 'modelAssets' | 'modelInstances' | 'utilities' | 'utilityDevices' | 'utilityRisers' | 'activeFloorId' | 'showAllFloors'>;

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

function demoProject() { return createProjectFromTemplate('family-house')!; }

const initialProject = typeof window === 'undefined' ? demoProject() : readAutosave() ?? demoProject();
const initialClipboard = typeof window === 'undefined' ? undefined : readProjectClipboard();

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

function remapUtilityDevicesAfterWallSplit(devices: PlanUtilityDevice[], rooms: PlanRoom[], sourceWalls: PlanWall[], nextWalls: PlanWall[], targets: Array<WallSnapTarget | null>) {
  const splitWallIds = new Set(targets.filter((target): target is WallSnapTarget => target?.kind === 'segment').map((target) => target.wallId));
  if (!splitWallIds.size) return devices;
  return devices.map((device) => {
    if (device.wallMount?.kind !== 'partition' || !splitWallIds.has(device.wallMount.sourceId)) return device;
    const resolved = resolveUtilityDeviceMount(device, rooms, sourceWalls);
    const placement = nearestUtilityWallMount([], nextWalls, device.floorId, resolved.x, resolved.z, 0.5);
    return placement ? { ...resolved, x: placement.x, z: placement.z, rotation: placement.rotation, wallMount: placement.mount }
      : { ...resolved, wallMount: undefined };
  });
}

function normalizedModel(model: ModelInstance): ModelInstance {
  return { ...model, name: cleanText(model.name, 80) || 'Объект', x: clamp(model.x, -200, 200), y: clamp(model.y, -10, 50),
    z: clamp(model.z, -200, 200), rotation: radians(normalizeDegrees(model.rotation * 180 / Math.PI)), scale: clamp(model.scale, 0.05, 20) };
}

function normalizedUtility(route: PlanUtilityRoute): PlanUtilityRoute {
  return { ...route, name: cleanText(route.name, 80) || UTILITY_KINDS[route.kind].label, startX: clamp(route.startX, -200, 200),
    startZ: clamp(route.startZ, -200, 200), endX: clamp(route.endX, -200, 200), endZ: clamp(route.endZ, -200, 200),
    elevation: clamp(route.elevation, 0.01, 12), diameter: clamp(route.diameter, 0.005, 0.5) };
}

function normalizedUtilityDevice(device: PlanUtilityDevice): PlanUtilityDevice {
  return { ...device, name: cleanText(device.name, 80) || UTILITY_DEVICE_KINDS[device.kind].label,
    x: clamp(device.x, -200, 200), z: clamp(device.z, -200, 200), elevation: clamp(device.elevation, 0.01, 12),
    rotation: radians(normalizeDegrees(device.rotation * 180 / Math.PI)), rating: clamp(device.rating, 0.1, 1_000) };
}

function normalizedUtilityRiser(riser: PlanUtilityRiser): PlanUtilityRiser {
  return { ...riser, name: cleanText(riser.name, 80) || `${UTILITY_KINDS[riser.kind].label} · стояк`,
    x: clamp(riser.x, -200, 200), z: clamp(riser.z, -200, 200), diameter: clamp(riser.diameter, 0.005, 0.5) };
}

function adjacentFloorPair(floors: PlanFloor[], activeFloorId: string) {
  const ordered = [...floors].sort((left, right) => left.elevation - right.elevation);
  const index = ordered.findIndex((floor) => floor.id === activeFloorId);
  if (index < 0 || ordered.length < 2) return undefined;
  const from = index < ordered.length - 1 ? ordered[index] : ordered[index - 1];
  const to = index < ordered.length - 1 ? ordered[index + 1] : ordered[index];
  return from && to ? { from, to } : undefined;
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
  utilities: initialProject.utilities,
  utilityDevices: initialProject.utilityDevices,
  utilityRisers: initialProject.utilityRisers,
  utilityKind: 'electric',
  utilityDeviceKind: 'outlet',
  utilityVisibility: { electric: true, water: true, heating: true },
  projectClipboard: summarizeProjectClipboard(initialClipboard),
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
  draftUtilityStart: null,
  draftUtilityEnd: null,
  draftUtilitySegmentCount: 0,
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
  setTool: (tool) => set({ tool, selection: null, draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
    draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [] }),
  select: (selection, additive = false) => set((state) => {
    if (!additive || !selection || !isObjectSelection(selection)) return { selection, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
      draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [] };
    const currentItems = state.selection?.kind === 'group' ? state.selection.items
      : state.selection && isObjectSelection(state.selection) ? [state.selection] : [];
    const key = objectSelectionKey(selection);
    const exists = currentItems.some((item) => objectSelectionKey(item) === key);
    const items = exists ? currentItems.filter((item) => objectSelectionKey(item) !== key) : [...currentItems, selection];
    return { selection: collapseObjectSelection(items), tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
      draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [] };
  }),
  selectObjects: (selections, additive = false) => set((state) => {
    const currentItems = additive
      ? state.selection?.kind === 'group' ? state.selection.items : state.selection && isObjectSelection(state.selection) ? [state.selection] : []
      : [];
    const items = new Map(currentItems.map((item) => [objectSelectionKey(item), item]));
    for (const selection of selections) items.set(objectSelectionKey(selection), selection);
    return { selection: collapseObjectSelection([...items.values()]), tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
      draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [] };
  }),
  setSnapGuides: (snapGuides) => set({ snapGuides }),
  setTransformMode: (transformMode) => set({ transformMode, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
    draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [] }),
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
    const utilityDevices = remapUtilityDevicesAfterWallSplit(state.utilityDevices, state.rooms, state.walls, split.walls, targets);
    const hasEndpointConnection = targets.some((target) => target?.kind === 'endpoint');
    const segmentCount = chain.segmentCount + 1;
    const connectionMessage = split.splitCount ? ` · Т-соединений: ${split.splitCount}` : hasEndpointConnection ? ' · соединение' : '';
    if (closesChain) return { walls: [...split.walls, wall], wallOpenings: split.wallOpenings, utilityDevices, selection: { kind: 'partition', id }, tool: 'select',
      draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null,
      draftWallPrecision: false,
      message: `Цепочка замкнута · стен: ${segmentCount}${connectionMessage}` };
    return { walls: [...split.walls, wall], wallOpenings: split.wallOpenings, utilityDevices, selection: null, tool: 'wall',
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
  setUtilityKind: (utilityKind) => set({ utilityKind }),
  toggleUtilityVisibility: (kind) => set((state) => ({ utilityVisibility: { ...state.utilityVisibility, [kind]: !state.utilityVisibility[kind] } })),
  previewUtility: (x, z) => set((state) => state.tool === 'utility' && state.draftUtilityStart
    ? { draftUtilityEnd: [snapToGrid(x), snapToGrid(z)] } : state),
  addUtilityPoint: (x, z) => set((state) => {
    if (state.tool !== 'utility') return state;
    const point = [snapToGrid(x), snapToGrid(z)] as Point2;
    if (!state.draftUtilityStart) return { draftUtilityStart: point, draftUtilityEnd: point, draftUtilitySegmentCount: 0,
      message: `Начало трассы «${UTILITY_KINDS[state.utilityKind].label}» задано · укажите следующую точку` };
    const length = Math.hypot(point[0] - state.draftUtilityStart[0], point[1] - state.draftUtilityStart[1]);
    if (length < 0.1) return { draftUtilityEnd: point, message: 'Длина трассы должна быть не меньше 0,1 м' };
    const id = newId('utility');
    const count = state.utilities.filter((route) => route.floorId === state.activeFloorId && route.kind === state.utilityKind).length + 1;
    const defaults = UTILITY_KINDS[state.utilityKind];
    const route = normalizedUtility({ id, floorId: state.activeFloorId, name: `${defaults.label} ${count}`, kind: state.utilityKind,
      startX: state.draftUtilityStart[0], startZ: state.draftUtilityStart[1], endX: point[0], endZ: point[1],
      elevation: defaults.defaultElevation, diameter: defaults.defaultDiameter });
    const segmentCount = state.draftUtilitySegmentCount + 1;
    return { utilities: [...state.utilities, route], utilityVisibility: { ...state.utilityVisibility, [state.utilityKind]: true },
      selection: null, draftUtilityStart: point, draftUtilityEnd: point, draftUtilitySegmentCount: segmentCount,
      message: `Сегмент ${segmentCount} создан · ${length.toFixed(2)} м · продолжайте трассу` };
  }),
  completeUtilityChain: () => set((state) => {
    if (state.tool !== 'utility') return state;
    const lastRoute = state.draftUtilitySegmentCount ? state.utilities.at(-1) : undefined;
    return { tool: 'select', selection: lastRoute ? { kind: 'utility', id: lastRoute.id } : null,
      draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0,
      message: lastRoute ? `Трасса завершена · сегментов: ${state.draftUtilitySegmentCount}` : 'Прокладка трассы отменена' };
  }),
  updateUtility: (id, patch) => set((state) => {
    const source = state.utilities.find((route) => route.id === id); if (!source) return state;
    const kind = patch.kind && ['electric', 'water', 'heating'].includes(patch.kind) ? patch.kind : source.kind;
    const route = normalizedUtility({ ...source, ...patch, id: source.id, floorId: source.floorId, kind });
    if (Math.hypot(route.endX - route.startX, route.endZ - route.startZ) < 0.1) return { message: 'Длина трассы должна быть не меньше 0,1 м' };
    const utilityDevices = state.utilityDevices.map((device) => device.routeId === id && UTILITY_DEVICE_KINDS[device.kind].utilityKind !== kind
      ? { ...device, routeId: undefined } : device);
    const utilityRisers = state.utilityRisers.map((riser) => {
      if (riser.kind === kind || riser.fromRouteId !== id && riser.toRouteId !== id) return riser;
      return { ...riser, ...(riser.fromRouteId === id ? { fromRouteId: undefined } : {}), ...(riser.toRouteId === id ? { toRouteId: undefined } : {}) };
    });
    return { utilities: state.utilities.map((item) => item.id === id ? route : item), utilityDevices, utilityRisers,
      utilityVisibility: { ...state.utilityVisibility, [kind]: true } };
  }),
  duplicateUtility: (id) => set((state) => {
    const source = state.utilities.find((route) => route.id === id); if (!source) return state;
    const copy = { ...source, id: newId('utility'), name: `${source.name} — копия`.slice(0, 80), startX: source.startX + 0.5,
      startZ: source.startZ + 0.5, endX: source.endX + 0.5, endZ: source.endZ + 0.5 };
    return { utilities: [...state.utilities, copy], selection: { kind: 'utility', id: copy.id }, message: 'Трасса скопирована' };
  }),
  removeUtility: (id) => set((state) => ({ utilities: state.utilities.filter((route) => route.id !== id),
    utilityDevices: state.utilityDevices.map((device) => device.routeId === id ? { ...device, routeId: undefined } : device),
    utilityRisers: state.utilityRisers.map((riser) => riser.fromRouteId === id || riser.toRouteId === id ? { ...riser,
      ...(riser.fromRouteId === id ? { fromRouteId: undefined } : {}), ...(riser.toRouteId === id ? { toRouteId: undefined } : {}) } : riser),
    selection: state.selection?.kind === 'utility' && state.selection.id === id ? null : state.selection, message: 'Трасса удалена' })),
  setUtilityDeviceKind: (utilityDeviceKind) => set({ utilityDeviceKind }),
  addUtilityDeviceAt: (x, z) => set((state) => {
    if (state.tool !== 'utility-device') return state;
    const defaults = UTILITY_DEVICE_KINDS[state.utilityDeviceKind];
    const count = state.utilityDevices.filter((device) => device.floorId === state.activeFloorId && device.kind === state.utilityDeviceKind).length + 1;
    let pointX = snapToGrid(x); let pointZ = snapToGrid(z); let rotation = 0;
    const wallPlacement = state.utilityDeviceKind === 'drain' ? undefined
      : nearestUtilityWallMount(state.rooms, state.walls, state.activeFloorId, pointX, pointZ);
    if (wallPlacement) { pointX = wallPlacement.x; pointZ = wallPlacement.z; rotation = wallPlacement.rotation; }
    const route = nearestUtilityRoute(state.utilities, state.utilityDeviceKind, state.activeFloorId, pointX, pointZ);
    const device = normalizedUtilityDevice({ id: newId('utility-device'), floorId: state.activeFloorId,
      name: `${defaults.label} ${count}`, kind: state.utilityDeviceKind, x: pointX, z: pointZ,
      elevation: defaults.defaultElevation, rotation, rating: defaults.defaultRating, ...(route ? { routeId: route.id } : {}),
      ...(wallPlacement ? { wallMount: wallPlacement.mount } : {}) });
    return { utilityDevices: [...state.utilityDevices, device], utilityVisibility: { ...state.utilityVisibility, [defaults.utilityKind]: true },
      selection: null, message: `${wallPlacement ? 'Закреплено на стене' : 'Размещено на сетке'} · ${route ? `подключено к «${route.name}»` : 'без подключения'}` };
  }),
  updateUtilityDevice: (id, patch) => set((state) => {
    const source = state.utilityDevices.find((device) => device.id === id); if (!source) return state;
    const kind = patch.kind && Object.hasOwn(UTILITY_DEVICE_KINDS, patch.kind) ? patch.kind : source.kind;
    const resolvedSource = resolveUtilityDeviceMount(source, state.rooms, state.walls);
    const wallMount = kind === 'drain' ? undefined : source.wallMount;
    let routeId = source.routeId;
    const linkedRoute = routeId ? state.utilities.find((route) => route.id === routeId) : undefined;
    if (routeId && linkedRoute?.kind !== UTILITY_DEVICE_KINDS[kind].utilityKind) routeId = undefined;
    if (!routeId && (kind !== source.kind || patch.x !== undefined || patch.z !== undefined)) {
      routeId = nearestUtilityRoute(state.utilities, kind, source.floorId, patch.x ?? resolvedSource.x, patch.z ?? resolvedSource.z)?.id;
    }
    const device = normalizedUtilityDevice({ ...resolvedSource, ...patch, id: source.id, floorId: source.floorId, kind, routeId, wallMount });
    const utilityKind = UTILITY_DEVICE_KINDS[kind].utilityKind;
    return { utilityDevices: state.utilityDevices.map((item) => item.id === id ? device : item),
      utilityVisibility: { ...state.utilityVisibility, [utilityKind]: true } };
  }),
  connectUtilityDevice: (id, routeId) => set((state) => {
    const device = state.utilityDevices.find((item) => item.id === id); if (!device) return state;
    const route = routeId ? state.utilities.find((item) => item.id === routeId) : undefined;
    if (routeId && (!route || route.floorId !== device.floorId || route.kind !== UTILITY_DEVICE_KINDS[device.kind].utilityKind)) return { message: 'Эта трасса несовместима с инженерной точкой' };
    return { utilityDevices: state.utilityDevices.map((item) => item.id === id ? { ...item, routeId } : item),
      message: route ? `Подключено к «${route.name}»` : 'Подключение снято' };
  }),
  autoConnectUtilityDevice: (id) => set((state) => {
    const device = state.utilityDevices.find((item) => item.id === id); if (!device) return state;
    const resolved = resolveUtilityDeviceMount(device, state.rooms, state.walls);
    const route = nearestUtilityRoute(state.utilities, device.kind, device.floorId, resolved.x, resolved.z, 200);
    if (!route) return { message: 'На этаже нет совместимой трассы' };
    return { utilityDevices: state.utilityDevices.map((item) => item.id === id ? { ...item, routeId: route.id } : item),
      utilityVisibility: { ...state.utilityVisibility, [route.kind]: true }, message: `Подключено к ближайшей трассе «${route.name}»` };
  }),
  snapUtilityDeviceToWall: (id) => set((state) => {
    const source = state.utilityDevices.find((item) => item.id === id); if (!source || source.kind === 'drain') return { message: 'Слив размещается на полу' };
    const resolved = resolveUtilityDeviceMount(source, state.rooms, state.walls);
    const placement = nearestUtilityWallMount(state.rooms, state.walls, source.floorId, resolved.x, resolved.z, 2);
    if (!placement) return { message: 'Рядом нет подходящей стены' };
    return { utilityDevices: state.utilityDevices.map((item) => item.id === id ? normalizedUtilityDevice({ ...item, x: placement.x, z: placement.z, rotation: placement.rotation, wallMount: placement.mount }) : item),
      message: 'Инженерная точка закреплена на ближайшей стене' };
  }),
  detachUtilityDeviceFromWall: (id) => set((state) => {
    const source = state.utilityDevices.find((item) => item.id === id); if (!source) return state;
    const resolved = resolveUtilityDeviceMount(source, state.rooms, state.walls);
    return { utilityDevices: state.utilityDevices.map((item) => item.id === id ? { ...resolved, wallMount: undefined } : item),
      message: 'Привязка к стене снята' };
  }),
  duplicateUtilityDevice: (id) => set((state) => {
    const source = state.utilityDevices.find((device) => device.id === id); if (!source) return state;
    const copy = { ...source, id: newId('utility-device'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 0.5, z: source.z + 0.5,
      ...(source.wallMount ? { wallMount: { ...source.wallMount, offset: Math.min(0.97, source.wallMount.offset + 0.1) } } : {}) };
    return { utilityDevices: [...state.utilityDevices, copy], selection: { kind: 'utility-device', id: copy.id }, message: 'Инженерная точка скопирована' };
  }),
  removeUtilityDevice: (id) => set((state) => ({ utilityDevices: state.utilityDevices.filter((device) => device.id !== id),
    selection: state.selection?.kind === 'utility-device' && state.selection.id === id ? null : state.selection, message: 'Инженерная точка удалена' })),
  addUtilityRiserAt: (x, z) => set((state) => {
    if (state.tool !== 'utility-riser') return state;
    const pair = adjacentFloorPair(state.floors, state.activeFloorId);
    if (!pair) return { message: 'Для стояка нужны минимум два этажа' };
    const pointX = snapToGrid(x); const pointZ = snapToGrid(z); const defaults = UTILITY_KINDS[state.utilityKind];
    const fromRoute = nearestUtilityRouteOfKind(state.utilities, state.utilityKind, pair.from.id, pointX, pointZ);
    const toRoute = nearestUtilityRouteOfKind(state.utilities, state.utilityKind, pair.to.id, pointX, pointZ);
    const count = state.utilityRisers.filter((riser) => riser.kind === state.utilityKind).length + 1;
    const riser = normalizedUtilityRiser({ id: newId('utility-riser'), name: `${defaults.label} · стояк ${count}`, kind: state.utilityKind,
      x: pointX, z: pointZ, fromFloorId: pair.from.id, toFloorId: pair.to.id, diameter: defaults.defaultDiameter,
      ...(fromRoute ? { fromRouteId: fromRoute.id } : {}), ...(toRoute ? { toRouteId: toRoute.id } : {}) });
    const connectionCount = Number(Boolean(fromRoute)) + Number(Boolean(toRoute));
    return { utilityRisers: [...state.utilityRisers, riser], utilityVisibility: { ...state.utilityVisibility, [riser.kind]: true },
      selection: null, message: `Стояк создан · подключено этажей: ${connectionCount}/2` };
  }),
  updateUtilityRiser: (id, patch) => set((state) => {
    const source = state.utilityRisers.find((riser) => riser.id === id); if (!source) return state;
    const kind = patch.kind && ['electric', 'water', 'heating'].includes(patch.kind) ? patch.kind : source.kind;
    const fromFloorId = patch.fromFloorId && state.floors.some((floor) => floor.id === patch.fromFloorId) ? patch.fromFloorId : source.fromFloorId;
    const toFloorId = patch.toFloorId && state.floors.some((floor) => floor.id === patch.toFloorId) ? patch.toFloorId : source.toFloorId;
    if (fromFloorId === toFloorId) return { message: 'Начало и конец стояка должны быть на разных этажах' };
    let fromRouteId = source.fromRouteId; let toRouteId = source.toRouteId;
    const fromRoute = fromRouteId ? state.utilities.find((route) => route.id === fromRouteId) : undefined;
    const toRoute = toRouteId ? state.utilities.find((route) => route.id === toRouteId) : undefined;
    if (fromRouteId && (!fromRoute || fromRoute.floorId !== fromFloorId || fromRoute.kind !== kind)) fromRouteId = undefined;
    if (toRouteId && (!toRoute || toRoute.floorId !== toFloorId || toRoute.kind !== kind)) toRouteId = undefined;
    const riser = normalizedUtilityRiser({ ...source, ...patch, id: source.id, kind, fromFloorId, toFloorId, fromRouteId, toRouteId });
    return { utilityRisers: state.utilityRisers.map((item) => item.id === id ? riser : item), utilityVisibility: { ...state.utilityVisibility, [kind]: true } };
  }),
  connectUtilityRiser: (id, endpoint, routeId) => set((state) => {
    const riser = state.utilityRisers.find((item) => item.id === id); if (!riser) return state;
    const floorId = endpoint === 'from' ? riser.fromFloorId : riser.toFloorId;
    const route = routeId ? state.utilities.find((item) => item.id === routeId) : undefined;
    if (routeId && (!route || route.floorId !== floorId || route.kind !== riser.kind)) return { message: 'Эта трасса несовместима со стояком' };
    const key = endpoint === 'from' ? 'fromRouteId' : 'toRouteId';
    return { utilityRisers: state.utilityRisers.map((item) => item.id === id ? { ...item, [key]: routeId } : item),
      message: route ? `Стояк подключён к «${route.name}»` : 'Подключение стояка снято' };
  }),
  autoConnectUtilityRiser: (id) => set((state) => {
    const riser = state.utilityRisers.find((item) => item.id === id); if (!riser) return state;
    const fromRoute = nearestUtilityRouteOfKind(state.utilities, riser.kind, riser.fromFloorId, riser.x, riser.z, 200);
    const toRoute = nearestUtilityRouteOfKind(state.utilities, riser.kind, riser.toFloorId, riser.x, riser.z, 200);
    if (!fromRoute && !toRoute) return { message: 'На этажах нет совместимых трасс' };
    return { utilityRisers: state.utilityRisers.map((item) => item.id === id ? { ...item,
      ...(fromRoute ? { fromRouteId: fromRoute.id } : {}), ...(toRoute ? { toRouteId: toRoute.id } : {}) } : item),
      utilityVisibility: { ...state.utilityVisibility, [riser.kind]: true }, message: `Автоподключение стояка · этажей: ${Number(Boolean(fromRoute)) + Number(Boolean(toRoute))}/2` };
  }),
  duplicateUtilityRiser: (id) => set((state) => {
    const source = state.utilityRisers.find((riser) => riser.id === id); if (!source) return state;
    const copy = normalizedUtilityRiser({ ...source, id: newId('utility-riser'), name: `${source.name} — копия`.slice(0, 80), x: source.x + 0.5, z: source.z + 0.5 });
    return { utilityRisers: [...state.utilityRisers, copy], selection: { kind: 'utility-riser', id: copy.id }, message: 'Стояк скопирован' };
  }),
  removeUtilityRiser: (id) => set((state) => ({ utilityRisers: state.utilityRisers.filter((riser) => riser.id !== id),
    selection: state.selection?.kind === 'utility-riser' && state.selection.id === id ? null : state.selection, message: 'Стояк удалён' })),
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
    const utilityDevices = state.utilityDevices.map((device) => {
      const mount = device.wallMount; if (mount?.kind !== 'room' || mount.sourceId !== id) return device;
      if (mount.wallIndex < afterIndex) return device;
      if (mount.wallIndex > afterIndex) return { ...device, wallMount: { ...mount, wallIndex: mount.wallIndex + 1 } };
      return mount.offset <= 0.5 ? { ...device, wallMount: { ...mount, offset: mount.offset * 2 } }
        : { ...device, wallMount: { ...mount, wallIndex: mount.wallIndex + 1, offset: (mount.offset - 0.5) * 2 } };
    });
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item), utilityDevices, selection,
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
    const utilityDevices = state.utilityDevices.map((device) => {
      const mount = device.wallMount; if (mount?.kind !== 'room' || mount.sourceId !== id) return device;
      if (mount.wallIndex === previousIndex || mount.wallIndex === index) return { ...resolveUtilityDeviceMount(device, state.rooms, state.walls), wallMount: undefined };
      const wallIndex = sourceWallIndices.indexOf(mount.wallIndex);
      return wallIndex >= 0 ? { ...device, wallMount: { ...mount, wallIndex } } : { ...resolveUtilityDeviceMount(device, state.rooms, state.walls), wallMount: undefined };
    });
    return { rooms: state.rooms.map((item) => item.id === id ? updatedRoom : item), utilityDevices, selection,
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
    const wallFinishes = { ...state.wallFinishes };
    for (let index = 0; index < roomVertices(source).length; index += 1) {
      const finish = state.wallFinishes[wallId(source.id, index)];
      if (finish) wallFinishes[wallId(copy.id, index)] = finish;
    }
    return { rooms: [...state.rooms, copy], openings: [...state.openings, ...copiedOpenings], wallFinishes,
      selection: { kind: 'room', id: copy.id }, message: 'Блок скопирован вместе с отделкой' };
  }),
  copyRoomToClipboard: (id) => {
    const state = get(); const room = state.rooms.find((item) => item.id === id); if (!room) return;
    const floor = state.floors.find((item) => item.id === room.floorId); if (!floor) return;
    const wallFinishes = Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => key.startsWith(`${room.id}:wall:`)));
    const clipboard = { version: 1 as const, kind: 'room' as const, label: room.name, copiedAt: Date.now(),
      project: createProjectDocument({ name: `Буфер — ${room.name}`.slice(0, 80), projectType: state.projectType, site: state.site, floors: [floor], rooms: [room],
        walls: [], wallOpenings: [], wallFinishes, openings: state.openings.filter((opening) => opening.roomId === room.id), modelInstances: [] }) };
    if (!writeProjectClipboard(clipboard)) { set({ message: 'Не удалось сохранить комнату в локальный буфер' }); return; }
    set({ projectClipboard: summarizeProjectClipboard(clipboard), message: `«${room.name}» скопирована для переноса между проектами` });
  },
  removeRoom: (id) => set((state) => {
    const utilityDevices = state.utilityDevices.map((device) => device.wallMount?.kind === 'room' && device.wallMount.sourceId === id
      ? { ...resolveUtilityDeviceMount(device, state.rooms, state.walls), wallMount: undefined } : device);
    return { rooms: state.rooms.filter((room) => room.id !== id), utilityDevices,
      wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => !key.startsWith(`${id}:wall:`))),
      openings: state.openings.filter((opening) => opening.roomId !== id),
      selection: state.selection?.kind === 'room' && state.selection.id === id || state.selection?.kind === 'vertex' && state.selection.roomId === id
        || state.selection?.kind === 'wall' && state.selection.roomId === id ? null : state.selection };
  }),
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
  removeWall: (id) => set((state) => {
    const utilityDevices = state.utilityDevices.map((device) => device.wallMount?.kind === 'partition' && device.wallMount.sourceId === id
      ? { ...resolveUtilityDeviceMount(device, state.rooms, state.walls), wallMount: undefined } : device);
    return { walls: state.walls.filter((wall) => wall.id !== id), utilityDevices,
      wallOpenings: state.wallOpenings.filter((opening) => opening.wallId !== id),
      selection: state.selection?.kind === 'partition' && state.selection.id === id ? null : state.selection, message: 'Стена удалена' };
  }),
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
    const floor = createPlanFloor(newId('floor'), `${state.floors.length + 1} этаж`, Math.max(...state.floors.map((item) => item.elevation)) + 3.2);
    return { floors: [...state.floors, floor], activeFloorId: floor.id, selection: null, showAllFloors: false, message: 'Новый этаж создан' };
  }),
  updateFloor: (id, patch) => set((state) => ({ floors: state.floors.map((floor) => floor.id === id ? {
    ...floor, name: patch.name === undefined ? floor.name : cleanText(patch.name, 80) || floor.name,
    elevation: patch.elevation === undefined ? floor.elevation : clamp(patch.elevation, -20, 60),
    slab: patch.slab ? { ...floor.slab, ...patch.slab,
      thickness: patch.slab.thickness === undefined ? floor.slab.thickness : clamp(patch.slab.thickness, 0.08, 1),
      color: patch.slab.color === undefined || !/^#[0-9a-f]{6}$/i.test(patch.slab.color) ? floor.slab.color : patch.slab.color } : floor.slab,
    roof: patch.roof ? { ...floor.roof, ...patch.roof,
      height: patch.roof.height === undefined ? floor.roof.height : clamp(patch.roof.height, 0.2, 8),
      overhang: patch.roof.overhang === undefined ? floor.roof.overhang : clamp(patch.roof.overhang, 0, 3),
      color: patch.roof.color === undefined || !/^#[0-9a-f]{6}$/i.test(patch.roof.color) ? floor.roof.color : patch.roof.color } : floor.roof,
  } : floor) })),
  duplicateActiveFloor: () => set((state) => {
    if (state.floors.length >= 12) return { message: 'Можно создать не больше 12 этажей' };
    const sourceFloor = state.floors.find((floor) => floor.id === state.activeFloorId); if (!sourceFloor) return state;
    const floor: PlanFloor = { ...sourceFloor, id: newId('floor'), name: `${sourceFloor.name} — копия`.slice(0, 80),
      elevation: Math.min(60, Math.max(...state.floors.map((item) => item.elevation)) + 3.2),
      slab: { ...sourceFloor.slab }, roof: { ...sourceFloor.roof } };
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
    const sourceUtilities = state.utilities.filter((route) => route.floorId === sourceFloor.id);
    const utilityIds = new Map(sourceUtilities.map((route) => [route.id, newId('utility')]));
    const utilities = sourceUtilities.map((route) => ({ ...route, id: utilityIds.get(route.id)!, floorId: floor.id }));
    const utilityDevices = state.utilityDevices.filter((device) => device.floorId === sourceFloor.id)
      .map((device) => {
        const sourceId = device.wallMount?.kind === 'room' ? roomIds.get(device.wallMount.sourceId) : device.wallMount ? wallIds.get(device.wallMount.sourceId) : undefined;
        return { ...device, id: newId('utility-device'), floorId: floor.id,
          ...(device.routeId && utilityIds.has(device.routeId) ? { routeId: utilityIds.get(device.routeId) } : { routeId: undefined }),
          ...(device.wallMount && sourceId ? { wallMount: { ...device.wallMount, sourceId } } : { wallMount: undefined }) };
      });
    return { floors: [...state.floors, floor], rooms: [...state.rooms, ...rooms], openings: [...state.openings, ...openings],
      walls: [...state.walls, ...walls], wallOpenings: [...state.wallOpenings, ...wallOpenings], wallFinishes,
      modelInstances: [...state.modelInstances, ...models], utilities: [...state.utilities, ...utilities], utilityDevices: [...state.utilityDevices, ...utilityDevices], activeFloorId: floor.id, selection: null,
      showAllFloors: false, message: 'Этаж скопирован вместе с содержимым' };
  }),
  copyActiveFloorToClipboard: () => {
    const state = get(); const floor = state.floors.find((item) => item.id === state.activeFloorId); if (!floor) return;
    const rooms = state.rooms.filter((room) => room.floorId === floor.id); const roomIds = new Set(rooms.map((room) => room.id));
    const roomPrefixes = rooms.map((room) => `${room.id}:wall:`);
    const walls = state.walls.filter((wall) => wall.floorId === floor.id); const wallIds = new Set(walls.map((wall) => wall.id));
    const wallFinishes = Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => roomPrefixes.some((prefix) => key.startsWith(prefix))));
    const clipboard = { version: 1 as const, kind: 'floor' as const, label: floor.name, copiedAt: Date.now(),
      project: createProjectDocument({ name: `Буфер — ${floor.name}`.slice(0, 80), projectType: state.projectType, site: state.site, floors: [floor], rooms, walls,
        wallOpenings: state.wallOpenings.filter((opening) => wallIds.has(opening.wallId)), wallFinishes,
        openings: state.openings.filter((opening) => roomIds.has(opening.roomId)), modelInstances: state.modelInstances.filter((model) => model.floorId === floor.id),
        utilities: state.utilities.filter((route) => route.floorId === floor.id), utilityDevices: state.utilityDevices.filter((device) => device.floorId === floor.id) }) };
    if (!writeProjectClipboard(clipboard)) { set({ message: 'Не удалось сохранить этаж в локальный буфер' }); return; }
    set({ projectClipboard: summarizeProjectClipboard(clipboard), message: `«${floor.name}» скопирован для переноса между проектами` });
  },
  pasteProjectClipboard: () => {
    const clipboard = readProjectClipboard();
    if (!clipboard) { set({ projectClipboard: null, message: 'Локальный буфер пуст или повреждён' }); return; }
    const state = get();
    const incoming = clipboard.project;
    if (state.rooms.length + incoming.rooms.length > 500 || state.walls.length + incoming.walls.length > 1_000
      || state.wallOpenings.length + incoming.wallOpenings.length > 1_000 || state.openings.length + incoming.openings.length > 1_000
      || state.modelInstances.length + incoming.modelInstances.length > 200 || state.utilities.length + incoming.utilities.length > 2_000
      || state.utilityDevices.length + incoming.utilityDevices.length > 2_000
      || Object.keys(state.wallFinishes).length + Object.keys(incoming.wallFinishes).length > 2_000) {
      set({ message: 'Вставка превысит допустимый размер проекта' }); return;
    }
    if (clipboard.kind === 'room') {
      const source = clipboard.project.rooms[0];
      if (!source || !state.floors.some((floor) => floor.id === state.activeFloorId)) { set({ message: 'В буфере нет комнаты для вставки' }); return; }
      const id = newId('block');
      const room = normalizedRoom({ ...source, id, floorId: state.activeFloorId, name: `${source.name} — вставка`.slice(0, 80), x: source.x + 1, z: source.z + 1 });
      const openings = clipboard.project.openings.filter((opening) => opening.roomId === source.id)
        .map((opening) => ({ ...opening, id: newId('opening'), roomId: id }));
      const wallFinishes = { ...state.wallFinishes };
      for (let index = 0; index < roomVertices(source).length; index += 1) {
        const finish = clipboard.project.wallFinishes[wallId(source.id, index)];
        if (finish) wallFinishes[wallId(id, index)] = finish;
      }
      set({ rooms: [...state.rooms, room], openings: [...state.openings, ...openings], wallFinishes,
        selection: { kind: 'room', id }, projectClipboard: summarizeProjectClipboard(clipboard), message: `Комната «${source.name}» вставлена в активный этаж` });
      return;
    }
    if (state.floors.length >= 12) { set({ message: 'Для вставки этажа нужно освободить место: максимум 12 этажей' }); return; }
    const sourceFloor = clipboard.project.floors[0]; if (!sourceFloor) { set({ message: 'В буфере нет этажа для вставки' }); return; }
    const floor: PlanFloor = { ...sourceFloor, id: newId('floor'), name: `${sourceFloor.name} — вставка`.slice(0, 80),
      elevation: Math.min(60, Math.max(...state.floors.map((item) => item.elevation)) + 3.2) };
    const roomIds = new Map(clipboard.project.rooms.map((room) => [room.id, newId('block')]));
    const rooms = clipboard.project.rooms.map((room) => ({ ...room, id: roomIds.get(room.id)!, floorId: floor.id }));
    const wallIds = new Map(clipboard.project.walls.map((wall) => [wall.id, newId('wall')]));
    const walls = clipboard.project.walls.map((wall) => ({ ...wall, id: wallIds.get(wall.id)!, floorId: floor.id }));
    const openings = clipboard.project.openings.flatMap((opening) => {
      const roomId = roomIds.get(opening.roomId); return roomId ? [{ ...opening, id: newId('opening'), roomId }] : [];
    });
    const wallOpenings = clipboard.project.wallOpenings.flatMap((opening) => {
      const wallId = wallIds.get(opening.wallId); return wallId ? [{ ...opening, id: newId('wall-opening'), wallId }] : [];
    });
    const wallFinishes = { ...state.wallFinishes };
    for (const sourceRoom of clipboard.project.rooms) {
      const roomId = roomIds.get(sourceRoom.id); if (!roomId) continue;
      for (let index = 0; index < roomVertices(sourceRoom).length; index += 1) {
        const finish = clipboard.project.wallFinishes[wallId(sourceRoom.id, index)];
        if (finish) wallFinishes[wallId(roomId, index)] = finish;
      }
    }
    const modelInstances = clipboard.project.modelInstances.map((model) => ({ ...model, id: newId('object'), floorId: floor.id }));
    const utilityIds = new Map(clipboard.project.utilities.map((route) => [route.id, newId('utility')]));
    const utilities = clipboard.project.utilities.map((route) => ({ ...route, id: utilityIds.get(route.id)!, floorId: floor.id }));
    const utilityDevices = clipboard.project.utilityDevices.map((device) => {
      const sourceId = device.wallMount?.kind === 'room' ? roomIds.get(device.wallMount.sourceId) : device.wallMount ? wallIds.get(device.wallMount.sourceId) : undefined;
      return { ...device, id: newId('utility-device'), floorId: floor.id,
        ...(device.routeId && utilityIds.has(device.routeId) ? { routeId: utilityIds.get(device.routeId) } : { routeId: undefined }),
        ...(device.wallMount && sourceId ? { wallMount: { ...device.wallMount, sourceId } } : { wallMount: undefined }) };
    });
    set({ floors: [...state.floors, floor], rooms: [...state.rooms, ...rooms], walls: [...state.walls, ...walls],
      wallOpenings: [...state.wallOpenings, ...wallOpenings], wallFinishes, openings: [...state.openings, ...openings],
      modelInstances: [...state.modelInstances, ...modelInstances], utilities: [...state.utilities, ...utilities], utilityDevices: [...state.utilityDevices, ...utilityDevices], activeFloorId: floor.id, showAllFloors: false, selection: null,
      projectClipboard: summarizeProjectClipboard(clipboard), message: `Этаж «${sourceFloor.name}» вставлен вместе с содержимым` });
  },
  setActiveFloor: (activeFloorId) => set((state) => state.floors.some((floor) => floor.id === activeFloorId)
    ? { activeFloorId, selection: null, draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
      draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, tool: 'select', snapGuides: [] } : state),
  removeActiveFloor: () => set((state) => {
    if (state.floors.length === 1) return { message: 'В проекте должен остаться хотя бы один этаж' };
    const remaining = state.floors.filter((floor) => floor.id !== state.activeFloorId);
    const removedRoomIds = new Set(state.rooms.filter((room) => room.floorId === state.activeFloorId).map((room) => room.id));
    const removedWallIds = new Set(state.walls.filter((wall) => wall.floorId === state.activeFloorId).map((wall) => wall.id));
    return { floors: remaining, rooms: state.rooms.filter((room) => room.floorId !== state.activeFloorId), walls: state.walls.filter((wall) => wall.floorId !== state.activeFloorId),
      wallOpenings: state.wallOpenings.filter((opening) => !removedWallIds.has(opening.wallId)),
      wallFinishes: Object.fromEntries(Object.entries(state.wallFinishes).filter(([key]) => ![...removedRoomIds].some((id) => key.startsWith(`${id}:wall:`)))),
      openings: state.openings.filter((opening) => !removedRoomIds.has(opening.roomId)),
      modelInstances: state.modelInstances.filter((model) => model.floorId !== state.activeFloorId),
      utilities: state.utilities.filter((route) => route.floorId !== state.activeFloorId), utilityDevices: state.utilityDevices.filter((device) => device.floorId !== state.activeFloorId),
      utilityRisers: state.utilityRisers.filter((riser) => riser.fromFloorId !== state.activeFloorId && riser.toFloorId !== state.activeFloorId),
      activeFloorId: remaining[0]?.id ?? '', selection: null, message: 'Этаж удалён' };
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
    else if (selection?.kind === 'utility') get().removeUtility(selection.id);
    else if (selection?.kind === 'utility-device') get().removeUtilityDevice(selection.id);
    else if (selection?.kind === 'utility-riser') get().removeUtilityRiser(selection.id);
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
    floors: project.floors, rooms: project.rooms, walls: project.walls, wallOpenings: project.wallOpenings, wallFinishes: project.wallFinishes, openings: project.openings, modelInstances: project.modelInstances, utilities: project.utilities, utilityDevices: project.utilityDevices, utilityRisers: project.utilityRisers,
    activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
    draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [], message: 'Планировка загружена' }),
  resetProject: () => {
    const project = demoProject();
    set({ projectName: project.name, projectType: project.projectType, site: project.site, floors: project.floors,
      rooms: project.rooms, walls: project.walls, wallOpenings: project.wallOpenings, wallFinishes: project.wallFinishes, openings: project.openings, modelInstances: project.modelInstances, utilities: project.utilities, utilityDevices: project.utilityDevices, utilityRisers: project.utilityRisers,
      activeFloorId: project.floors[0]?.id ?? '', showAllFloors: false, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
      draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [], message: 'Демо-проект восстановлен' });
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
    modelInstances: state.modelInstances, utilities: state.utilities, utilityDevices: state.utilityDevices, utilityRisers: state.utilityRisers, activeFloorId: state.activeFloorId, showAllFloors: state.showAllFloors,
  };
}

function sameHistory(left: HistorySnapshot, right: HistorySnapshot) {
  return left.projectName === right.projectName && left.projectType === right.projectType && left.site === right.site
    && left.floors === right.floors && left.rooms === right.rooms && left.walls === right.walls && left.wallOpenings === right.wallOpenings && left.wallFinishes === right.wallFinishes && left.openings === right.openings
    && left.textures === right.textures && left.modelAssets === right.modelAssets && left.modelInstances === right.modelInstances && left.utilities === right.utilities && left.utilityDevices === right.utilityDevices && left.utilityRisers === right.utilityRisers
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
  useEditorStore.setState({ ...previous, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
    draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [], message: 'Действие отменено', canUndo: historyPast.length > 0, canRedo: true });
}

function redoHistory() {
  if (historyBatchStart) endHistoryBatch();
  const next = historyFuture.pop();
  if (!next) return;
  historyPast.push(captureHistory(useEditorStore.getState()));
  restoringHistory = true;
  useEditorStore.setState({ ...next, selection: null, tool: 'select', draftPolygon: [], draftWallStart: null, draftWallStartSnap: null, draftWallEnd: null, draftWallSnap: null, draftWallChain: null, draftWallPrecision: false,
    draftUtilityStart: null, draftUtilityEnd: null, draftUtilitySegmentCount: 0, snapGuides: [], message: 'Действие повторено', canUndo: true, canRedo: historyFuture.length > 0 });
}

lastHistorySnapshot = captureHistory(useEditorStore.getState());

useEditorStore.subscribe(
  (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.walls, state.wallOpenings, state.wallFinishes, state.openings, state.textures, state.modelAssets, state.modelInstances, state.utilities, state.utilityDevices, state.utilityRisers, state.activeFloorId, state.showAllFloors] as const,
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
    (state) => [state.projectName, state.projectType, state.site, state.floors, state.rooms, state.walls, state.wallOpenings, state.wallFinishes, state.openings, state.modelInstances, state.utilities, state.utilityDevices, state.utilityRisers] as const,
    ([name, projectType, site, floors, rooms, walls, wallOpenings, wallFinishes, openings, modelInstances, utilities, utilityDevices, utilityRisers]) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveAutosave(createProjectDocument({ name, projectType, site, floors, rooms, walls, wallOpenings, wallFinishes, openings, modelInstances, utilities, utilityDevices, utilityRisers })), 180);
    },
    { equalityFn: shallow },
  );
}
