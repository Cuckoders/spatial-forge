import { useEffect, useRef, type ComponentRef } from 'react';
import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { MOUSE, TOUCH } from 'three';

import { useEditorStore } from '../../store/editorStore';
import { ModelMesh } from './ModelMesh';
import { RoomMesh } from './RoomMesh';

function CameraController() {
  const camera = useThree((state) => state.camera);
  const preset = useEditorStore((state) => state.cameraPreset);
  const revision = useEditorStore((state) => state.cameraRevision);
  const site = useEditorStore((state) => state.site);
  const tool = useEditorStore((state) => state.tool);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const distance = Math.max(site.width, site.depth) * 0.72;
    const positions = { perspective: [distance, distance * 0.72, distance] as const, top: [0, distance * 1.55, 0.01] as const, front: [0, distance * 0.5, distance * 1.35] as const };
    const [x, y, z] = positions[preset];
    camera.position.set(x, y, z); camera.lookAt(0, 1, 0); camera.updateProjectionMatrix();
    controls.current?.target.set(0, 1, 0); controls.current?.update();
  }, [camera, preset, revision, site.depth, site.width]);
  return <OrbitControls ref={controls} enableDamping enableRotate={tool === 'select'} makeDefault maxDistance={160} maxPolarAngle={Math.PI / 2.02}
    minDistance={2} minPolarAngle={0.02} mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    screenSpacePanning touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }} />;
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
  const onGroundClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    if (tool === 'rectangle' || tool === 'triangle') { event.stopPropagation(); addRoomAt(tool, event.point.x, event.point.z); }
    else select(null);
  };
  return <>
    <color attach="background" args={[projectType === 'plot' ? '#C8D4BC' : '#DDE0D8']} />
    <fog attach="fog" args={[projectType === 'plot' ? '#C8D4BC' : '#DDE0D8', 45, 130]} />
    <ambientLight intensity={1.15} />
    <directionalLight castShadow intensity={2.2} position={[14, 22, 12]} shadow-mapSize-height={2048} shadow-mapSize-width={2048} />
    <hemisphereLight groundColor={projectType === 'plot' ? '#738267' : '#8B8B82'} intensity={0.45} />
    <mesh onClick={onGroundClick} position={[0, -0.08, 0]} receiveShadow>
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
    <CameraController />
  </>;
}

export function PlannerCanvas() {
  const tool = useEditorStore((state) => state.tool);
  const select = useEditorStore((state) => state.select);
  return <div className={`canvas-shell tool-${tool}`}>
    <Canvas camera={{ fov: 42, near: 0.05, far: 500, position: [14, 11, 14] }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} onPointerMissed={() => select(null)} shadows>
      <SceneContents />
    </Canvas>
    <div className="canvas-hint"><kbd>ЛКМ</kbd> вращение · <kbd>ПКМ</kbd> панорама · <kbd>колесо</kbd> масштаб</div>
  </div>;
}
