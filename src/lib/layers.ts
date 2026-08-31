import type { ProjectLayer, Selection } from '../types';

export type LayerEntityKind = 'room' | 'wall' | 'model';

export const layerEntityKey = (kind: LayerEntityKind, id: string) => `${kind}:${id}`;

export function selectionLayerKeys(selection: Selection | null) {
  if (!selection) return [];
  if (selection.kind === 'group') return selection.items.map((item) => layerEntityKey(item.kind, item.id));
  if (selection.kind === 'room' || selection.kind === 'model') return [layerEntityKey(selection.kind, selection.id)];
  if (selection.kind === 'partition') return [layerEntityKey('wall', selection.id)];
  if (selection.kind === 'wall' || selection.kind === 'vertex') return [layerEntityKey('room', selection.roomId)];
  return [];
}

export function layerStateForEntity(kind: LayerEntityKind, id: string, layersById: ReadonlyMap<string, ProjectLayer>, assignments: Record<string, string>) {
  const layerId = assignments[layerEntityKey(kind, id)];
  return layerId ? layersById.get(layerId) : undefined;
}
