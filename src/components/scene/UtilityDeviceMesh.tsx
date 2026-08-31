import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { UTILITY_DEVICE_KINDS } from '../../lib/utilities';
import { useEditorStore } from '../../store/editorStore';
import type { PlanUtilityDevice } from '../../types';

function DeviceSymbol({ device, color }: { device: PlanUtilityDevice; color: string }) {
  if (device.kind === 'radiator') return <group>
    <mesh><boxGeometry args={[0.62, 0.42, 0.12]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
    {[-0.21, -0.07, 0.07, 0.21].map((x) => <mesh key={x} position={[x, 0, 0.065]}><boxGeometry args={[0.035, 0.3, 0.025]} /><meshBasicMaterial color="#F6D1C8" /></mesh>)}
  </group>;
  if (device.kind === 'panel') return <group>
    <mesh><boxGeometry args={[0.44, 0.58, 0.14]} /><meshStandardMaterial color={color} roughness={0.65} /></mesh>
    <mesh position={[0, 0.09, 0.076]}><boxGeometry args={[0.26, 0.05, 0.018]} /><meshBasicMaterial color="#453B19" /></mesh>
    <mesh position={[0, -0.08, 0.076]}><boxGeometry args={[0.26, 0.05, 0.018]} /><meshBasicMaterial color="#453B19" /></mesh>
  </group>;
  if (device.kind === 'drain') return <group rotation={[Math.PI / 2, 0, 0]}>
    <mesh><cylinderGeometry args={[0.23, 0.23, 0.08, 20]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
    <mesh position={[0, 0.045, 0]}><torusGeometry args={[0.13, 0.025, 8, 20]} /><meshBasicMaterial color="#DCE9ED" /></mesh>
  </group>;
  if (device.kind === 'waterPoint') return <group rotation={[Math.PI / 2, 0, 0]}>
    <mesh><cylinderGeometry args={[0.19, 0.19, 0.14, 20]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
    <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.07, 0.07, 0.04, 16]} /><meshBasicMaterial color="#D9F0FF" /></mesh>
  </group>;
  return <group>
    <mesh><boxGeometry args={[0.38, 0.38, 0.12]} /><meshStandardMaterial color={color} roughness={0.65} /></mesh>
    {device.kind === 'outlet' ? <>{[-0.07, 0.07].map((x) => <mesh key={x} position={[x, 0, 0.065]}><cylinderGeometry args={[0.028, 0.028, 0.025, 12]} /><meshBasicMaterial color="#3C3B30" /></mesh>)}</>
      : <mesh position={[0, 0, 0.07]} rotation={[0, 0, -0.32]}><boxGeometry args={[0.08, 0.24, 0.035]} /><meshBasicMaterial color="#FFF4B8" /></mesh>}
  </group>;
}

export function UtilityDeviceMesh({ device, floorElevation, active }: { device: PlanUtilityDevice; floorElevation: number; active: boolean }) {
  const selected = useEditorStore((state) => state.selection?.kind === 'utility-device' && state.selection.id === device.id);
  const select = useEditorStore((state) => state.select);
  const selectionToolActive = useEditorStore((state) => state.tool === 'select');
  const style = UTILITY_DEVICE_KINDS[device.kind];
  const y = floorElevation + device.elevation + (device.kind === 'radiator' || device.kind === 'panel' ? 0.22 : 0.08);
  const onClick = (event: ThreeEvent<MouseEvent>) => { if (!selectionToolActive) return; event.stopPropagation(); select({ kind: 'utility-device', id: device.id }); };
  return <group onClick={onClick} position={[device.x, y, device.z]} rotation={[0, device.rotation, 0]} scale={active ? 1 : 0.9}>
    {selected ? <mesh position={[0, -y + floorElevation + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.34, 0.43, 28]} /><meshBasicMaterial color="#FFFFFF" depthTest={false} /></mesh> : null}
    <DeviceSymbol color={selected ? '#FFFFFF' : style.color} device={device} />
    {selected ? <Html center position={[0, 0.54, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[43, 0]}><div className="utility-route-label"><b>{style.shortLabel}</b><span>{device.rating} {style.ratingUnit}</span></div></Html> : null}
  </group>;
}
