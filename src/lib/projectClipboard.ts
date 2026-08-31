import { parseProjectDocument } from './files';
import type { ProjectDocument } from '../types';

const PROJECT_CLIPBOARD_KEY = 'spatial-forge.clipboard.v1';

export interface ProjectClipboard {
  version: 1;
  kind: 'room' | 'floor';
  label: string;
  copiedAt: number;
  project: ProjectDocument;
}

export type ProjectClipboardSummary = Pick<ProjectClipboard, 'kind' | 'label' | 'copiedAt'>;

function cleanLabel(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const label = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim();
  return label && label.length <= 80 ? label : undefined;
}

export function readProjectClipboard(): ProjectClipboard | undefined {
  try {
    const raw = localStorage.getItem(PROJECT_CLIPBOARD_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const label = cleanLabel(value.label);
    if (value.version !== 1 || !['room', 'floor'].includes(String(value.kind)) || !label
      || typeof value.copiedAt !== 'number' || !Number.isFinite(value.copiedAt) || value.copiedAt < 0) return undefined;
    return { version: 1, kind: value.kind as ProjectClipboard['kind'], label, copiedAt: value.copiedAt,
      project: parseProjectDocument(value.project) };
  } catch { return undefined; }
}

export function writeProjectClipboard(value: ProjectClipboard) {
  try { localStorage.setItem(PROJECT_CLIPBOARD_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function summarizeProjectClipboard(value: ProjectClipboard | undefined): ProjectClipboardSummary | null {
  return value ? { kind: value.kind, label: value.label, copiedAt: value.copiedAt } : null;
}
