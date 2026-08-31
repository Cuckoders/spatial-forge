import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { Grid, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { MOUSE, TOUCH, Vector3, type Camera } from 'three';

import { downloadBlob, safeDownloadName } from '../../lib/files';
import { boundsForModel, boundsForRoom, type Bounds2D } from '../../lib/snapping';
import { useEditorStore } from '../../store/editorStore';
import type { ObjectSelection } from '../../types';
import { ModelMesh } from './ModelMesh';
import { RoomMesh } from './RoomMesh';
import { SelectionTransform } from './SelectionTransform';
import { StandaloneWallMesh } from './StandaloneWallMesh';

function CameraController() {
  const camera = useThree((state) => state.camera);
  const preset = useEditorStore((state) => state.cameraPreset);
  const revision = useEditorStore((state) => state.cameraRevision);
  const site = useEditorStore((state) => state.site);
  const tool = useEditorStore((state) => state.tool);
  const activeFloorElevation = useEditorStore((state) => state.floors.find((floor) => floor.id === state.activeFloorId)?.elevation ?? 0);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const distance = Math.max(site.width, site.depth) * 0.72;
    const targetY = activeFloorElevation + 1;
    const positions = { perspective: [distance, targetY + distance * 0.72, distance] as const, top: [0, targetY + distance * 1.55, 0.01] as const, front: [0, targetY + distance * 0.5, distance * 1.35] as const };
    const [x, y, z] = positions[preset];
    camera.position.set(x, y, z); camera.lookAt(0, targetY, 0); camera.updateProjectionMatrix();
    controls.current?.target.set(0, targetY, 0); controls.current?.update();
  }, [activeFloorElevation, camera, preset, revision, site.depth, site.width]);
  return <OrbitControls ref={controls} enableDamping enableRotate={tool === 'select' && preset !== 'top'} makeDefault maxDistance={160} maxPolarAngle={Math.PI / 2.02}
    minDistance={2} minPolarAngle={0.02} mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    screenSpacePanning touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} />;
}

function CaptureController() {
  const { camera, gl, scene } = useThree();
  const revision = useEditorStore((state) => state.captureRevision);
  const projectName = useEditorStore((state) => state.projectName);
  const activeFloorName = useEditorStore((state) => state.floors.find((floor) => floor.id === state.activeFloorId)?.name ?? 'этаж');
  const notify = useEditorStore((state) => state.notify);

  useEffect(() => {
    if (revision === 0) return;
    const frame = requestAnimationFrame(() => {
      gl.render(scene, camera);
      gl.domElement.toBlob((blob) => {
        if (!blob) { notify('Не удалось создать PNG-снимок'); return; }
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        downloadBlob(blob, `${safeDownloadName(`${projectName}-${activeFloorName}`)}-${timestamp}.png`);
        notify('PNG-снимок сохранён');
      }, 'image/png');
    });
    return () => cancelAnimationFrame(frame);
  }, [activeFloorName, camera, gl, notify, projectName, revision, scene]);

  return null;
}

function DraftPolygon() {
  const tool = useEditorStore((state) => state.tool);
  const points = useEditorStore((state) => state.draftPolygon);
  const elevation = useEditorStore((state) => state.floors.find((floor) => floor.id === state.activeFloorId)?.elevation ?? 0);
  if (tool !== 'polygon' || points.length === 0) return null;
  const positions = points.map((point) => [point[0], elevation + 0.18, point[1]] as [number, number, number]);
  return <group>
    {positions.length > 1 ? <Line color="#D7EF35" lineWidth={3} points={positions} raycast={() => undefined} /> : null}
    {positions.map((point, index) => <mesh key={`${point[0]}:${point[2]}:${index}`} position={point} raycast={() => undefined}>
      <sphereGeometry args={[index === 0 ? 0.16 : 0.11, 16, 12]} />
      <meshBasicMaterial color={index === 0 ? '#202522' : '#D7EF35'} depthTest={false} />
    </mesh>)}
  </group>;
}

function DraftWall() {
  const start = useEditorStore((state) => state.draftWallStart);
  const end = useEditorStore((state) => state.draftWallEnd);
  const snap = useEditorStore((state) => state.draftWallSnap);
  const elevation = useEditorStore((state) => state.floors.find((floor) => floor.id === state.activeFloorId)?.elevation ?? 0);
  if (!start || !end) return null;
  const dx = end[0] - start[0]; const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz); const angle = Math.atan2(dz, dx);
  const midpoint = [(start[0] + end[0]) / 2, elevation + 0.22, (start[1] + end[1]) / 2] as const;
  return <group>
    <Line color="#D7EF35" lineWidth={4} points={[[start[0], elevation + 0.22, start[1]], [end[0], elevation + 0.22, end[1]]]} raycast={() => undefined} />
    <group position={midpoint} rotation={[0, -angle, 0]}>
      {length > 0 ? <mesh position={[0, 1.4, 0]} raycast={() => undefined}>
        <boxGeometry args={[length, 2.8, 0.16]} />
        <meshBasicMaterial color="#D7EF35" opacity={0.28} transparent />
      </mesh> : null}
      <Html center position={[0, 3.05, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[35, 0]}><div className="wall-measure-label">{length.toFixed(2)} м</div></Html>
    </group>
    {[start, end].map((point, index) => <mesh key={index} position={[point[0], elevation + 0.24, point[1]]} raycast={() => undefined}>
      <sphereGeometry args={[index === 1 && snap ? 0.16 : 0.12, 14, 10]} /><meshBasicMaterial color={index === 0 ? '#202522' : snap ? '#FFFFFF' : '#D7EF35'} depthTest={false} />
    </mesh>)}
    {snap ? <group position={[snap.x, elevation + 0.26, snap.z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <torusGeometry args={[0.27, 0.035, 10, 32]} /><meshBasicMaterial color="#D7EF35" depthTest={false} />
      </mesh>
      <Html center position={[0, 0.48, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[45, 0]}><div className="wall-snap-label">Соединение</div></Html>
    </group> : null}
  </group>;
}

function SnapGuides() {
  const guides = useEditorStore((state) => state.snapGuides);
  const site = useEditorStore((state) => state.site);
  const elevation = useEditorStore((state) => state.floors.find((floor) => floor.id === state.activeFloorId)?.elevation ?? 0);
  if (!guides.length) return null;
  return <group position={[0, elevation + 0.32, 0]}>{guides.map((guide) => {
    const points = guide.axis === 'x' ? [[guide.value, 0, -site.depth / 2], [guide.value, 0, site.depth / 2]]
      : [[-site.width / 2, 0, guide.value], [site.width / 2, 0, guide.value]];
    const labelPosition = guide.axis === 'x' ? [guide.value, 0, -site.depth / 2 + 0.6] : [-site.width / 2 + 0.8, 0, guide.value];
    return <group key={`${guide.axis}:${guide.value}`}>
      <Line color="#D7EF35" depthTest={false} lineWidth={2.2} points={points as [number, number, number][]} raycast={() => undefined} renderOrder={50} />
      <Html center position={labelPosition as [number, number, number]} style={{ pointerEvents: 'none' }} zIndexRange={[45, 0]}><div className="snap-guide-label">{guide.label}</div></Html>
    </group>;
  })}</group>;
}

interface SelectionDrag {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

const selectionRectangle = (bounds: Bounds2D, elevation: number, camera: Camera, canvas: HTMLCanvasElement) => {
  const canvasBounds = canvas.getBoundingClientRect();
  const projected = [
    [bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ],
  ].map(([x, z]) => {
    const point = new Vector3(x, elevation + 0.12, z).project(camera);
    return { x: canvasBounds.left + (point.x + 1) * canvasBounds.width / 2, y: canvasBounds.top + (1 - point.y) * canvasBounds.height / 2 };
  });
  return {
    minX: Math.min(...projected.map((point) => point.x)), maxX: Math.max(...projected.map((point) => point.x)),
    minY: Math.min(...projected.map((point) => point.y)), maxY: Math.max(...projected.map((point) => point.y)),
  };
};

function SceneContents({ selectionBoxRef }: { selectionBoxRef: RefObject<HTMLDivElement | null> }) {
  const { camera, gl } = useThree();
  const selectionDrag = useRef<SelectionDrag | null>(null);
  const projectType = useEditorStore((state) => state.projectType);
  const site = useEditorStore((state) => state.site);
  const floors = useEditorStore((state) => state.floors);
  const rooms = useEditorStore((state) => state.rooms);
  const walls = useEditorStore((state) => state.walls);
  const models = useEditorStore((state) => state.modelInstances);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const showAllFloors = useEditorStore((state) => state.showAllFloors);
  const tool = useEditorStore((state) => state.tool);
  const cameraPreset = useEditorStore((state) => state.cameraPreset);
  const addRoomAt = useEditorStore((state) => state.addRoomAt);
  const select = useEditorStore((state) => state.select);
  const selectObjects = useEditorStore((state) => state.selectObjects);
  const addPolygonPoint = useEditorStore((state) => state.addPolygonPoint);
  const addWallPoint = useEditorStore((state) => state.addWallPoint);
  const previewWall = useEditorStore((state) => state.previewWall);
  const completePolygon = useEditorStore((state) => state.completePolygon);
  const activeFloorElevation = floors.find((floor) => floor.id === activeFloorId)?.elevation ?? 0;

  useEffect(() => {
    const updateSelectionBox = (event: PointerEvent) => {
      const drag = selectionDrag.current; const element = selectionBoxRef.current;
      if (!drag || !element) return;
      drag.currentX = event.clientX; drag.currentY = event.clientY;
      const canvasBounds = gl.domElement.getBoundingClientRect();
      const left = Math.max(canvasBounds.left, Math.min(drag.startX, drag.currentX));
      const top = Math.max(canvasBounds.top, Math.min(drag.startY, drag.currentY));
      const right = Math.min(canvasBounds.right, Math.max(drag.startX, drag.currentX));
      const bottom = Math.min(canvasBounds.bottom, Math.max(drag.startY, drag.currentY));
      element.style.left = `${left - canvasBounds.left}px`; element.style.top = `${top - canvasBounds.top}px`;
      element.style.width = `${Math.max(0, right - left)}px`; element.style.height = `${Math.max(0, bottom - top)}px`;
    };
    const finishSelection = () => {
      const drag = selectionDrag.current; const element = selectionBoxRef.current;
      selectionDrag.current = null;
      if (element) element.hidden = true;
      if (!drag || Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY) < 8) return;
      const box = {
        minX: Math.min(drag.startX, drag.currentX), maxX: Math.max(drag.startX, drag.currentX),
        minY: Math.min(drag.startY, drag.currentY), maxY: Math.max(drag.startY, drag.currentY),
      };
      const intersects = (bounds: Bounds2D) => {
        const projected = selectionRectangle(bounds, activeFloorElevation, camera, gl.domElement);
        return projected.maxX >= box.minX && projected.minX <= box.maxX && projected.maxY >= box.minY && projected.minY <= box.maxY;
      };
      const selections: ObjectSelection[] = [
        ...rooms.filter((room) => room.floorId === activeFloorId && intersects(boundsForRoom(room))).map((room) => ({ kind: 'room' as const, id: room.id })),
        ...models.filter((model) => model.floorId === activeFloorId && intersects(boundsForModel(model))).map((model) => ({ kind: 'model' as const, id: model.id })),
      ];
      selectObjects(selections, drag.additive);
    };
    const cancelSelection = () => { selectionDrag.current = null; if (selectionBoxRef.current) selectionBoxRef.current.hidden = true; };
    window.addEventListener('pointermove', updateSelectionBox);
    window.addEventListener('pointerup', finishSelection);
    window.addEventListener('pointercancel', cancelSelection);
    return () => {
      window.removeEventListener('pointermove', updateSelectionBox);
      window.removeEventListener('pointerup', finishSelection);
      window.removeEventListener('pointercancel', cancelSelection);
    };
  }, [activeFloorElevation, activeFloorId, camera, gl, models, rooms, selectObjects, selectionBoxRef]);

  const onGroundPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (tool !== 'select' || cameraPreset !== 'top' || event.button !== 0) return;
    if (event.intersections[0]?.object !== event.object) return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    selectionDrag.current = { startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, additive: event.shiftKey };
    const element = selectionBoxRef.current;
    if (element) {
      const canvasBounds = gl.domElement.getBoundingClientRect();
      element.hidden = false; element.style.left = `${event.clientX - canvasBounds.left}px`; element.style.top = `${event.clientY - canvasBounds.top}px`;
      element.style.width = '0'; element.style.height = '0';
    }
  };
  const onGroundClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    if (tool === 'rectangle' || tool === 'triangle') { event.stopPropagation(); addRoomAt(tool, event.point.x, event.point.z); }
    else if (tool === 'polygon') { event.stopPropagation(); addPolygonPoint(event.point.x, event.point.z); }
    else if (tool === 'wall') { event.stopPropagation(); addWallPoint(event.point.x, event.point.z); }
    else if (!event.shiftKey) select(null);
  };
  const onGroundPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (tool === 'wall') previewWall(event.point.x, event.point.z);
  };
  const onGroundDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    if (tool !== 'polygon') return;
    event.stopPropagation(); completePolygon();
  };
  return <>
    <color attach="background" args={[projectType === 'plot' ? '#C8D4BC' : '#DDE0D8']} />
    <fog attach="fog" args={[projectType === 'plot' ? '#C8D4BC' : '#DDE0D8', 45, 130]} />
    <ambientLight intensity={1.15} />
    <directionalLight castShadow intensity={2.2} position={[14, 22, 12]} shadow-mapSize-height={2048} shadow-mapSize-width={2048} />
    <hemisphereLight groundColor={projectType === 'plot' ? '#738267' : '#8B8B82'} intensity={0.45} />
    <mesh onClick={onGroundClick} onDoubleClick={onGroundDoubleClick} onPointerDown={onGroundPointerDown} onPointerMove={onGroundPointerMove} position={[0, -0.08, 0]} receiveShadow>
      <boxGeometry args={[site.width, 0.15, site.depth]} />
      <meshStandardMaterial color={projectType === 'plot' ? '#899E77' : '#C6C7C0'} roughness={1} />
    </mesh>
    <mesh onPointerDown={onGroundPointerDown} position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[site.width * 4, site.depth * 4]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
    <Grid args={[site.width, site.depth]} cellColor={projectType === 'plot' ? '#607451' : '#8A8E86'} cellSize={0.5} cellThickness={0.55}
      fadeDistance={80} fadeStrength={1.2} followCamera={false} infiniteGrid={false} position={[0, 0.005, 0]}
      sectionColor={projectType === 'plot' ? '#41573B' : '#5A6259'} sectionSize={2} sectionThickness={1.1} />
    {floors.map((floor) => {
      const active = floor.id === activeFloorId;
      if (!active && !showAllFloors) return null;
      return <group key={floor.id}>
        {rooms.filter((room) => room.floorId === floor.id).map((room) => <RoomMesh key={room.id} active={active} elevation={floor.elevation} room={room} />)}
        {walls.filter((wall) => wall.floorId === floor.id).map((wall) => <StandaloneWallMesh key={wall.id} active={active} elevation={floor.elevation} wall={wall} />)}
        {models.filter((model) => model.floorId === floor.id).map((model) => <ModelMesh key={model.id} active={active} elevation={floor.elevation} model={model} />)}
      </group>;
    })}
    <DraftPolygon />
    <DraftWall />
    <SnapGuides />
    <SelectionTransform />
    <CameraController />
    <CaptureController />
  </>;
}

export function PlannerCanvas() {
  const tool = useEditorStore((state) => state.tool);
  const cameraPreset = useEditorStore((state) => state.cameraPreset);
  const select = useEditorStore((state) => state.select);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  return <div className={`canvas-shell tool-${tool} camera-${cameraPreset}`}>
    <Canvas camera={{ fov: 42, near: 0.05, far: 500, position: [14, 11, 14] }} dpr={[1, 2]} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }} onPointerMissed={(event) => { if (!event.shiftKey) select(null); }} shadows>
      <SceneContents selectionBoxRef={selectionBoxRef} />
    </Canvas>
    <div aria-hidden="true" className="selection-box" hidden ref={selectionBoxRef} />
    <div className="canvas-hint">{tool === 'wall' ? <><kbd>ЛКМ</kbd> начало / конец стены · <kbd>Esc</kbd> отмена</>
      : cameraPreset === 'top' ? <><kbd>ЛКМ</kbd> рамка · <kbd>Shift</kbd> добавить · <kbd>W/E/S</kbd> манипулятор</>
        : <><kbd>ЛКМ</kbd> камера · <kbd>W/E/S</kbd> перемещение / вращение / масштаб · <kbd>колесо</kbd> зум</>}</div>
  </div>;
}
