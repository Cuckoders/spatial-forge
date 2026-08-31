import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { UTILITY_KINDS, utilityLength } from '../../lib/utilities';
import { useEditorStore } from '../../store/editorStore';
import type { PlanUtilityRoute } from '../../types';

export function UtilityRouteMesh({ route, floorElevation, active }: { route: PlanUtilityRoute; floorElevation: number; active: boolean }) {
  const selected = useEditorStore((state) => state.selection?.kind === 'utility' && state.selection.id === route.id);
  const select = useEditorStore((state) => state.select);
  const selectionToolActive = useEditorStore((state) => state.tool === 'select');
  const style = UTILITY_KINDS[route.kind];
  const y = floorElevation + route.elevation;
  const midpoint: [number, number, number] = [(route.startX + route.endX) / 2, y + 0.34, (route.startZ + route.endZ) / 2];
  const onClick = (event: ThreeEvent<MouseEvent>) => { if (!selectionToolActive) return; event.stopPropagation(); select({ kind: 'utility', id: route.id }); };
  return <group>
    <Line color={selected ? '#FFFFFF' : style.color} depthTest={!selected} lineWidth={selected ? 7 : 5} onClick={onClick}
      opacity={active ? 1 : 0.42} points={[[route.startX, y, route.startZ], [route.endX, y, route.endZ]]} transparent={!active} />
    {([[route.startX, route.startZ], [route.endX, route.endZ]] as Array<[number, number]>).map(([x, z], index) => <mesh key={index} onClick={onClick} position={[x, y, z]}>
      <sphereGeometry args={[selected ? 0.13 : 0.09, 14, 10]} /><meshBasicMaterial color={selected ? '#FFFFFF' : style.color} depthTest={!selected} opacity={active ? 1 : 0.42} transparent={!active} />
    </mesh>)}
    {selected ? <Html center position={midpoint} style={{ pointerEvents: 'none' }} zIndexRange={[42, 0]}><div className="utility-route-label"><b>{style.shortLabel}</b><span>{utilityLength(route).toFixed(2)} м</span></div></Html> : null}
  </group>;
}
