import { useEffect, useRef, type ComponentRef } from 'react';
import { Grid, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { MOUSE, TOUCH } from 'three';

import { downloadBlob, safeDownloadName } from '../../lib/files';
import { useEditorStore } from '../../store/editorStore';
import { ModelMesh } from './ModelMesh';
import { RoomMesh } from './RoomMesh';
import { SelectionTransform } from './SelectionTransform';

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
  return <OrbitControls ref={controls} enableDamping enableRotate={tool === 'select'} makeDefault maxDistance={160} maxPolarAngle={Math.PI / 2.02}
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

function SceneContents() {
  const projectType = useEditorStore((state) => state.projectType);
  const site = useEditorStore((state) => state.site);
  const floors = useEditorStore((state) => state.floors);
  const rooms = useEditorStore((state) => state.rooms);
  const models = useEditorStore((state) => state.modelInstances);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const showAllFloors = useEditorStore((state) => state.showAllFloors);
  const tool = useEditorStore((state) => state.tool);
  const addRoomAt = useEditorStore((state) => state.addRoomAt);
  const select = useEditorStore((state) => state.select);
  const addPolygonPoint = useEditorStore((state) => state.addPolygonPoint);
  const completePolygon = useEditorStore((state) => state.completePolygon);
  const onGroundClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    if (tool === 'rectangle' || tool === 'triangle') { event.stopPropagation(); addRoomAt(tool, event.point.x, event.point.z); }
    else if (tool === 'polygon') { event.stopPropagation(); addPolygonPoint(event.point.x, event.point.z); }
    else if (!event.shiftKey) select(null);
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
    <mesh onClick={onGroundClick} onDoubleClick={onGroundDoubleClick} position={[0, -0.08, 0]} receiveShadow>
      <boxGeometry args={[site.width, 0.15, site.depth]} />
      <meshStandardMaterial color={projectType === 'plot' ? '#899E77' : '#C6C7C0'} roughness={1} />
    </mesh>
    <Grid args={[site.width, site.depth]} cellColor={projectType === 'plot' ? '#607451' : '#8A8E86'} cellSize={0.5} cellThickness={0.55}
      fadeDistance={80} fadeStrength={1.2} followCamera={false} infiniteGrid={false} position={[0, 0.005, 0]}
      sectionColor={projectType === 'plot' ? '#41573B' : '#5A6259'} sectionSize={2} sectionThickness={1.1} />
    {floors.map((floor) => {
      const active = floor.id === activeFloorId;
      if (!active && !showAllFloors) return null;
      return <group key={floor.id}>
        {rooms.filter((room) => room.floorId === floor.id).map((room) => <RoomMesh key={room.id} active={active} elevation={floor.elevation} room={room} />)}
        {models.filter((model) => model.floorId === floor.id).map((model) => <ModelMesh key={model.id} active={active} elevation={floor.elevation} model={model} />)}
      </group>;
    })}
    <DraftPolygon />
    <SnapGuides />
    <SelectionTransform />
    <CameraController />
    <CaptureController />
  </>;
}

export function PlannerCanvas() {
  const tool = useEditorStore((state) => state.tool);
  const select = useEditorStore((state) => state.select);
  return <div className={`canvas-shell tool-${tool}`}>
    <Canvas camera={{ fov: 42, near: 0.05, far: 500, position: [14, 11, 14] }} dpr={[1, 2]} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }} onPointerMissed={(event) => { if (!event.shiftKey) select(null); }} shadows>
      <SceneContents />
    </Canvas>
    <div className="canvas-hint"><kbd>ЛКМ</kbd> вращение · <kbd>стрелки</kbd> перемещение · жёлтые линии умная привязка · <kbd>колесо</kbd> масштаб</div>
  </div>;
}
