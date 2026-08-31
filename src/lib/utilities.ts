import type { PlanUtilityRoute, UtilityKind } from '../types';

export const UTILITY_KINDS: Record<UtilityKind, { label: string; shortLabel: string; color: string; defaultElevation: number; defaultDiameter: number }> = {
  electric: { label: 'Электрика', shortLabel: 'Кабель', color: '#E7B928', defaultElevation: 0.14, defaultDiameter: 0.02 },
  water: { label: 'Водоснабжение', shortLabel: 'Вода', color: '#3289D8', defaultElevation: 0.1, defaultDiameter: 0.025 },
  heating: { label: 'Отопление', shortLabel: 'Тепло', color: '#D8583F', defaultElevation: 0.12, defaultDiameter: 0.032 },
};

export const utilityLength = (route: Pick<PlanUtilityRoute, 'startX' | 'startZ' | 'endX' | 'endZ'>) =>
  Math.hypot(route.endX - route.startX, route.endZ - route.startZ);
