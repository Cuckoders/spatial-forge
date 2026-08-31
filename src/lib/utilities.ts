import type { PlanUtilityRoute, UtilityDeviceKind, UtilityKind } from '../types';

export const UTILITY_KINDS: Record<UtilityKind, { label: string; shortLabel: string; color: string; defaultElevation: number; defaultDiameter: number }> = {
  electric: { label: 'Электрика', shortLabel: 'Кабель', color: '#E7B928', defaultElevation: 0.14, defaultDiameter: 0.02 },
  water: { label: 'Водоснабжение', shortLabel: 'Вода', color: '#3289D8', defaultElevation: 0.1, defaultDiameter: 0.025 },
  heating: { label: 'Отопление', shortLabel: 'Тепло', color: '#D8583F', defaultElevation: 0.12, defaultDiameter: 0.032 },
};

export const UTILITY_DEVICE_KINDS: Record<UtilityDeviceKind, { label: string; shortLabel: string; utilityKind: UtilityKind; color: string; defaultElevation: number; defaultRating: number; ratingLabel: string; ratingUnit: string }> = {
  outlet: { label: 'Розетка', shortLabel: 'Розетка', utilityKind: 'electric', color: '#E7B928', defaultElevation: 0.3, defaultRating: 3.5, ratingLabel: 'Мощность', ratingUnit: 'кВт' },
  switch: { label: 'Выключатель', shortLabel: 'Выключ.', utilityKind: 'electric', color: '#E7B928', defaultElevation: 0.9, defaultRating: 10, ratingLabel: 'Ток', ratingUnit: 'А' },
  panel: { label: 'Электрощит', shortLabel: 'Щит', utilityKind: 'electric', color: '#E7B928', defaultElevation: 1.5, defaultRating: 15, ratingLabel: 'Мощность', ratingUnit: 'кВт' },
  waterPoint: { label: 'Точка воды', shortLabel: 'Вода', utilityKind: 'water', color: '#3289D8', defaultElevation: 0.55, defaultRating: 20, ratingLabel: 'Диаметр', ratingUnit: 'мм' },
  drain: { label: 'Слив', shortLabel: 'Слив', utilityKind: 'water', color: '#24699E', defaultElevation: 0.08, defaultRating: 50, ratingLabel: 'Диаметр', ratingUnit: 'мм' },
  radiator: { label: 'Радиатор', shortLabel: 'Радиатор', utilityKind: 'heating', color: '#D8583F', defaultElevation: 0.12, defaultRating: 1.5, ratingLabel: 'Мощность', ratingUnit: 'кВт' },
};

export const utilityLength = (route: Pick<PlanUtilityRoute, 'startX' | 'startZ' | 'endX' | 'endZ'>) =>
  Math.hypot(route.endX - route.startX, route.endZ - route.startZ);
