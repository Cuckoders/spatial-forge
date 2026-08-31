import { Edges, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { useEditorStore } from '../../store/editorStore';
import type { PlanWall, StandaloneWallOpening } from '../../types';

function WallSegment({ width, height, x, y, wall, active, selected }: { width: number; height: number; x: number; y: number; wall: PlanWall; active: boolean; selected: boolean }) {
  if (width <= 0.015 || height <= 0.015) return null;
  return <mesh castShadow position={[x, y, 0]} receiveShadow>
    <boxGeometry args={[width, height, wall.thickness]} />
    <meshStandardMaterial color={wall.color} opacity={active ? 1 : 0.15} roughness={0.84} transparent={!active} />
    {selected ? <Edges color="#E8FF57" threshold={10} /> : null}
  </mesh>;
}

function OpeningDecoration({ opening, center, thickness, active }: { opening: StandaloneWallOpening; center: number; thickness: number; active: boolean }) {
  const opacity = active ? 1 : 0.16;
  const frame = Math.min(0.08, opening.width * 0.08);
  if (opening.kind === 'door') return <group position={[center - opening.width / 2 + frame, 0, 0]}>
    <mesh castShadow position={[0, opening.height / 2, 0]}><boxGeometry args={[frame * 2, opening.height, thickness + 0.055]} /><meshStandardMaterial color="#6E513B" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width - frame * 2, opening.height / 2, 0]}><boxGeometry args={[frame * 2, opening.height, thickness + 0.055]} /><meshStandardMaterial color="#6E513B" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width / 2 - frame, opening.height - frame, 0]}><boxGeometry args={[opening.width, frame * 2, thickness + 0.055]} /><meshStandardMaterial color="#6E513B" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width / 2 - frame, opening.height / 2 - frame, -thickness * 0.7]} rotation={[0, -0.48, 0]}>
      <boxGeometry args={[opening.width - frame * 3, opening.height - frame * 3, 0.055]} /><meshStandardMaterial color="#9B7655" opacity={opacity} roughness={0.78} transparent={opacity < 1} />
    </mesh>
  </group>;
  const middleY = opening.sillHeight + opening.height / 2;
  return <group position={[center, middleY, 0]}>
    <mesh><boxGeometry args={[opening.width - frame * 2, opening.height - frame * 2, 0.025]} /><meshPhysicalMaterial color="#A8D3DC" opacity={active ? 0.38 : 0.1} roughness={0.05} transparent transmission={0.25} /></mesh>
    <mesh castShadow position={[-opening.width / 2 + frame / 2, 0, 0]}><boxGeometry args={[frame, opening.height, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width / 2 - frame / 2, 0, 0]}><boxGeometry args={[frame, opening.height, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[0, -opening.height / 2 + frame / 2, 0]}><boxGeometry args={[opening.width, frame, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[0, opening.height / 2 - frame / 2, 0]}><boxGeometry args={[opening.width, frame, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh position={[0, 0, 0.01]}><boxGeometry args={[frame * 0.72, opening.height - frame * 2, thickness + 0.05]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
  </group>;
}

export function StandaloneWallMesh({ wall, elevation, active }: { wall: PlanWall; elevation: number; active: boolean }) {
  const selection = useEditorStore((state) => state.selection);
  const opening = useEditorStore((state) => state.wallOpenings.find((item) => item.wallId === wall.id));
  const showDimensions = useEditorStore((state) => state.showDimensions);
  const wallToolActive = useEditorStore((state) => state.tool === 'wall');
  const select = useEditorStore((state) => state.select);
  const dx = wall.endX - wall.startX; const dz = wall.endZ - wall.startZ;
  const length = Math.hypot(dx, dz); const angle = Math.atan2(dz, dx);
  const selected = selection?.kind === 'partition' && selection.id === wall.id;
  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!active || wallToolActive || event.delta > 4) return;
    event.stopPropagation(); select({ kind: 'partition', id: wall.id });
  };
  const center = opening ? Math.min(length / 2 - opening.width / 2, Math.max(-length / 2 + opening.width / 2, -length / 2 + opening.offset * length)) : 0;
  const leftWidth = opening ? center - opening.width / 2 + length / 2 : length;
  const rightWidth = opening ? length / 2 - center - opening.width / 2 : 0;
  const topHeight = opening ? wall.height - opening.sillHeight - opening.height : 0;

  return <group onClick={choose} position={[(wall.startX + wall.endX) / 2, elevation + 0.12, (wall.startZ + wall.endZ) / 2]} rotation={[0, -angle, 0]}>
    <WallSegment active={active} height={wall.height} selected={selected} wall={wall} width={leftWidth} x={-length / 2 + leftWidth / 2} y={wall.height / 2} />
    {opening ? <>
      <WallSegment active={active} height={wall.height} selected={selected} wall={wall} width={rightWidth} x={length / 2 - rightWidth / 2} y={wall.height / 2} />
      <WallSegment active={active} height={opening.sillHeight} selected={selected} wall={wall} width={opening.width} x={center} y={opening.sillHeight / 2} />
      <WallSegment active={active} height={topHeight} selected={selected} wall={wall} width={opening.width} x={center} y={opening.sillHeight + opening.height + topHeight / 2} />
      <OpeningDecoration active={active} center={center} opening={opening} thickness={wall.thickness} />
    </> : null}
    {active && (showDimensions || selected) ? <Html center distanceFactor={10} position={[0, wall.height + 0.28, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[25, 0]}>
      <div className="wall-measure-label">{length.toFixed(2)} м</div>
    </Html> : null}
  </group>;
}
