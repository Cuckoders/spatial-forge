export type ProjectType = 'apartment' | 'plot';
export type EditorTool = 'select' | 'rectangle' | 'triangle' | 'polygon' | 'wall' | 'utility' | 'utility-device';
export type RoomShape = 'rectangle' | 'triangle' | 'polygon';
export type CameraPreset = 'perspective' | 'top' | 'front';
export type TransformMode = 'translate' | 'rotate' | 'scale';
export type BuiltInModelKind = 'sofa' | 'table' | 'bed' | 'tree' | 'stairs';
export type RoofType = 'flat' | 'gable';
export type RoofRidgeDirection = 'x' | 'z';
export type UtilityKind = 'electric' | 'water' | 'heating';
export type UtilityDeviceKind = 'outlet' | 'switch' | 'panel' | 'waterPoint' | 'drain' | 'radiator';

export interface SnapGuide {
  axis: 'x' | 'z';
  value: number;
  label: string;
}

export type WallSnapTarget =
  | { wallId: string; kind: 'endpoint'; endpoint: 'start' | 'end'; x: number; z: number }
  | { wallId: string; kind: 'segment'; position: number; x: number; z: number };

export interface SiteSettings {
  width: number;
  depth: number;
}

export interface PlanFloor {
  id: string;
  name: string;
  elevation: number;
  slab: FloorSlabSettings;
  roof: FloorRoofSettings;
}

export interface FloorSlabSettings {
  enabled: boolean;
  thickness: number;
  color: string;
}

export interface FloorRoofSettings {
  enabled: boolean;
  type: RoofType;
  height: number;
  overhang: number;
  color: string;
  ridgeDirection: RoofRidgeDirection;
}

export interface PlanRoom {
  id: string;
  floorId: string;
  name: string;
  shape: RoomShape;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  wallHeight: number;
  wallThickness: number;
  floorColor: string;
  vertices?: Array<[number, number]>;
}

export interface PlanWall {
  id: string;
  floorId: string;
  name: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  height: number;
  thickness: number;
  color: string;
  frontFinish?: WallFinish;
  backFinish?: WallFinish;
}

export interface WallFinish {
  color: string;
  textureId?: string;
}

export interface WallOpening {
  id: string;
  roomId: string;
  wallIndex: number;
  kind: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface StandaloneWallOpening {
  id: string;
  wallId: string;
  kind: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface TextureAsset {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

export interface ModelAsset {
  id: string;
  name: string;
  url: string;
  size: number;
}

export interface ModelInstance {
  id: string;
  floorId: string;
  assetId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}

export interface PlanUtilityRoute {
  id: string;
  floorId: string;
  name: string;
  kind: UtilityKind;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  elevation: number;
  diameter: number;
}

export interface PlanUtilityDevice {
  id: string;
  floorId: string;
  name: string;
  kind: UtilityDeviceKind;
  x: number;
  z: number;
  elevation: number;
  rotation: number;
  rating: number;
}

export type ObjectSelection =
  | { kind: 'room'; id: string }
  | { kind: 'model'; id: string };

export type Selection =
  | ObjectSelection
  | { kind: 'group'; items: ObjectSelection[] }
  | { kind: 'vertex'; roomId: string; vertexIndex: number }
  | { kind: 'wall'; id: string; roomId: string; wallIndex: number }
  | { kind: 'partition'; id: string }
  | { kind: 'utility'; id: string }
  | { kind: 'utility-device'; id: string };

export interface ProjectDocument {
  version: 1;
  name: string;
  projectType: ProjectType;
  site: SiteSettings;
  floors: PlanFloor[];
  rooms: PlanRoom[];
  walls: PlanWall[];
  wallOpenings: StandaloneWallOpening[];
  wallFinishes: Record<string, WallFinish>;
  openings: WallOpening[];
  modelInstances: ModelInstance[];
  utilities: PlanUtilityRoute[];
  utilityDevices: PlanUtilityDevice[];
}
