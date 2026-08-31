import { useEffect, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import { BufferGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three';

import { roomVertices } from '../../lib/geometry';
import { boundsForRoom, mergeBounds } from '../../lib/snapping';
import type { PlanFloor, PlanRoom } from '../../types';

function RoomSlab({ room, elevation, floor, active }: { room: PlanRoom; elevation: number; floor: PlanFloor; active: boolean }) {
  const geometry = useMemo(() => {
    const vertices = roomVertices(room);
    const first = vertices[0];
    const shape = new Shape();
    if (first) {
      shape.moveTo(first[0], first[1]);
      for (const point of vertices.slice(1)) shape.lineTo(point[0], point[1]);
      shape.closePath();
    }
    const value = new ExtrudeGeometry(shape, { bevelEnabled: false, depth: floor.slab.thickness });
    value.rotateX(Math.PI / 2);
    return value;
  }, [floor.slab.thickness, room]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return <mesh castShadow geometry={geometry} position={[room.x, elevation, room.z]} raycast={() => undefined} receiveShadow rotation={[0, -room.rotation, 0]}>
    <meshStandardMaterial color={floor.slab.color} opacity={active ? 1 : 0.16} roughness={0.88} transparent={!active} />
    {active ? <Edges color="#747971" threshold={18} /> : null}
  </mesh>;
}

function createGableGeometry(width: number, depth: number, height: number) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const points = [
    [-halfWidth, 0, -halfDepth], [halfWidth, 0, -halfDepth], [-halfWidth, 0, halfDepth], [halfWidth, 0, halfDepth],
    [-halfWidth, height, 0], [halfWidth, height, 0],
  ] as const;
  const triangles = [[0, 5, 1], [0, 4, 5], [2, 5, 4], [2, 3, 5], [0, 2, 4], [1, 5, 3], [0, 1, 3], [0, 3, 2]] as const;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap((point) => [...point]), 3));
  geometry.setIndex(triangles.flatMap((triangle) => [...triangle]));
  geometry.computeVertexNormals();
  return geometry;
}

function GableRoof({ floor, width, depth, centerX, centerZ, baseHeight, opacity, active }: {
  floor: PlanFloor; width: number; depth: number; centerX: number; centerZ: number; baseHeight: number; opacity: number; active: boolean;
}) {
  const gableWidth = floor.roof.ridgeDirection === 'x' ? width : depth;
  const gableDepth = floor.roof.ridgeDirection === 'x' ? depth : width;
  const geometry = useMemo(() => createGableGeometry(gableWidth, gableDepth, floor.roof.height), [floor.roof.height, gableDepth, gableWidth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh castShadow geometry={geometry} position={[centerX, baseHeight, centerZ]} raycast={() => undefined} receiveShadow rotation={[0, floor.roof.ridgeDirection === 'x' ? 0 : Math.PI / 2, 0]}>
    <meshStandardMaterial color={floor.roof.color} flatShading opacity={opacity} roughness={0.78} side={DoubleSide} transparent={opacity < 1} />
    {active ? <Edges color="#4B4E49" threshold={12} /> : null}
  </mesh>;
}

function FloorRoof({ floor, rooms, active }: { floor: PlanFloor; rooms: PlanRoom[]; active: boolean }) {
  const bounds = useMemo(() => mergeBounds(rooms.map(boundsForRoom)), [rooms]);
  const baseHeight = useMemo(() => rooms.reduce((maximum, room) => Math.max(maximum, room.wallHeight), 0) + floor.elevation + 0.12, [floor.elevation, rooms]);
  const width = bounds ? bounds.maxX - bounds.minX + floor.roof.overhang * 2 : 0;
  const depth = bounds ? bounds.maxZ - bounds.minZ + floor.roof.overhang * 2 : 0;
  const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const centerZ = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  if (!bounds || width <= 0 || depth <= 0) return null;
  const opacity = active ? 0.94 : 0.16;

  if (floor.roof.type === 'flat') return <mesh castShadow key="flat-roof" position={[centerX, baseHeight + 0.1, centerZ]} raycast={() => undefined} receiveShadow>
    <boxGeometry args={[width, 0.2, depth]} />
    <meshStandardMaterial color={floor.roof.color} opacity={opacity} roughness={0.78} transparent={opacity < 1} />
    {active ? <Edges color="#4B4E49" threshold={18} /> : null}
  </mesh>;

  return <GableRoof active={active} baseHeight={baseHeight} centerX={centerX} centerZ={centerZ} depth={depth} floor={floor} opacity={opacity} width={width} />;
}

export function FloorStructures({ floor, rooms, active }: { floor: PlanFloor; rooms: PlanRoom[]; active: boolean }) {
  return <>
    {floor.slab.enabled ? rooms.map((room) => <RoomSlab active={active} elevation={floor.elevation} floor={floor} key={`slab:${room.id}`} room={room} />) : null}
    {floor.roof.enabled ? <FloorRoof active={active} floor={floor} rooms={rooms} /> : null}
  </>;
}
