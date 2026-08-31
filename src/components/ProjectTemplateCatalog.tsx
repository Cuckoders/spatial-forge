import { useState, type CSSProperties } from 'react';
import { Building2, Layers3, Trees, X } from 'lucide-react';

import { createProjectFromTemplate, projectTemplates, type ProjectTemplateInfo } from '../lib/projectTemplates';
import { useEditorStore } from '../store/editorStore';
import type { PlanRoom } from '../types';

interface ProjectTemplateCatalogProps {
  onClose: () => void;
}

function roomPoints(room: PlanRoom, siteWidth: number, siteDepth: number) {
  const vertices = room.vertices ?? (room.shape === 'triangle'
    ? [[-room.width / 2, room.depth / 2], [0, -room.depth / 2], [room.width / 2, room.depth / 2]]
    : [[-room.width / 2, -room.depth / 2], [room.width / 2, -room.depth / 2], [room.width / 2, room.depth / 2], [-room.width / 2, room.depth / 2]]);
  const cosine = Math.cos(room.rotation);
  const sine = Math.sin(room.rotation);
  return vertices.map(([localX, localZ]) => {
    const x = room.x + localX * cosine - localZ * sine;
    const z = room.z + localX * sine + localZ * cosine;
    return `${50 + (x / siteWidth) * 100},${50 + (z / siteDepth) * 100}`;
  }).join(' ');
}

function TemplatePreview({ template }: { template: ProjectTemplateInfo }) {
  const floorId = template.project.floors[0]?.id;
  const rooms = template.project.rooms.filter((room) => room.floorId === floorId);
  const walls = template.project.walls.filter((wall) => wall.floorId === floorId);
  const { width, depth } = template.project.site;
  const style = { '--template-accent': template.accent } as CSSProperties;

  return <div className="template-preview" style={style}>
    <svg aria-hidden="true" preserveAspectRatio="xMidYMid meet" viewBox="0 0 100 100">
      <rect className="template-site" height="84" rx="3" width="84" x="8" y="8" />
      {rooms.map((room) => <polygon fill={room.floorColor} key={room.id} points={roomPoints(room, width, depth)} />)}
      {walls.map((wall) => <line key={wall.id} x1={50 + (wall.startX / width) * 100} x2={50 + (wall.endX / width) * 100} y1={50 + (wall.startZ / depth) * 100} y2={50 + (wall.endZ / depth) * 100} />)}
    </svg>
    <span>{template.projectType === 'plot' ? <Trees size={15} /> : <Building2 size={15} />}</span>
  </div>;
}

function pluralize(count: number, one: string, few: string, many: string) {
  const lastTwo = count % 100;
  const last = count % 10;
  return lastTwo >= 11 && lastTwo <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
}

export default function ProjectTemplateCatalog({ onClose }: ProjectTemplateCatalogProps) {
  const projectType = useEditorStore((state) => state.projectType);
  const loadProject = useEditorStore((state) => state.loadProject);
  const notify = useEditorStore((state) => state.notify);
  const initialTemplate = projectTemplates.find((template) => template.projectType === projectType) ?? projectTemplates[0]!;
  const [selectedId, setSelectedId] = useState(initialTemplate.id);
  const selected = projectTemplates.find((template) => template.id === selectedId) ?? initialTemplate;

  const applyTemplate = () => {
    if (!window.confirm(`Применить шаблон «${selected.name}»? Текущая планировка будет заменена.`)) return;
    const project = createProjectFromTemplate(selected.id);
    if (!project) return;
    loadProject(project);
    notify(`Шаблон «${selected.name}» применён`);
    onClose();
  };

  return <div className="template-catalog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="template-catalog-title" aria-modal="true" className="template-catalog" role="dialog">
      <header className="template-catalog-head">
        <div>
          <span className="eyebrow">Новый проект</span>
          <h2 id="template-catalog-title">Каталог планировок</h2>
          <p>Выберите готовую основу и продолжите редактирование в 3D.</p>
        </div>
        <button aria-label="Закрыть каталог" className="template-close" onClick={onClose} type="button"><X size={19} /></button>
      </header>
      <div className="template-catalog-grid">
        {projectTemplates.map((template) => {
          const floorCount = template.project.floors.length;
          const blockCount = template.project.rooms.length + template.project.walls.length;
          const modelCount = template.project.modelInstances.length;
          return <button aria-pressed={selectedId === template.id} className={`template-card${selectedId === template.id ? ' selected' : ''}`} key={template.id} onClick={() => setSelectedId(template.id)} type="button">
            <TemplatePreview template={template} />
            <span className="template-card-copy">
              <span className="template-card-title"><b>{template.name}</b><em>{template.projectType === 'plot' ? 'Участок' : 'Помещение'}</em></span>
              <small>{template.description}</small>
              <span className="template-card-stats">
                <span><Layers3 size={12} /> {floorCount} {pluralize(floorCount, 'этаж', 'этажа', 'этажей')}</span>
                <span>{blockCount} {pluralize(blockCount, 'блок', 'блока', 'блоков')}</span>
                <span>{modelCount} {pluralize(modelCount, 'объект', 'объекта', 'объектов')}</span>
              </span>
            </span>
          </button>;
        })}
      </div>
      <footer className="template-catalog-footer">
        <div><span>Будет открыт проект</span><b>{selected.name}</b></div>
        <button className="button ghost" onClick={onClose} type="button">Отмена</button>
        <button className="button primary" onClick={applyTemplate} type="button">Использовать шаблон</button>
      </footer>
    </section>
  </div>;
}
