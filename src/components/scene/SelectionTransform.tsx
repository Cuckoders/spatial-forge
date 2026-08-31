import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Group } from 'three';

import { useEditorStore } from '../../store/editorStore';

export function SelectionTransform() {
  const target = useRef<Group>(null!);
  const selectionRestorePending = useRef(false);
  const selection = useEditorStore((state) => state.selection);
  const room = useEditorStore((state) => selection?.kind === 'room' ? state.rooms.find((item) => item.id === selection.id) : undefined);
  const vertexRoom = useEditorStore((state) => selection?.kind === 'vertex' ? state.rooms.find((item) => item.id === selection.roomId) : undefined);
  const model = useEditorStore((state) => selection?.kind === 'model' ? state.modelInstances.find((item) => item.id === selection.id) : undefined);
  const floorId = room?.floorId ?? vertexRoom?.floorId ?? model?.floorId;
  const elevation = useEditorStore((state) => state.floors.find((floor) => floor.id === floorId)?.elevation ?? 0);
  const updateRoom = useEditorStore((state) => state.updateRoom);
  const updateModel = useEditorStore((state) => state.updateModel);
  const updatePolygonVertex = useEditorStore((state) => state.updatePolygonVertex);
  const beginHistoryBatch = useEditorStore((state) => state.beginHistoryBatch);
  const endHistoryBatch = useEditorStore((state) => state.endHistoryBatch);
  const vertex = selection?.kind === 'vertex' ? vertexRoom?.vertices?.[selection.vertexIndex] : undefined;
  const item = room ?? model;
  if (!item && (!vertexRoom || !vertex)) return null;

  const vertexWorldPosition = () => {
    if (!vertexRoom || !vertex) return undefined;
    const cosine = Math.cos(vertexRoom.rotation); const sine = Math.sin(vertexRoom.rotation);
    return [vertexRoom.x + vertex[0] * cosine - vertex[1] * sine, elevation + vertexRoom.wallHeight + 0.28,
      vertexRoom.z + vertex[0] * sine + vertex[1] * cosine] as const;
  };

  const updatePosition = () => {
    const object = target.current;
    if (!object) return;
    if (!selectionRestorePending.current) {
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
    }
    if (selection?.kind === 'vertex' && vertexRoom) {
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
    }
    else if (room) updateRoom(room.id, { x: object.position.x, z: object.position.z });
    else if (model) updateModel(model.id, { x: object.position.x, z: object.position.z });
  };

  const position = vertexWorldPosition() ?? [item!.x, elevation + 0.14, item!.z] as const;
  const selectionKey = selection?.kind === 'vertex' ? `vertex:${selection.roomId}:${selection.vertexIndex}` : `${selection?.kind}:${item!.id}`;

  return <>
    <group key={`target:${selectionKey}`} position={position} ref={target} />
    <TransformControls
      key={`controls:${selectionKey}`}
      mode="translate"
      object={target}
      onMouseDown={beginHistoryBatch}
      onMouseUp={endHistoryBatch}
      onObjectChange={updatePosition}
      showY={false}
      size={selection?.kind === 'vertex' ? 0.55 : 0.7}
      space="world"
      translationSnap={0.5}
    />
  </>;
}
