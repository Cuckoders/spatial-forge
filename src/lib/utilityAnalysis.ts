import { UTILITY_KINDS } from './utilities';
import type { PlanUtilityDevice, PlanUtilityJunction, PlanUtilityRiser, PlanUtilityRoute, UtilityKind } from '../types';

export interface UtilityRouteAnalysis {
  routeId: string;
  kind: UtilityKind;
  demand: number;
  demandUnit: string;
  connectedDeviceCount: number;
  networkRouteCount: number;
  recommendedDiameter: number;
  undersized: boolean;
}

export interface UtilityAnalysisInput {
  routes: PlanUtilityRoute[];
  devices: PlanUtilityDevice[];
  risers: PlanUtilityRiser[];
  junctions: PlanUtilityJunction[];
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

export function analyzeUtilityNetworks(input: UtilityAnalysisInput) {
  const routesById = new Map(input.routes.map((route) => [route.id, route]));
  const adjacency = new Map(input.routes.map((route) => [route.id, new Set<string>()]));
  const connect = (routeIds: Array<string | undefined>) => {
    const valid = routeIds.flatMap((id) => id && routesById.has(id) ? [id] : []);
    const first = valid[0]; if (!first) return;
    const kind = routesById.get(first)?.kind;
    for (const id of valid.slice(1)) {
      if (routesById.get(id)?.kind !== kind) continue;
      adjacency.get(first)?.add(id); adjacency.get(id)?.add(first);
    }
  };
  for (const junction of input.junctions) connect(junction.routeIds);
  for (const riser of input.risers) connect([riser.fromRouteId, riser.toRouteId]);

  const devicesByRoute = new Map<string, PlanUtilityDevice[]>();
  for (const device of input.devices) {
    if (!device.routeId || !routesById.has(device.routeId)) continue;
    const group = devicesByRoute.get(device.routeId) ?? [];
    group.push(device); devicesByRoute.set(device.routeId, group);
  }

  const result = new Map<string, UtilityRouteAnalysis>();
  const visited = new Set<string>();
  for (const route of input.routes) {
    if (visited.has(route.id)) continue;
    const component: PlanUtilityRoute[] = [];
    const queue = [route.id]; visited.add(route.id);
    while (queue.length) {
      const id = queue.pop(); if (!id) continue;
      const item = routesById.get(id); if (!item || item.kind !== route.kind) continue;
      component.push(item);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    const devices = component.flatMap((item) => devicesByRoute.get(item.id) ?? []);
    const demand = devices.reduce((total, device) => total + deviceDemand(device), 0);
    const diameter = Math.max(UTILITY_KINDS[route.kind].defaultDiameter, recommendedDiameter(route.kind, demand, devices));
    for (const item of component) result.set(item.id, { routeId: item.id, kind: item.kind, demand, demandUnit: demandUnit(item.kind),
      connectedDeviceCount: devices.length, networkRouteCount: component.length, recommendedDiameter: diameter,
      undersized: item.diameter + 0.000_001 < diameter });
  }
  return result;
}
