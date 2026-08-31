import { UTILITY_KINDS } from './utilities';
import type { PlanUtilityDevice, PlanUtilityJunction, PlanUtilityRiser, PlanUtilityRoute, UtilityKind } from '../types';

type FlowDirection = 'forward' | 'reverse';
type ConnectionPoint = { x: number; z: number };

export interface UtilityRouteAnalysis {
  routeId: string;
  networkId: string;
  kind: UtilityKind;
  demand: number;
  networkDemand: number;
  demandUnit: string;
  connectedDeviceCount: number;
  networkDeviceCount: number;
  networkRouteCount: number;
  recommendedDiameter: number;
  undersized: boolean;
  sourceRouteId: string | undefined;
  sourceCount: number;
  flowDirection: FlowDirection | undefined;
}

export interface UtilityAnalysisInput {
  routes: PlanUtilityRoute[];
  devices: PlanUtilityDevice[];
  risers: PlanUtilityRiser[];
  junctions: PlanUtilityJunction[];
}

interface UtilityGraph {
  routesById: Map<string, PlanUtilityRoute>;
  adjacency: Map<string, Map<string, ConnectionPoint>>;
}

function deviceDemand(device: PlanUtilityDevice) {
  if (device.kind === 'outlet') return device.rating;
  if (device.kind === 'switch') return device.rating * 0.23;
  if (device.kind === 'radiator') return device.rating;
  if (device.kind === 'waterPoint') return 1;
  if (device.kind === 'drain') return 1.5;
  return 0;
}

function recommendedDiameter(kind: UtilityKind, demand: number, devices: PlanUtilityDevice[]) {
  if (kind === 'electric') {
    if (demand <= 3.5) return 0.016;
    if (demand <= 7) return 0.02;
    if (demand <= 12) return 0.025;
    if (demand <= 20) return 0.032;
    return 0.04;
  }
  if (kind === 'heating') {
    if (demand <= 3) return 0.016;
    if (demand <= 6) return 0.02;
    if (demand <= 12) return 0.025;
    if (demand <= 20) return 0.032;
    return 0.04;
  }
  const fixtureDiameter = demand <= 1 ? 0.02 : demand <= 3 ? 0.025 : demand <= 6 ? 0.032 : demand <= 10 ? 0.04 : 0.05;
  const largestOutlet = devices.reduce((maximum, device) => Math.max(maximum, device.rating / 1000), 0);
  return Math.max(fixtureDiameter, largestOutlet);
}

function demandUnit(kind: UtilityKind) { return kind === 'water' ? 'усл. точек' : 'кВт'; }

function buildUtilityGraph(input: UtilityAnalysisInput): UtilityGraph {
  const routesById = new Map(input.routes.map((route) => [route.id, route]));
  const adjacency = new Map(input.routes.map((route) => [route.id, new Map<string, ConnectionPoint>()]));
  const connect = (routeIds: Array<string | undefined>, point: ConnectionPoint) => {
    const valid = routeIds.flatMap((id) => id && routesById.has(id) ? [id] : []);
    const first = valid[0]; if (!first) return;
    const kind = routesById.get(first)?.kind;
    for (const id of valid.slice(1)) {
      if (routesById.get(id)?.kind !== kind) continue;
      adjacency.get(first)?.set(id, point); adjacency.get(id)?.set(first, point);
    }
  };
  for (const junction of input.junctions) connect(junction.routeIds, junction);
  for (const riser of input.risers) connect([riser.fromRouteId, riser.toRouteId], riser);
  return { routesById, adjacency };
}

function collectComponent(routeId: string, graph: UtilityGraph) {
  const component: PlanUtilityRoute[] = [];
  const first = graph.routesById.get(routeId); if (!first) return component;
  const visited = new Set([routeId]);
  const queue = [routeId];
  while (queue.length) {
    const id = queue.shift(); if (!id) continue;
    const route = graph.routesById.get(id); if (!route || route.kind !== first.kind) continue;
    component.push(route);
    for (const neighbor of graph.adjacency.get(id)?.keys() ?? []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
  }
  return component;
}

export function connectedUtilityRouteIds(routeId: string, input: UtilityAnalysisInput) {
  return new Set(collectComponent(routeId, buildUtilityGraph(input)).map((route) => route.id));
}

function inferredFlowDirection(route: PlanUtilityRoute, inlet: ConnectionPoint): FlowDirection {
  const startDistance = Math.hypot(route.startX - inlet.x, route.startZ - inlet.z);
  const endDistance = Math.hypot(route.endX - inlet.x, route.endZ - inlet.z);
  return startDistance <= endDistance ? 'forward' : 'reverse';
}

export function analyzeUtilityNetworks(input: UtilityAnalysisInput) {
  const graph = buildUtilityGraph(input);
  const devicesByRoute = new Map<string, PlanUtilityDevice[]>();
  for (const device of input.devices) {
    if (!device.routeId || !graph.routesById.has(device.routeId)) continue;
    const group = devicesByRoute.get(device.routeId) ?? [];
    group.push(device); devicesByRoute.set(device.routeId, group);
  }

  const result = new Map<string, UtilityRouteAnalysis>();
  const visited = new Set<string>();
  for (const route of input.routes) {
    if (visited.has(route.id)) continue;
    const component = collectComponent(route.id, graph);
    for (const item of component) visited.add(item.id);
    const networkId = component.map((item) => item.id).sort()[0] ?? route.id;
    const networkDevices = component.flatMap((item) => devicesByRoute.get(item.id) ?? []);
    const networkDemand = networkDevices.reduce((total, device) => total + deviceDemand(device), 0);
    const sources = component.filter((item) => item.sourceEnd);
    const source = sources.length === 1 ? sources[0] : undefined;
    const parentByRoute = new Map<string, string | undefined>();
    const depthByRoute = new Map<string, number>();
    const flowByRoute = new Map<string, FlowDirection>();
    const branchDevices = new Map(component.map((item) => [item.id, [...(devicesByRoute.get(item.id) ?? [])]]));

    if (source) {
      const queue = [source.id]; parentByRoute.set(source.id, undefined); depthByRoute.set(source.id, 0);
      flowByRoute.set(source.id, source.sourceEnd === 'start' ? 'forward' : 'reverse');
      while (queue.length) {
        const currentId = queue.shift(); if (!currentId) continue;
        for (const [neighborId, connection] of graph.adjacency.get(currentId) ?? []) {
          if (parentByRoute.has(neighborId)) continue;
          const neighbor = graph.routesById.get(neighborId); if (!neighbor) continue;
          parentByRoute.set(neighborId, currentId);
          depthByRoute.set(neighborId, (depthByRoute.get(currentId) ?? 0) + 1);
          flowByRoute.set(neighborId, inferredFlowDirection(neighbor, connection));
          queue.push(neighborId);
        }
      }
      const downstreamFirst = [...component].sort((left, right) => (depthByRoute.get(right.id) ?? 0) - (depthByRoute.get(left.id) ?? 0));
      for (const item of downstreamFirst) {
        const parentId = parentByRoute.get(item.id); if (!parentId) continue;
        branchDevices.get(parentId)?.push(...(branchDevices.get(item.id) ?? []));
      }
    }

    for (const item of component) {
      const devices = source ? branchDevices.get(item.id) ?? [] : networkDevices;
      const demand = source ? devices.reduce((total, device) => total + deviceDemand(device), 0) : networkDemand;
      const diameter = Math.max(UTILITY_KINDS[item.kind].defaultDiameter, recommendedDiameter(item.kind, demand, devices));
      result.set(item.id, { routeId: item.id, networkId, kind: item.kind, demand, networkDemand,
        demandUnit: demandUnit(item.kind), connectedDeviceCount: devices.length, networkDeviceCount: networkDevices.length,
        networkRouteCount: component.length, recommendedDiameter: diameter, undersized: item.diameter + 0.000_001 < diameter,
        sourceRouteId: source?.id, sourceCount: sources.length, flowDirection: flowByRoute.get(item.id) });
    }
  }
  return result;
}
