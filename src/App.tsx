import { useEffect } from 'react';
import { Box, Check, Compass, Grid3X3, House, RotateCw, Ruler, Scan, Undo2 } from 'lucide-react';

import { FloorBar } from './components/FloorBar';
import { Inspector } from './components/Inspector';
import { PlannerCanvas } from './components/scene/PlannerCanvas';
import { ToolPanel } from './components/ToolPanel';
import { TopBar } from './components/TopBar';
import { roomArea } from './lib/geometry';
import { loadPersistedAssets } from './lib/assetStorage';
import { useEditorStore } from './store/editorStore';

function ViewControls() {
  const preset = useEditorStore((state) => state.cameraPreset);
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset);
  const showDimensions = useEditorStore((state) => state.showDimensions);
  const toggleDimensions = useEditorStore((state) => state.toggleDimensions);
  const resetProject = useEditorStore((state) => state.resetProject);
  return <div className="view-controls">
    <button className={preset === 'perspective' ? 'active' : ''} onClick={() => setCameraPreset('perspective')} title="Перспектива · 1" type="button"><Compass size={17} /></button>
    <button className={preset === 'top' ? 'active' : ''} onClick={() => setCameraPreset('top')} title="Вид сверху · 2" type="button"><Grid3X3 size={17} /></button>
    <button className={preset === 'front' ? 'active' : ''} onClick={() => setCameraPreset('front')} title="Вид спереди · 3" type="button"><Scan size={17} /></button>
    <button className={showDimensions ? 'active' : ''} onClick={toggleDimensions} title="Размеры и площади" type="button"><Ruler size={17} /></button>
    <span />
    <button onClick={() => { if (window.confirm('Вернуть демонстрационную планировку? Текущие изменения будут заменены.')) resetProject(); }} title="Сбросить демо" type="button"><Undo2 size={17} /></button>
  </div>;
}

function SceneStats() {
  const rooms = useEditorStore((state) => state.rooms);
  const modelCount = useEditorStore((state) => state.modelInstances.length);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const floorRooms = rooms.filter((room) => room.floorId === activeFloorId);
  const area = floorRooms.reduce((total, room) => total + roomArea(room), 0);
  return <div className="scene-stats"><span><b>{area.toFixed(1)}</b> м²</span><span><b>{floorRooms.length}</b> блоков</span><span><b>{modelCount}</b> объектов</span></div>;
}

function WelcomeBadge() {
  return <div className="welcome-badge"><span><House size={18} /></span><div><b>Стройте прямо на сетке</b><small>Комнаты, участки и этажи в реальном 3D</small></div></div>;
}

export default function App() {
  const message = useEditorStore((state) => state.message);
  const notify = useEditorStore((state) => state.notify);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const select = useEditorStore((state) => state.select);
  const setTool = useEditorStore((state) => state.setTool);
  const rotateSelection = useEditorStore((state) => state.rotateSelection);
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const toggleDimensions = useEditorStore((state) => state.toggleDimensions);
  const hydrateAssets = useEditorStore((state) => state.hydrateAssets);

  useEffect(() => {
    let cancelled = false;
    loadPersistedAssets().then(({ textures, models }) => {
      if (!cancelled) hydrateAssets(textures, models);
    }).catch(() => { if (!cancelled) notify('Локальная библиотека недоступна — файлы будут работать только в этой сессии'); });
    return () => { cancelled = true; };
  }, [hydrateAssets, notify]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
      else if (event.key === 'Escape') select(null);
      else if (event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key.toLowerCase() === 'r') setTool('rectangle');
      else if (event.key.toLowerCase() === 't') setTool('triangle');
      else if (event.key.toLowerCase() === 'd') toggleDimensions();
      else if (event.key === ']') rotateSelection(15);
      else if (event.key === '1') setCameraPreset('perspective');
      else if (event.key === '2') setCameraPreset('top');
      else if (event.key === '3') setCameraPreset('front');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelection, redo, rotateSelection, select, setCameraPreset, setTool, toggleDimensions, undo]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => notify(null), 3200);
    return () => window.clearTimeout(timer);
  }, [message, notify]);

  return <div className="app-shell">
    <TopBar />
    <main className="workspace">
      <ToolPanel />
      <section className="viewport">
        <PlannerCanvas />
        <FloorBar />
        <ViewControls />
        <SceneStats />
        <WelcomeBadge />
        <div className="axis-widget"><span className="axis-y">Y</span><span className="axis-x">X</span><span className="axis-z">Z</span><Box size={20} /></div>
      </section>
      <Inspector />
    </main>
    {message ? <div className="toast" role="status"><Check size={17} /> {message}</div> : null}
    <div className="mobile-warning"><RotateCw size={22} /><b>Для полноценного редактора разверните экран</b><span>Просмотр на телефоне работает, но проектировать удобнее на планшете или компьютере.</span></div>
  </div>;
}
