import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Group } from 'three';

import { useEditorStore } from '../../store/editorStore';
import type { ModelInstance, PlanRoom } from '../../types';

const emptyRooms: PlanRoom[] = [];
const emptyModels: ModelInstance[] = [];

export function SelectionTransform() {
  const target = useRef<Group>(null!);
  const selectionRestorePending = useRef(false);
  const lastGroupPosition = useRef<readonly [number, number] | null>(null);
  const selection = useEditorStore((state) => state.selection);
  const room = useEditorStore((state) => selection?.kind === 'room' ? state.rooms.find((item) => item.id === selection.id) : undefined);
  const vertexRoom = useEditorStore((state) => selection?.kind === 'vertex' ? state.rooms.find((item) => item.id === selection.roomId) : undefined);
  const model = useEditorStore((state) => selection?.kind === 'model' ? state.modelInstances.find((item) => item.id === selection.id) : undefined);
  const rooms = useEditorStore((state) => selection?.kind === 'group' ? state.rooms : emptyRooms);
  const models = useEditorStore((state) => selection?.kind === 'group' ? state.modelInstances : emptyModels);
  const updateRoom = useEditorStore((state) => state.updateRoom);
  const updateModel = useEditorStore((state) => state.updateModel);
  const updatePolygonVertex = useEditorStore((state) => state.updatePolygonVertex);
  const moveSelectedObjects = useEditorStore((state) => state.moveSelectedObjects);
  const beginHistoryBatch = useEditorStore((state) => state.beginHistoryBatch);
  const endHistoryBatch = useEditorStore((state) => state.endHistoryBatch);
  const vertex = selection?.kind === 'vertex' ? vertexRoom?.vertices?.[selection.vertexIndex] : undefined;
  const item = room ?? model;
  const groupItems = selection?.kind === 'group' ? selection.items.flatMap((selected) => {
    const value = selected.kind === 'room' ? rooms.find((candidate) => candidate.id === selected.id) : models.find((candidate) => candidate.id === selected.id);
    return value ? [value] : [];
  }) : [];
  const floorId = room?.floorId ?? vertexRoom?.floorId ?? model?.floorId ?? groupItems[0]?.floorId;
  const elevation = useEditorStore((state) => state.floors.find((floor) => floor.id === floorId)?.elevation ?? 0);
  const groupCenter = groupItems.length ? groupItems.reduce((center, current) => ({ x: center.x + current.x, z: center.z + current.z }), { x: 0, z: 0 }) : undefined;
  if (groupCenter) { groupCenter.x /= groupItems.length; groupCenter.z /= groupItems.length; }
  if (!item && (!vertexRoom || !vertex) && !groupCenter) return null;

  const vertexWorldPosition = () => {
    if (!vertexRoom || !vertex) return undefined;
    const cosine = Math.cos(vertexRoom.rotation); const sine = Math.sin(vertexRoom.rotation);
    return [vertexRoom.x + vertex[0] * cosine - vertex[1] * sine, elevation + vertexRoom.wallHeight + 0.28,
      vertexRoom.z + vertex[0] * sine + vertex[1] * cosine] as const;
  };

  const preserveSelectionAfterDrag = () => {
    if (selectionRestorePending.current) return;
    selectionRestorePending.current = true;
    const restoreSelection = () => {
      window.removeEventListener('pointerup', restoreSelection, true);
      window.removeEventListener('mouseup', restoreSelection, true);
      window.setTimeout(() => {
        useEditorStore.getState().select(selection);
        selectionRestorePending.current = false;
      }, 0);
    };
    window.addEventListener('pointerup', restoreSelection, true);
    window.addEventListener('mouseup', restoreSelection, true);
  };

  const updatePosition = () => {
    const object = target.current;
    if (!object) return;
    preserveSelectionAfterDrag();
    if (selection?.kind === 'group' && groupCenter) {
      const previous = lastGroupPosition.current ?? [groupCenter.x, groupCenter.z];
      const dx = object.position.x - previous[0]; const dz = object.position.z - previous[1];
      if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) moveSelectedObjects(dx, dz);
      lastGroupPosition.current = [object.position.x, object.position.z];
    } else if (selection?.kind === 'vertex' && vertexRoom) {
      const dx = object.position.x - vertexRoom.x; const dz = object.position.z - vertexRoom.z;
      const cosine = Math.cos(vertexRoom.rotation); const sine = Math.sin(vertexRoom.rotation);
      updatePolygonVertex(vertexRoom.id, selection.vertexIndex, { x: dx * cosine + dz * sine, z: -dx * sine + dz * cosine });
      const currentRoom = useEditorStore.getState().rooms.find((candidate) => candidate.id === vertexRoom.id);
      const currentVertex = currentRoom?.vertices?.[selection.vertexIndex];
      if (currentRoom && currentVertex) {
        const currentCosine = Math.cos(currentRoom.rotation); const currentSine = Math.sin(currentRoom.rotation);
        object.position.set(currentRoom.x + currentVertex[0] * currentCosine - currentVertex[1] * currentSine, elevation + currentRoom.wallHeight + 0.28,
          currentRoom.z + currentVertex[0] * currentSine + currentVertex[1] * currentCosine);
      }
    } else if (room) updateRoom(room.id, { x: object.position.x, z: object.position.z });
    else if (model) updateModel(model.id, { x: object.position.x, z: object.position.z });
  };

  const startTransform = () => {
    if (selection?.kind === 'group' && target.current) lastGroupPosition.current = [target.current.position.x, target.current.position.z];
    beginHistoryBatch();
  };
  const finishTransform = () => { lastGroupPosition.current = null; endHistoryBatch(); };
  const position = vertexWorldPosition() ?? (groupCenter ? [groupCenter.x, elevation + 0.14, groupCenter.z] as const : [item!.x, elevation + 0.14, item!.z] as const);
  const selectionKey = selection?.kind === 'vertex' ? `vertex:${selection.roomId}:${selection.vertexIndex}`
    : selection?.kind === 'group' ? `group:${selection.items.map((selected) => `${selected.kind}:${selected.id}`).join('|')}` : `${selection?.kind}:${item!.id}`;

  return <>
    <group key={`target:${selectionKey}`} position={position} ref={target} />
    <TransformControls
      key={`controls:${selectionKey}`}
      mode="translate"
      object={target}
      onMouseDown={startTransform}
      onMouseUp={finishTransform}
      onObjectChange={updatePosition}
      showY={false}
      size={selection?.kind === 'vertex' ? 0.55 : 0.7}
      space="world"
      translationSnap={0.5}
    />
  </>;
}
