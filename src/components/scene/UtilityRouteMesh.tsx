import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';

import { UTILITY_KINDS, utilityLength } from '../../lib/utilities';
import type { UtilityRouteAnalysis } from '../../lib/utilityAnalysis';
import { useEditorStore } from '../../store/editorStore';
import type { PlanUtilityRoute } from '../../types';

const coneAxis = new Vector3(0, 1, 0);

export function UtilityRouteMesh({ route, analysis, floorElevation, active }: { route: PlanUtilityRoute; analysis: UtilityRouteAnalysis | undefined; floorElevation: number; active: boolean }) {
  const selected = useEditorStore((state) => state.selection?.kind === 'utility' && state.selection.id === route.id);
  const select = useEditorStore((state) => state.select);
  const selectionToolActive = useEditorStore((state) => state.tool === 'select');
  const style = UTILITY_KINDS[route.kind];
  const y = floorElevation + route.elevation;
  const midpoint: [number, number, number] = [(route.startX + route.endX) / 2, y + 0.34, (route.startZ + route.endZ) / 2];
  const flowMarker = useMemo(() => {
    if (!analysis?.flowDirection) return undefined;
    const multiplier = analysis.flowDirection === 'forward' ? 1 : -1;
    const direction = new Vector3((route.endX - route.startX) * multiplier, 0, (route.endZ - route.startZ) * multiplier).normalize();
    return { quaternion: new Quaternion().setFromUnitVectors(coneAxis, direction),
      position: [(route.startX + route.endX) / 2, y + 0.045, (route.startZ + route.endZ) / 2] as [number, number, number] };
  }, [analysis?.flowDirection, route.endX, route.endZ, route.startX, route.startZ, y]);
  const sourcePosition: [number, number, number] | undefined = route.sourceEnd === 'start'
    ? [route.startX, y, route.startZ] : route.sourceEnd === 'end' ? [route.endX, y, route.endZ] : undefined;
  const onClick = (event: ThreeEvent<MouseEvent>) => { if (!selectionToolActive) return; event.stopPropagation(); select({ kind: 'utility', id: route.id }); };
  return <group>
    <Line color={selected ? '#FFFFFF' : style.color} depthTest={!selected} lineWidth={selected ? 7 : 5} onClick={onClick}
      opacity={active ? 1 : 0.42} points={[[route.startX, y, route.startZ], [route.endX, y, route.endZ]]} transparent={!active} />
    {([[route.startX, route.startZ], [route.endX, route.endZ]] as Array<[number, number]>).map(([x, z], index) => <mesh key={index} onClick={onClick} position={[x, y, z]}>
      <sphereGeometry args={[selected ? 0.13 : 0.09, 14, 10]} /><meshBasicMaterial color={selected ? '#FFFFFF' : style.color} depthTest={!selected} opacity={active ? 1 : 0.42} transparent={!active} />
    </mesh>)}
    {flowMarker ? <mesh position={flowMarker.position} quaternion={flowMarker.quaternion}>
      <coneGeometry args={[0.12, 0.32, 3]} /><meshBasicMaterial color={selected ? '#222722' : '#FFFFFF'} depthTest={false} opacity={active ? 0.95 : 0.5} transparent />
    </mesh> : null}
    {sourcePosition ? <mesh position={sourcePosition} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.17, 0.04, 8, 20]} /><meshBasicMaterial color="#FFFFFF" depthTest={false} opacity={active ? 1 : 0.5} transparent />
    </mesh> : null}
    {selected ? <Html center position={midpoint} style={{ pointerEvents: 'none' }} zIndexRange={[42, 0]}><div className="utility-route-label"><b>{route.sourceEnd ? 'Источник' : style.shortLabel}</b><span>{utilityLength(route).toFixed(2)} м{analysis?.sourceCount === 1 ? ` · ${analysis.demand.toFixed(analysis.demand % 1 ? 1 : 0)} ${analysis.demandUnit}` : ''}</span></div></Html> : null}
  </group>;
}
