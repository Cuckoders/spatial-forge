export type ProjectType = 'apartment' | 'plot';
export type EditorTool = 'select' | 'rectangle' | 'triangle' | 'polygon' | 'wall';
export type RoomShape = 'rectangle' | 'triangle' | 'polygon';
export type CameraPreset = 'perspective' | 'top' | 'front';
export type TransformMode = 'translate' | 'rotate' | 'scale';
export type BuiltInModelKind = 'sofa' | 'table' | 'bed' | 'tree' | 'stairs';

export interface SnapGuide {
  axis: 'x' | 'z';
  value: number;
  label: string;
}

export interface SiteSettings {
  width: number;
  depth: number;
}

export interface PlanFloor {
  id: string;
  name: string;
  elevation: number;
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

export type ObjectSelection =
  | { kind: 'room'; id: string }
  | { kind: 'model'; id: string };

export type Selection =
  | ObjectSelection
  | { kind: 'group'; items: ObjectSelection[] }
  | { kind: 'vertex'; roomId: string; vertexIndex: number }
  | { kind: 'wall'; id: string; roomId: string; wallIndex: number }
  | { kind: 'partition'; id: string };

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
}
