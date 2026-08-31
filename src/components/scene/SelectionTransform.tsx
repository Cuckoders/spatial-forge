import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Group } from 'three';

import { boundsForModel, boundsForRoom, mergeBounds, snapBounds, translateBounds } from '../../lib/snapping';
import { useEditorStore } from '../../store/editorStore';

export function SelectionTransform() {
  const target = useRef<Group>(null!);
  const selectionRestorePending = useRef(false);
  const lastGroupPosition = useRef<readonly [number, number] | null>(null);
  const selection = useEditorStore((state) => state.selection);
  const rooms = useEditorStore((state) => state.rooms);
  const models = useEditorStore((state) => state.modelInstances);
  const room = selection?.kind === 'room' ? rooms.find((item) => item.id === selection.id) : undefined;
  const vertexRoom = selection?.kind === 'vertex' ? rooms.find((item) => item.id === selection.roomId) : undefined;
  const model = selection?.kind === 'model' ? models.find((item) => item.id === selection.id) : undefined;
  const updateRoom = useEditorStore((state) => state.updateRoom);
  const updateModel = useEditorStore((state) => state.updateModel);
  const updatePolygonVertex = useEditorStore((state) => state.updatePolygonVertex);
  const moveSelectedObjects = useEditorStore((state) => state.moveSelectedObjects);
  const setSnapGuides = useEditorStore((state) => state.setSnapGuides);
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
  const selectedRoomIds = new Set(selection?.kind === 'group' ? selection.items.filter((selected) => selected.kind === 'room').map((selected) => selected.id) : room ? [room.id] : []);
  const selectedModelIds = new Set(selection?.kind === 'group' ? selection.items.filter((selected) => selected.kind === 'model').map((selected) => selected.id) : model ? [model.id] : []);
  const groupBounds = selection?.kind === 'group' ? mergeBounds(selection.items.flatMap((selected) => {
    if (selected.kind === 'room') { const value = rooms.find((candidate) => candidate.id === selected.id); return value ? [boundsForRoom(value)] : []; }
    const value = models.find((candidate) => candidate.id === selected.id); return value ? [boundsForModel(value)] : [];
  })) : undefined;
  const targetBounds = floorId ? [
    ...rooms.filter((candidate) => candidate.floorId === floorId && !selectedRoomIds.has(candidate.id)).map(boundsForRoom),
    ...models.filter((candidate) => candidate.floorId === floorId && !selectedModelIds.has(candidate.id)).map(boundsForModel),
  ] : [];
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
    if (selection?.kind === 'group' && groupCenter && groupBounds) {
      const previous = lastGroupPosition.current ?? [groupCenter.x, groupCenter.z];
      const candidateDx = object.position.x - previous[0]; const candidateDz = object.position.z - previous[1];
      const snapped = snapBounds(translateBounds(groupBounds, candidateDx, candidateDz), targetBounds);
      const dx = candidateDx + snapped.dx; const dz = candidateDz + snapped.dz;
      object.position.x += snapped.dx; object.position.z += snapped.dz;
      setSnapGuides(snapped.guides);
      if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) moveSelectedObjects(dx, dz);
      lastGroupPosition.current = [object.position.x, object.position.z];
    } else if (selection?.kind === 'vertex' && vertexRoom) {
      setSnapGuides([]);
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
    } else if (room) {
      const snapped = snapBounds(translateBounds(boundsForRoom(room), object.position.x - room.x, object.position.z - room.z), targetBounds);
      object.position.x += snapped.dx; object.position.z += snapped.dz; setSnapGuides(snapped.guides);
      updateRoom(room.id, { x: object.position.x, z: object.position.z });
    } else if (model) {
      const snapped = snapBounds(translateBounds(boundsForModel(model), object.position.x - model.x, object.position.z - model.z), targetBounds);
      object.position.x += snapped.dx; object.position.z += snapped.dz; setSnapGuides(snapped.guides);
      updateModel(model.id, { x: object.position.x, z: object.position.z });
    }
  };

  const startTransform = () => {
    if (selection?.kind === 'group' && target.current) lastGroupPosition.current = [target.current.position.x, target.current.position.z];
    setSnapGuides([]);
    beginHistoryBatch();
  };
  const finishTransform = () => { lastGroupPosition.current = null; setSnapGuides([]); endHistoryBatch(); };
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
