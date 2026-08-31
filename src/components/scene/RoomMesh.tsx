import { Suspense, useEffect, useMemo } from 'react';
import { Edges, Html } from '@react-three/drei';
import { type ThreeEvent, useLoader } from '@react-three/fiber';
import { Color, DoubleSide, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader } from 'three';

import { roomArea, roomVertices, wallId } from '../../lib/geometry';
import { useEditorStore } from '../../store/editorStore';
import type { PlanRoom, WallOpening } from '../../types';

interface RoomMeshProps {
  room: PlanRoom;
  elevation: number;
  active: boolean;
}

function RoomMeasurements({ room, vertices }: { room: PlanRoom; vertices: ReadonlyArray<readonly [number, number]> }) {
  const signedArea = vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return next ? sum + point[0] * next[1] - next[0] * point[1] : sum;
  }, 0);
  return <group position={[0, 0.24, 0]}>
    <Html center distanceFactor={11} position={[0, 0.06, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[30, 0]}>
      <div className="room-measure-label"><b>{room.name}</b><span>{roomArea(room).toFixed(1)} м²</span></div>
    </Html>
    {vertices.map((start, index) => {
      const end = vertices[(index + 1) % vertices.length]; if (!end) return null;
      const dx = end[0] - start[0]; const dz = end[1] - start[1]; const length = Math.hypot(dx, dz);
      const direction = signedArea >= 0 ? 1 : -1;
      const offsetX = direction * dz / length * 0.42; const offsetZ = direction * -dx / length * 0.42;
      return <Html center distanceFactor={10} key={`measure-${room.id}-${index}`} position={[(start[0] + end[0]) / 2 + offsetX, 0, (start[1] + end[1]) / 2 + offsetZ]} style={{ pointerEvents: 'none' }} zIndexRange={[25, 0]}>
        <div className="wall-measure-label">{length.toFixed(2)} м</div>
      </Html>;
    })}
  </group>;
}

function TexturedWallMaterial({ url, color, length, height, opacity }: { url: string; color: string; length: number; height: number; opacity: number }) {
  const source = useLoader(TextureLoader, url);
  const texture = useMemo(() => {
    const value = source.clone();
    value.wrapS = RepeatWrapping; value.wrapT = RepeatWrapping;
    value.repeat.set(Math.max(1, length / 1.4), Math.max(1, height / 1.4));
    value.colorSpace = SRGBColorSpace; value.needsUpdate = true;
    return value;
  }, [height, length, source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <meshStandardMaterial color={new Color(color)} map={texture} roughness={0.82} transparent={opacity < 1} opacity={opacity} />;
}

function WallSegment({ width, height, x, y, thickness, textureUrl, color, opacity, selected }: { width: number; height: number; x: number; y: number; thickness: number; textureUrl: string | undefined; color: string; opacity: number; selected: boolean }) {
  if (width <= 0.015 || height <= 0.015) return null;
  return <mesh castShadow position={[x, y, 0]} receiveShadow>
    <boxGeometry args={[width, height, thickness]} />
    {textureUrl ? <Suspense fallback={<meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />}><TexturedWallMaterial color={color} height={height} length={width} opacity={opacity} url={textureUrl} /></Suspense>
      : <meshStandardMaterial color={color} roughness={0.84} transparent={opacity < 1} opacity={opacity} />}
    {selected ? <Edges color="#E8FF57" threshold={10} /> : null}
  </mesh>;
}

function OpeningDecoration({ opening, center, thickness, active }: { opening: WallOpening; center: number; thickness: number; active: boolean }) {
  const opacity = active ? 1 : 0.16;
  const frame = Math.min(0.08, opening.width * 0.08);
  if (opening.kind === 'door') return <group position={[center - opening.width / 2 + frame, 0, 0]}>
    <mesh castShadow position={[0, opening.height / 2, 0]}><boxGeometry args={[frame * 2, opening.height, thickness + 0.055]} /><meshStandardMaterial color="#6E513B" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width - frame * 2, opening.height / 2, 0]}><boxGeometry args={[frame * 2, opening.height, thickness + 0.055]} /><meshStandardMaterial color="#6E513B" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width / 2 - frame, opening.height - frame, 0]}><boxGeometry args={[opening.width, frame * 2, thickness + 0.055]} /><meshStandardMaterial color="#6E513B" opacity={opacity} transparent={opacity < 1} /></mesh>
    <group rotation={[0, -0.58, 0]}>
      <mesh castShadow position={[(opening.width - frame * 3) / 2, opening.height / 2 - frame, 0]}>
        <boxGeometry args={[opening.width - frame * 3, opening.height - frame * 3, 0.055]} />
        <meshStandardMaterial color="#9B7655" opacity={opacity} roughness={0.78} transparent={opacity < 1} />
      </mesh>
    </group>
  </group>;
  const middleY = opening.sillHeight + opening.height / 2;
  return <group position={[center, middleY, 0]}>
    <mesh position={[0, 0, 0]}><boxGeometry args={[opening.width - frame * 2, opening.height - frame * 2, 0.025]} /><meshPhysicalMaterial color="#A8D3DC" opacity={active ? 0.38 : 0.1} roughness={0.05} transparent transmission={0.25} /></mesh>
    <mesh castShadow position={[-opening.width / 2 + frame / 2, 0, 0]}><boxGeometry args={[frame, opening.height, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[opening.width / 2 - frame / 2, 0, 0]}><boxGeometry args={[frame, opening.height, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[0, -opening.height / 2 + frame / 2, 0]}><boxGeometry args={[opening.width, frame, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh castShadow position={[0, opening.height / 2 - frame / 2, 0]}><boxGeometry args={[opening.width, frame, thickness + 0.045]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
    <mesh position={[0, 0, 0.01]}><boxGeometry args={[frame * 0.72, opening.height - frame * 2, thickness + 0.05]} /><meshStandardMaterial color="#EEECE5" opacity={opacity} transparent={opacity < 1} /></mesh>
  </group>;
}

function Wall({ room, wallIndex, start, end, active, selected }: { room: PlanRoom; wallIndex: number; start: readonly [number, number]; end: readonly [number, number]; active: boolean; selected: boolean }) {
  const finish = useEditorStore((state) => state.wallFinishes[wallId(room.id, wallIndex)]);
  const textureUrl = useEditorStore((state) => finish?.textureId ? state.textures.find((texture) => texture.id === finish.textureId)?.url : undefined);
  const opening = useEditorStore((state) => state.openings.find((item) => item.roomId === room.id && item.wallIndex === wallIndex));
  const select = useEditorStore((state) => state.select);
  const dx = end[0] - start[0]; const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz); const angle = Math.atan2(dz, dx);
  const opacity = active ? 1 : 0.15; const color = finish?.color ?? '#E9E4DA';
  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    event.stopPropagation(); select({ kind: 'wall', id: wallId(room.id, wallIndex), roomId: room.id, wallIndex });
  };
  if (!opening) return <group onClick={choose} position={[(start[0] + end[0]) / 2, 0.12, (start[1] + end[1]) / 2]} rotation={[0, -angle, 0]}>
    <WallSegment color={color} height={room.wallHeight} opacity={opacity} selected={selected} textureUrl={textureUrl} thickness={room.wallThickness} width={length} x={0} y={room.wallHeight / 2} />
  </group>;
  const openingWidth = Math.min(opening.width, Math.max(0.2, length - 0.08));
  const center = Math.min(length / 2 - openingWidth / 2, Math.max(-length / 2 + openingWidth / 2, -length / 2 + opening.offset * length));
  const sill = Math.min(opening.sillHeight, Math.max(0, room.wallHeight - 0.3));
  const openingHeight = Math.min(opening.height, Math.max(0.3, room.wallHeight - sill - 0.03));
  const leftWidth = center - openingWidth / 2 + length / 2;
  const rightWidth = length / 2 - center - openingWidth / 2;
  const topHeight = room.wallHeight - sill - openingHeight;
  return <group onClick={choose} position={[(start[0] + end[0]) / 2, 0.12, (start[1] + end[1]) / 2]} rotation={[0, -angle, 0]}>
    <WallSegment color={color} height={room.wallHeight} opacity={opacity} selected={selected} textureUrl={textureUrl} thickness={room.wallThickness} width={leftWidth} x={-length / 2 + leftWidth / 2} y={room.wallHeight / 2} />
    <WallSegment color={color} height={room.wallHeight} opacity={opacity} selected={selected} textureUrl={textureUrl} thickness={room.wallThickness} width={rightWidth} x={length / 2 - rightWidth / 2} y={room.wallHeight / 2} />
    <WallSegment color={color} height={sill} opacity={opacity} selected={selected} textureUrl={textureUrl} thickness={room.wallThickness} width={openingWidth} x={center} y={sill / 2} />
    <WallSegment color={color} height={topHeight} opacity={opacity} selected={selected} textureUrl={textureUrl} thickness={room.wallThickness} width={openingWidth} x={center} y={sill + openingHeight + topHeight / 2} />
    <OpeningDecoration active={active} center={center} opening={{ ...opening, width: openingWidth, height: openingHeight, sillHeight: sill }} thickness={room.wallThickness} />
  </group>;
}

function ShapedFloor({ room, active, selected, onClick }: { room: PlanRoom; active: boolean; selected: boolean; onClick: (event: ThreeEvent<MouseEvent>) => void }) {
  const geometry = useMemo(() => {
    const vertices = roomVertices(room); const first = vertices[0];
    const shape = new Shape();
    if (first) { shape.moveTo(first[0], first[1]); for (const point of vertices.slice(1)) shape.lineTo(point[0], point[1]); shape.closePath(); }
    const value = new ShapeGeometry(shape); value.rotateX(-Math.PI / 2); return value;
  }, [room]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} onClick={onClick} position={[0, 0.1, 0]} receiveShadow>
    <meshStandardMaterial color={room.floorColor} opacity={active ? 1 : 0.15} transparent={!active} roughness={0.92} side={DoubleSide} />
    {selected ? <Edges color="#E8FF57" /> : null}
  </mesh>;
}

export function RoomMesh({ room, elevation, active }: RoomMeshProps) {
  const selection = useEditorStore((state) => state.selection);
  const showDimensions = useEditorStore((state) => state.showDimensions);
  const select = useEditorStore((state) => state.select);
  const vertices = roomVertices(room);
  const roomSelected = selection?.kind === 'room' && selection.id === room.id;
  const chooseRoom = (event: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    event.stopPropagation(); select({ kind: 'room', id: room.id });
  };
  return (
    <group position={[room.x, elevation, room.z]} rotation={[0, -room.rotation, 0]}>
      {room.shape !== 'rectangle'
        ? <ShapedFloor active={active} onClick={chooseRoom} room={room} selected={roomSelected} />
        : <mesh onClick={chooseRoom} position={[0, 0.06, 0]} receiveShadow>
          <boxGeometry args={[room.width, 0.12, room.depth]} />
          <meshStandardMaterial color={room.floorColor} opacity={active ? 1 : 0.15} transparent={!active} roughness={0.92} />
          {roomSelected ? <Edges color="#E8FF57" /> : null}
        </mesh>}
      {vertices.map((start, index) => {
        const end = vertices[(index + 1) % vertices.length];
        if (!end) return null;
        return <Wall key={wallId(room.id, index)} active={active} end={end} room={room} selected={selection?.kind === 'wall' && selection.roomId === room.id && selection.wallIndex === index} start={start} wallIndex={index} />;
      })}
      {active && showDimensions ? <RoomMeasurements room={room} vertices={vertices} /> : null}
    </group>
  );
}
