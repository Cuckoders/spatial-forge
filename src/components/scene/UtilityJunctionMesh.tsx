import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';

import { UTILITY_KINDS, utilityRouteProjection } from '../../lib/utilities';
import { useEditorStore } from '../../store/editorStore';
import type { PlanUtilityJunction, PlanUtilityRoute } from '../../types';

export function UtilityJunctionMesh({ junction, floorElevation, routesById, active }: { junction: PlanUtilityJunction; floorElevation: number; routesById: ReadonlyMap<string, PlanUtilityRoute>; active: boolean }) {
  const selected = useEditorStore((state) => state.selection?.kind === 'utility-junction' && state.selection.id === junction.id);
  const select = useEditorStore((state) => state.select);
  const selectionToolActive = useEditorStore((state) => state.tool === 'select');
  const style = UTILITY_KINDS[junction.kind];
  const y = floorElevation + junction.elevation;
  const routes = junction.routeIds.flatMap((id) => routesById.get(id) ?? []);
  const onClick = (event: ThreeEvent<MouseEvent>) => { if (!selectionToolActive) return; event.stopPropagation(); select({ kind: 'utility-junction', id: junction.id }); };
  return <group>
    {routes.map((route) => {
      const point = utilityRouteProjection(route, junction.x, junction.z);
      if (point.distance < 0.02) return null;
      return <Line color={selected ? '#FFFFFF' : style.color} dashed dashScale={8} dashSize={0.08} gapSize={0.06} key={route.id}
        lineWidth={selected ? 3 : 2} onClick={onClick} opacity={active ? 0.92 : 0.38}
        points={[[junction.x, y, junction.z], [point.x, floorElevation + route.elevation, point.z]]} transparent />;
    })}
    <mesh onClick={onClick} position={[junction.x, y, junction.z]}>
      <sphereGeometry args={[selected ? 0.22 : 0.17, 20, 14]} />
      <meshStandardMaterial color={selected ? '#FFFFFF' : style.color} emissive={style.color} emissiveIntensity={selected ? 0.8 : 0.28} opacity={active ? 1 : 0.45} transparent={!active} />
    </mesh>
    {routes.length < 2 ? <mesh onClick={onClick} position={[junction.x, y, junction.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.27, 0.35, 28]} /><meshBasicMaterial color="#D8583F" depthTest={false} />
    </mesh> : null}
    {selected ? <Html center position={[junction.x, y + 0.42, junction.z]} style={{ pointerEvents: 'none' }} zIndexRange={[44, 0]}>
      <div className="utility-route-label"><b>Узел сети</b><span>{routes.length} {routes.length === 1 ? 'трасса' : routes.length >= 2 && routes.length <= 4 ? 'трассы' : 'трасс'}</span></div>
    </Html> : null}
  </group>;
}
