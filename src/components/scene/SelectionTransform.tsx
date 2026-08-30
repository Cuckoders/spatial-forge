import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Group } from 'three';

import { useEditorStore } from '../../store/editorStore';

export function SelectionTransform() {
  const target = useRef<Group>(null);
  const selection = useEditorStore((state) => state.selection);
  const room = useEditorStore((state) => selection?.kind === 'room' ? state.rooms.find((item) => item.id === selection.id) : undefined);
  const model = useEditorStore((state) => selection?.kind === 'model' ? state.modelInstances.find((item) => item.id === selection.id) : undefined);
  const floorId = room?.floorId ?? model?.floorId;
  const elevation = useEditorStore((state) => state.floors.find((floor) => floor.id === floorId)?.elevation ?? 0);
  const updateRoom = useEditorStore((state) => state.updateRoom);
  const updateModel = useEditorStore((state) => state.updateModel);
  const beginHistoryBatch = useEditorStore((state) => state.beginHistoryBatch);
  const endHistoryBatch = useEditorStore((state) => state.endHistoryBatch);
  const item = room ?? model;
  if (!item) return null;

  const updatePosition = () => {
    const object = target.current;
    if (!object) return;
    if (room) updateRoom(room.id, { x: object.position.x, z: object.position.z });
    else if (model) updateModel(model.id, { x: object.position.x, z: object.position.z });
  };

  return <TransformControls
    key={`${selection?.kind}:${item.id}`}
    mode="translate"
    onMouseDown={beginHistoryBatch}
    onMouseUp={endHistoryBatch}
    onObjectChange={updatePosition}
    showY={false}
    size={0.7}
    space="world"
    translationSnap={0.5}
  >
    <group position={[item.x, elevation + 0.14, item.z]} ref={target} />
  </TransformControls>;
}
