import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { UTILITY_KINDS, utilityRouteProjection } from '../../lib/utilities';
import { useEditorStore } from '../../store/editorStore';
import type { PlanFloor, PlanUtilityRiser, PlanUtilityRoute } from '../../types';

export function UtilityRiserMesh({ riser, floorsById, routesById, active }: { riser: PlanUtilityRiser; floorsById: ReadonlyMap<string, PlanFloor>; routesById: ReadonlyMap<string, PlanUtilityRoute>; active: boolean }) {
  const selected = useEditorStore((state) => state.selection?.kind === 'utility-riser' && state.selection.id === riser.id);
  const select = useEditorStore((state) => state.select);
  const selectionToolActive = useEditorStore((state) => state.tool === 'select');
  const fromFloor = floorsById.get(riser.fromFloorId);
  const toFloor = floorsById.get(riser.toFloorId);
  if (!fromFloor || !toFloor) return null;
  const style = UTILITY_KINDS[riser.kind];
  const fromRoute = riser.fromRouteId ? routesById.get(riser.fromRouteId) : undefined;
  const toRoute = riser.toRouteId ? routesById.get(riser.toRouteId) : undefined;
  const fromY = fromFloor.elevation + (fromRoute?.elevation ?? style.defaultElevation);
  const toY = toFloor.elevation + (toRoute?.elevation ?? style.defaultElevation);
  const midpointY = (fromY + toY) / 2;
  const onClick = (event: ThreeEvent<MouseEvent>) => { if (!selectionToolActive) return; event.stopPropagation(); select({ kind: 'utility-riser', id: riser.id }); };
  const connectors = [[fromRoute, fromY], [toRoute, toY]] as const;
  return <group>
    {connectors.map(([route, y], index) => {
      if (!route) return null;
      const point = utilityRouteProjection(route, riser.x, riser.z);
      return <Line color={selected ? '#FFFFFF' : style.color} dashed dashScale={8} dashSize={0.08} gapSize={0.06} key={index}
        lineWidth={selected ? 3 : 2} onClick={onClick} opacity={active ? 0.9 : 0.38}
        points={[[riser.x, y, riser.z], [point.x, y, point.z]]} transparent />;
    })}
    <Line color={selected ? '#FFFFFF' : style.color} depthTest={!selected} lineWidth={selected ? 10 : 7} onClick={onClick}
      opacity={active ? 1 : 0.42} points={[[riser.x, fromY, riser.z], [riser.x, toY, riser.z]]} transparent={!active} />
    {[fromY, toY].map((y, index) => <group key={index} position={[riser.x, y, riser.z]}>
      <mesh onClick={onClick}><sphereGeometry args={[selected ? 0.16 : 0.12, 16, 12]} /><meshBasicMaterial color={selected ? '#FFFFFF' : style.color} depthTest={!selected} opacity={active ? 1 : 0.48} transparent={!active} /></mesh>
      {connectors[index]?.[0] ? null : <mesh onClick={onClick} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.24, 0.31, 24]} /><meshBasicMaterial color="#D8583F" depthTest={false} /></mesh>}
    </group>)}
    {selected ? <Html center position={[riser.x, midpointY, riser.z]} style={{ pointerEvents: 'none' }} zIndexRange={[44, 0]}><div className="utility-route-label"><b>Стояк</b><span>{Math.abs(toY - fromY).toFixed(2)} м · {Number(Boolean(fromRoute)) + Number(Boolean(toRoute))}/2</span></div></Html> : null}
  </group>;
}
