import { Component, Suspense, type ReactNode } from 'react';
import { Clone, Edges, useGLTF } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';

import { useEditorStore } from '../../store/editorStore';
import type { BuiltInModelKind, ModelInstance } from '../../types';

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <mesh castShadow position={[0, 0.5, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#D9534F" /><Edges color="#FFFFFF" /></mesh>;
    return this.props.children;
  }
}

function BuiltInModel({ kind, selected }: { kind: BuiltInModelKind; selected: boolean }) {
  if (kind === 'sofa') return <group>
    <mesh castShadow position={[0, 0.35, 0]}><boxGeometry args={[2.2, 0.55, 0.85]} /><meshStandardMaterial color="#728578" roughness={0.9} />{selected ? <Edges color="#E8FF57" /> : null}</mesh>
    <mesh castShadow position={[0, 0.85, 0.35]}><boxGeometry args={[2.2, 0.75, 0.22]} /><meshStandardMaterial color="#5E7266" roughness={0.9} /></mesh>
    <mesh castShadow position={[-1.02, 0.68, 0]}><boxGeometry args={[0.2, 0.7, 0.9]} /><meshStandardMaterial color="#5E7266" /></mesh>
    <mesh castShadow position={[1.02, 0.68, 0]}><boxGeometry args={[0.2, 0.7, 0.9]} /><meshStandardMaterial color="#5E7266" /></mesh>
  </group>;
  if (kind === 'table') return <group>
    <mesh castShadow position={[0, 0.78, 0]}><boxGeometry args={[1.8, 0.12, 1.05]} /><meshStandardMaterial color="#9A7654" />{selected ? <Edges color="#E8FF57" /> : null}</mesh>
    {[[-0.72, 0.38, -0.35], [0.72, 0.38, -0.35], [-0.72, 0.38, 0.35], [0.72, 0.38, 0.35]].map((position, index) => <mesh key={index} castShadow position={position as [number, number, number]}><boxGeometry args={[0.12, 0.76, 0.12]} /><meshStandardMaterial color="#71543B" /></mesh>)}
  </group>;
  if (kind === 'bed') return <group>
    <mesh castShadow position={[0, 0.34, 0]}><boxGeometry args={[1.8, 0.42, 2.2]} /><meshStandardMaterial color="#D9D1C4" />{selected ? <Edges color="#E8FF57" /> : null}</mesh>
    <mesh castShadow position={[0, 0.62, 0.78]}><boxGeometry args={[1.65, 0.18, 0.48]} /><meshStandardMaterial color="#F0ECE4" /></mesh>
    <mesh castShadow position={[0, 0.72, 1.08]}><boxGeometry args={[1.9, 1.25, 0.12]} /><meshStandardMaterial color="#816D5B" /></mesh>
  </group>;
  if (kind === 'stairs') return <group>
    {Array.from({ length: 11 }, (_, index) => <mesh castShadow key={index} position={[0, 0.12 + index * 0.13, -1.5 + index * 0.28]} receiveShadow>
      <boxGeometry args={[1.15, 0.24 + index * 0.26, 0.32]} />
      <meshStandardMaterial color={index % 2 ? '#9A7654' : '#AA8560'} roughness={0.86} />
      {selected && index === 5 ? <Edges color="#E8FF57" /> : null}
    </mesh>)}
    <mesh castShadow position={[-0.62, 1.55, 0]} rotation={[Math.PI / 2.22, 0, 0]}><cylinderGeometry args={[0.035, 0.035, 3.8, 8]} /><meshStandardMaterial color="#4F5952" /></mesh>
    <mesh castShadow position={[0.62, 1.55, 0]} rotation={[Math.PI / 2.22, 0, 0]}><cylinderGeometry args={[0.035, 0.035, 3.8, 8]} /><meshStandardMaterial color="#4F5952" /></mesh>
  </group>;
  return <group>
    <mesh castShadow position={[0, 1.1, 0]}><cylinderGeometry args={[0.18, 0.28, 2.2, 12]} /><meshStandardMaterial color="#755638" />{selected ? <Edges color="#E8FF57" /> : null}</mesh>
    <mesh castShadow position={[0, 2.45, 0]}><dodecahedronGeometry args={[1.35, 0]} /><meshStandardMaterial color="#57765D" roughness={1} /></mesh>
  </group>;
}

function UploadedModel({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <Clone castShadow object={gltf.scene} receiveShadow />;
}

export function ModelMesh({ model, elevation, active }: { model: ModelInstance; elevation: number; active: boolean }) {
  const selection = useEditorStore((state) => state.selection);
  const assetUrl = useEditorStore((state) => state.modelAssets.find((asset) => asset.id === model.assetId)?.url);
  const select = useEditorStore((state) => state.select);
  const selectionToolActive = useEditorStore((state) => state.tool === 'select');
  const selected = selection?.kind === 'model' && selection.id === model.id
    || selection?.kind === 'group' && selection.items.some((item) => item.kind === 'model' && item.id === model.id);
  const choose = (event: ThreeEvent<MouseEvent>) => {
    if (!active || !selectionToolActive || event.delta > 4) return;
    event.stopPropagation(); select({ kind: 'model', id: model.id }, event.shiftKey);
  };
  const builtIn = model.assetId.startsWith('builtin:') ? model.assetId.slice(8) as BuiltInModelKind : undefined;
  return <group onClick={choose} position={[model.x, elevation + model.y + 0.12, model.z]} rotation={[0, -model.rotation, 0]} scale={model.scale} visible={active}>
    {builtIn ? <BuiltInModel kind={builtIn} selected={selected} /> : assetUrl
      ? <ModelErrorBoundary><Suspense fallback={<mesh position={[0, 0.5, 0]}><boxGeometry args={[0.8, 1, 0.8]} /><meshStandardMaterial color="#A4AD9A" wireframe /></mesh>}><UploadedModel url={assetUrl} /></Suspense></ModelErrorBoundary>
      : null}
    {selected ? <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.7, 0.78, 48]} /><meshBasicMaterial color="#E8FF57" /></mesh> : null}
  </group>;
}
