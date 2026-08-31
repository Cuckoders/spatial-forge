import { Edges, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { useEditorStore } from '../../store/editorStore';
import type { PlanWall } from '../../types';

export function StandaloneWallMesh({ wall, elevation, active }: { wall: PlanWall; elevation: number; active: boolean }) {
  const selection = useEditorStore((state) => state.selection);
  const showDimensions = useEditorStore((state) => state.showDimensions);
  const select = useEditorStore((state) => state.select);
  const dx = wall.endX - wall.startX;
  const dz = wall.endZ - wall.startZ;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const selected = selection?.kind === 'partition' && selection.id === wall.id;
  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!active || event.delta > 4) return;
    event.stopPropagation();
    select({ kind: 'partition', id: wall.id });
  };

  return <group onClick={choose} position={[(wall.startX + wall.endX) / 2, elevation + 0.12, (wall.startZ + wall.endZ) / 2]} rotation={[0, -angle, 0]}>
    <mesh castShadow position={[0, wall.height / 2, 0]} receiveShadow>
      <boxGeometry args={[length, wall.height, wall.thickness]} />
      <meshStandardMaterial color={wall.color} opacity={active ? 1 : 0.15} roughness={0.84} transparent={!active} />
      {selected ? <Edges color="#E8FF57" threshold={10} /> : null}
    </mesh>
    {active && (showDimensions || selected) ? <Html center distanceFactor={10} position={[0, wall.height + 0.28, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[25, 0]}>
      <div className="wall-measure-label">{length.toFixed(2)} м</div>
    </Html> : null}
  </group>;
}
