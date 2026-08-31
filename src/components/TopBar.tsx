import { useRef, type ChangeEvent } from 'react';
import { Box, Building2, Camera, Download, FolderOpen, Redo2, Rotate3D, Trees, Undo2 } from 'lucide-react';

import { createProjectDocument, downloadProject, readProjectFile } from '../lib/files';
import { useEditorStore } from '../store/editorStore';

export function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const store = useEditorStore();

  const exportProject = () => {
    downloadProject(createProjectDocument({
      name: store.projectName,
      projectType: store.projectType,
      site: store.site,
      floors: store.floors,
      rooms: store.rooms,
      walls: store.walls,
      wallFinishes: store.wallFinishes,
      openings: store.openings,
      modelInstances: store.modelInstances,
    }));
    store.notify('Файл проекта сохранён');
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { store.loadProject(await readProjectFile(file)); }
    catch (error) { store.notify(error instanceof Error ? error.message : 'Не удалось открыть проект'); }
  };

  return (
    <header className="topbar">
      <div className="brand" aria-label="Spatial Forge">
        <span className="brand-mark"><Box size={20} strokeWidth={2.4} /></span>
        <span><b>SPATIAL</b><em>FORGE</em></span>
      </div>
      <div className="project-meta">
        <span className="eyebrow">Проект</span>
        <input aria-label="Название проекта" className="project-name" maxLength={80} onBlur={(event) => store.setProjectName(event.target.value)} defaultValue={store.projectName} key={store.projectName} />
      </div>
      <div className="segmented project-kind" aria-label="Тип проекта">
        <button className={store.projectType === 'apartment' ? 'active' : ''} onClick={() => store.setProjectType('apartment')} type="button"><Building2 size={15} /> Квартира</button>
        <button className={store.projectType === 'plot' ? 'active' : ''} onClick={() => store.setProjectType('plot')} type="button"><Trees size={15} /> Участок</button>
      </div>
      <div className="topbar-actions">
        <div className="history-actions" aria-label="История действий">
          <button disabled={!store.canUndo} onClick={store.undo} title="Отменить · Ctrl/Cmd+Z" type="button"><Undo2 size={16} /></button>
          <button disabled={!store.canRedo} onClick={store.redo} title="Повторить · Ctrl/Cmd+Shift+Z" type="button"><Redo2 size={16} /></button>
        </div>
        <button className="button ghost" onClick={() => inputRef.current?.click()} type="button"><FolderOpen size={16} /> Открыть</button>
        <button className="button ghost" onClick={store.requestCapture} type="button"><Camera size={16} /> Снимок</button>
        <button className="button primary" onClick={exportProject} type="button"><Download size={16} /> Сохранить</button>
        <button className="icon-button" onClick={() => store.rotateSelection(15)} title="Повернуть выбранное на 15°" type="button"><Rotate3D size={18} /></button>
      </div>
      <input accept=".json,.spatial.json,application/json" className="visually-hidden" onChange={importProject} ref={inputRef} type="file" />
    </header>
  );
}
