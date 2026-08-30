import { Suspense, useEffect, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import { type ThreeEvent, useLoader } from '@react-three/fiber';
import { Color, DoubleSide, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader } from 'three';

import { roomVertices, wallId } from '../../lib/geometry';
import { useEditorStore } from '../../store/editorStore';
import type { PlanRoom } from '../../types';

interface RoomMeshProps {
  room: PlanRoom;
  elevation: number;
  active: boolean;
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

function Wall({ room, wallIndex, start, end, active, selected }: { room: PlanRoom; wallIndex: number; start: readonly [number, number]; end: readonly [number, number]; active: boolean; selected: boolean }) {
  const finish = useEditorStore((state) => state.wallFinishes[wallId(room.id, wallIndex)]);
  const textureUrl = useEditorStore((state) => finish?.textureId ? state.textures.find((texture) => texture.id === finish.textureId)?.url : undefined);
  const select = useEditorStore((state) => state.select);
  const dx = end[0] - start[0]; const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz); const angle = Math.atan2(dz, dx);
  const opacity = active ? 1 : 0.15; const color = finish?.color ?? '#E9E4DA';
  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    event.stopPropagation(); select({ kind: 'wall', id: wallId(room.id, wallIndex), roomId: room.id, wallIndex });
  };
  return (
    <group position={[(start[0] + end[0]) / 2, room.wallHeight / 2 + 0.12, (start[1] + end[1]) / 2]} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow onClick={choose}>
        <boxGeometry args={[length, room.wallHeight, room.wallThickness]} />
        {textureUrl ? <Suspense fallback={<meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />}><TexturedWallMaterial color={color} height={room.wallHeight} length={length} opacity={opacity} url={textureUrl} /></Suspense>
          : <meshStandardMaterial color={color} roughness={0.84} transparent={opacity < 1} opacity={opacity} />}
        {selected ? <Edges color="#E8FF57" threshold={10} /> : null}
      </mesh>
    </group>
  );
}

function TriangleFloor({ room, active, selected, onClick }: { room: PlanRoom; active: boolean; selected: boolean; onClick: (event: ThreeEvent<MouseEvent>) => void }) {
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
  const select = useEditorStore((state) => state.select);
  const vertices = roomVertices(room);
  const roomSelected = selection?.kind === 'room' && selection.id === room.id;
  const chooseRoom = (event: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    event.stopPropagation(); select({ kind: 'room', id: room.id });
  };
  return (
    <group position={[room.x, elevation, room.z]} rotation={[0, -room.rotation, 0]}>
      {room.shape === 'triangle'
        ? <TriangleFloor active={active} onClick={chooseRoom} room={room} selected={roomSelected} />
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
    </group>
  );
}
