import { useEffect, useMemo } from 'react';
import { Edges, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute } from 'three';

import type { WallJoinOffsets } from '../../lib/wallJoins';
import { layoutOpenings } from '../../lib/openings';
import { useEditorStore } from '../../store/editorStore';
import type { PlanWall, StandaloneWallOpening } from '../../types';

function createWallSegmentGeometry(startPositive: number, startNegative: number, endPositive: number, endNegative: number, height: number, halfThickness: number) {
  const geometry = new BufferGeometry();
  const vertices = new Float32Array([
    startPositive, 0, halfThickness, endPositive, 0, halfThickness, endNegative, 0, -halfThickness, startNegative, 0, -halfThickness,
    startPositive, height, halfThickness, endPositive, height, halfThickness, endNegative, height, -halfThickness, startNegative, height, -halfThickness,
  ]);
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface WallSegmentProps {
  startPositive: number;
  startNegative: number;
  endPositive: number;
  endNegative: number;
  bottom: number;
  height: number;
  wall: PlanWall;
  active: boolean;
  selected: boolean;
}

function WallSegment({ startPositive, startNegative, endPositive, endNegative, bottom, height, wall, active, selected }: WallSegmentProps) {
  const geometry = useMemo(() => createWallSegmentGeometry(startPositive, startNegative, endPositive, endNegative, height, wall.thickness / 2),
    [endNegative, endPositive, height, startNegative, startPositive, wall.thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (Math.max(Math.abs(endPositive - startPositive), Math.abs(endNegative - startNegative)) <= 0.015 || height <= 0.015) return null;
  return <mesh castShadow position={[0, bottom, 0]} receiveShadow>
    <primitive attach="geometry" object={geometry} />
    <meshStandardMaterial color={wall.color} flatShading opacity={active ? 1 : 0.15} roughness={0.84} transparent={!active} />
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

export function StandaloneWallMesh({ wall, joins, elevation, active }: { wall: PlanWall; joins: WallJoinOffsets; elevation: number; active: boolean }) {
  const selection = useEditorStore((state) => state.selection);
  const allOpenings = useEditorStore((state) => state.wallOpenings);
  const showDimensions = useEditorStore((state) => state.showDimensions);
  const wallToolActive = useEditorStore((state) => state.tool === 'wall');
  const select = useEditorStore((state) => state.select);
  const dx = wall.endX - wall.startX; const dz = wall.endZ - wall.startZ;
  const length = Math.hypot(dx, dz); const angle = Math.atan2(dz, dx);
  const selected = selection?.kind === 'partition' && selection.id === wall.id;
  const openings = useMemo(() => layoutOpenings(allOpenings.filter((item) => item.wallId === wall.id), length, wall.height),
    [allOpenings, length, wall.height, wall.id]);
  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!active || wallToolActive || event.delta > 4) return;
    event.stopPropagation(); select({ kind: 'partition', id: wall.id });
  };
  const wallStart = -length / 2;
  const wallEnd = length / 2;
  const startPositive = wallStart + joins.start.positive;
  const startNegative = wallStart + joins.start.negative;
  const endPositive = wallEnd + joins.end.positive;
  const endNegative = wallEnd + joins.end.negative;
  const solidSpans = useMemo(() => {
    const spans: Array<{ start: number; end: number }> = [];
    let start = wallStart;
    for (const opening of openings) { spans.push({ start, end: opening.start }); start = opening.end; }
    spans.push({ start, end: wallEnd });
    return spans;
  }, [openings, wallEnd, wallStart]);

  return <group onClick={choose} position={[(wall.startX + wall.endX) / 2, elevation + 0.12, (wall.startZ + wall.endZ) / 2]} rotation={[0, -angle, 0]}>
    {solidSpans.map((span, index) => <WallSegment active={active} bottom={0}
      endNegative={index === solidSpans.length - 1 ? endNegative : span.end} endPositive={index === solidSpans.length - 1 ? endPositive : span.end}
      height={wall.height} key={`solid-${index}`} selected={selected}
      startNegative={index === 0 ? startNegative : span.start} startPositive={index === 0 ? startPositive : span.start} wall={wall} />)}
    {openings.map(({ opening, center, start, end, height, sillHeight }) => <group key={opening.id}>
      <WallSegment active={active} bottom={0} endNegative={end} endPositive={end} height={sillHeight} selected={selected}
        startNegative={start} startPositive={start} wall={wall} />
      <WallSegment active={active} bottom={sillHeight + height} endNegative={end} endPositive={end}
        height={wall.height - sillHeight - height} selected={selected} startNegative={start} startPositive={start} wall={wall} />
      <OpeningDecoration active={active} center={center} opening={{ ...opening, width: end - start, height, sillHeight }} thickness={wall.thickness} />
    </group>)}
    {active && (showDimensions || selected) ? <Html center distanceFactor={10} position={[0, wall.height + 0.28, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[25, 0]}>
      <div className="wall-measure-label">{length.toFixed(2)} м</div>
    </Html> : null}
  </group>;
}
