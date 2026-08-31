import { wallId } from './geometry';
import { createPlanFloor } from './floorStructures';
import type { ProjectDocument, ProjectType } from '../types';

export interface ProjectTemplateInfo {
  id: string;
  name: string;
  description: string;
  projectType: ProjectType;
  accent: string;
  project: ProjectDocument;
}

const familyHouse: ProjectDocument = {
  version: 1, name: 'Дом у сада', projectType: 'apartment', site: { width: 20, depth: 16 },
  floors: [createPlanFloor('floor-1', '1 этаж', 0), { ...createPlanFloor('floor-2', '2 этаж', 3.2),
    roof: { enabled: true, type: 'gable', height: 1.8, overhang: 0.45, color: '#76594B', ridgeDirection: 'x' } }],
  rooms: [
    { id: 'living', floorId: 'floor-1', name: 'Гостиная', shape: 'rectangle', x: -2.5, z: -1.5, width: 5, depth: 4, rotation: 0, wallHeight: 2.8, wallThickness: 0.16, floorColor: '#CDBA9A' },
    { id: 'kitchen', floorId: 'floor-1', name: 'Кухня', shape: 'rectangle', x: 2.25, z: -1.5, width: 4.5, depth: 4, rotation: 0, wallHeight: 2.8, wallThickness: 0.16, floorColor: '#B9C8BE' },
    { id: 'bedroom', floorId: 'floor-1', name: 'Спальня', shape: 'rectangle', x: -2.75, z: 2.25, width: 4.5, depth: 3.5, rotation: 0, wallHeight: 2.8, wallThickness: 0.16, floorColor: '#C8C4D3' },
    { id: 'terrace', floorId: 'floor-1', name: 'Терраса', shape: 'triangle', x: 2.25, z: 2.25, width: 4.5, depth: 3.5, rotation: 0, wallHeight: 1.1, wallThickness: 0.12, floorColor: '#B9A88A' },
    { id: 'studio', floorId: 'floor-2', name: 'Студия', shape: 'rectangle', x: 0, z: 0, width: 7, depth: 5, rotation: 0, wallHeight: 2.7, wallThickness: 0.16, floorColor: '#D8CFBB' },
  ],
  walls: [], wallOpenings: [],
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
  utilities: [], utilityDevices: [], utilityRisers: [],
};

const compactApartment: ProjectDocument = {
  version: 1, name: 'Компактная квартира', projectType: 'apartment', site: { width: 14, depth: 11 },
  floors: [createPlanFloor('compact-floor', 'Квартира', 0)],
  rooms: [
    { id: 'compact-living', floorId: 'compact-floor', name: 'Кухня-гостиная', shape: 'rectangle', x: -2.25, z: -1.5, width: 5.5, depth: 4, rotation: 0, wallHeight: 2.7, wallThickness: 0.14, floorColor: '#C9B89A' },
    { id: 'compact-bedroom', floorId: 'compact-floor', name: 'Спальня', shape: 'rectangle', x: 2.25, z: -1.5, width: 3.5, depth: 4, rotation: 0, wallHeight: 2.7, wallThickness: 0.14, floorColor: '#CFC9D8' },
    { id: 'compact-hall', floorId: 'compact-floor', name: 'Прихожая', shape: 'rectangle', x: -1.25, z: 2, width: 3.5, depth: 3, rotation: 0, wallHeight: 2.7, wallThickness: 0.14, floorColor: '#D5CDBC' },
    { id: 'compact-bath', floorId: 'compact-floor', name: 'Ванная', shape: 'rectangle', x: 2.25, z: 2, width: 3.5, depth: 3, rotation: 0, wallHeight: 2.7, wallThickness: 0.14, floorColor: '#B9D0D2' },
  ],
  walls: [], wallOpenings: [],
  wallFinishes: { [wallId('compact-living', 1)]: { color: '#DCE5DD' }, [wallId('compact-bedroom', 2)]: { color: '#DDD6E7' }, [wallId('compact-bath', 0)]: { color: '#C6DCDE' } },
  openings: [
    { id: 'compact-door-bedroom', roomId: 'compact-bedroom', wallIndex: 3, kind: 'door', offset: 0.72, width: 0.8, height: 2.05, sillHeight: 0 },
    { id: 'compact-door-bath', roomId: 'compact-bath', wallIndex: 3, kind: 'door', offset: 0.35, width: 0.75, height: 2.05, sillHeight: 0 },
    { id: 'compact-window', roomId: 'compact-living', wallIndex: 0, kind: 'window', offset: 0.42, width: 1.8, height: 1.2, sillHeight: 0.85 },
  ],
  modelInstances: [
    { id: 'compact-sofa', floorId: 'compact-floor', assetId: 'builtin:sofa', name: 'Диван', x: -2.6, y: 0, z: -1.2, rotation: 0, scale: 0.9 },
    { id: 'compact-bed', floorId: 'compact-floor', assetId: 'builtin:bed', name: 'Кровать', x: 2.25, y: 0, z: -1.5, rotation: Math.PI / 2, scale: 0.82 },
    { id: 'compact-table', floorId: 'compact-floor', assetId: 'builtin:table', name: 'Стол', x: -0.7, y: 0, z: -1.3, rotation: 0, scale: 0.75 },
  ],
  utilities: [], utilityDevices: [], utilityRisers: [],
};

const gardenPlot: ProjectDocument = {
  version: 1, name: 'Садовый участок', projectType: 'plot', site: { width: 30, depth: 24 },
  floors: [createPlanFloor('plot-floor', 'Участок', 0)],
  rooms: [
    { id: 'plot-house', floorId: 'plot-floor', name: 'Дом', shape: 'rectangle', x: -4, z: -1.5, width: 8, depth: 7, rotation: 0, wallHeight: 3, wallThickness: 0.2, floorColor: '#C8B18D' },
    { id: 'plot-terrace', floorId: 'plot-floor', name: 'Терраса', shape: 'rectangle', x: 3, z: -1.5, width: 5.5, depth: 4, rotation: 0, wallHeight: 0.7, wallThickness: 0.12, floorColor: '#B9A17D' },
  ],
  walls: [
    { id: 'plot-fence-north', floorId: 'plot-floor', name: 'Северный забор', startX: -13, startZ: -10, endX: 13, endZ: -10, height: 1.7, thickness: 0.12, color: '#7B765F' },
    { id: 'plot-fence-east', floorId: 'plot-floor', name: 'Восточный забор', startX: 13, startZ: -10, endX: 13, endZ: 10, height: 1.7, thickness: 0.12, color: '#7B765F' },
    { id: 'plot-fence-south', floorId: 'plot-floor', name: 'Южный забор', startX: 13, startZ: 10, endX: -13, endZ: 10, height: 1.7, thickness: 0.12, color: '#7B765F' },
    { id: 'plot-fence-west', floorId: 'plot-floor', name: 'Западный забор', startX: -13, startZ: 10, endX: -13, endZ: -10, height: 1.7, thickness: 0.12, color: '#7B765F' },
  ],
  wallOpenings: [{ id: 'plot-gate', wallId: 'plot-fence-north', kind: 'door', offset: 0.72, width: 2.8, height: 1.65, sillHeight: 0 }],
  wallFinishes: { [wallId('plot-house', 0)]: { color: '#D8C6A8' }, [wallId('plot-house', 1)]: { color: '#C7D2C5' } },
  openings: [{ id: 'plot-house-window', roomId: 'plot-house', wallIndex: 0, kind: 'window', offset: 0.5, width: 2, height: 1.3, sillHeight: 0.9 }],
  modelInstances: [
    { id: 'plot-tree-1', floorId: 'plot-floor', assetId: 'builtin:tree', name: 'Яблоня', x: 6, y: 0, z: 5, rotation: 0, scale: 1.2 },
    { id: 'plot-tree-2', floorId: 'plot-floor', assetId: 'builtin:tree', name: 'Яблоня', x: 9, y: 0, z: 4, rotation: 0.4, scale: 1 },
    { id: 'plot-tree-3', floorId: 'plot-floor', assetId: 'builtin:tree', name: 'Дерево', x: 7.5, y: 0, z: 7.5, rotation: 0.8, scale: 1.35 },
    { id: 'plot-table', floorId: 'plot-floor', assetId: 'builtin:table', name: 'Стол на террасе', x: 3, y: 0, z: -1.5, rotation: 0, scale: 0.9 },
  ],
  utilities: [], utilityDevices: [], utilityRisers: [],
};

const blankProject: ProjectDocument = {
  version: 1, name: 'Новый проект', projectType: 'apartment', site: { width: 20, depth: 16 },
  floors: [createPlanFloor('blank-floor', '1 этаж', 0)], rooms: [], walls: [], wallOpenings: [], wallFinishes: {}, openings: [], modelInstances: [], utilities: [], utilityDevices: [], utilityRisers: [],
};

export const projectTemplates: ProjectTemplateInfo[] = [
  { id: 'family-house', name: 'Семейный дом', description: 'Два этажа, пять помещений и базовая меблировка.', projectType: 'apartment', accent: '#B8C951', project: familyHouse },
  { id: 'compact-apartment', name: 'Компактная квартира', description: 'Четыре помещения на одном этаже, проёмы и мебель.', projectType: 'apartment', accent: '#AAB4D0', project: compactApartment },
  { id: 'garden-plot', name: 'Садовый участок', description: 'Дом, терраса, ограждение с воротами и озеленение.', projectType: 'plot', accent: '#83A879', project: gardenPlot },
  { id: 'blank-project', name: 'Чистый проект', description: 'Пустая площадка и один этаж для планировки с нуля.', projectType: 'apartment', accent: '#C9CBC4', project: blankProject },
];

export function createProjectFromTemplate(id: string) {
  const template = projectTemplates.find((item) => item.id === id);
  return template ? structuredClone(template.project) : undefined;
}
