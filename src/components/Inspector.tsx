import { Copy, DoorOpen, Droplets, Layers3, Move3D, PanelTop, Plus, RotateCw, Ruler, Trash2 } from 'lucide-react';

import { roomArea, wallId } from '../lib/geometry';
import { useEditorStore } from '../store/editorStore';

function NumericField({ label, value, min, max, step = 0.1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><div><input max={max} min={min} onChange={(event) => onChange(event.target.valueAsNumber)} step={step} type="number" value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0} />{unit ? <small>{unit}</small> : null}</div></label>;
}

function EmptyInspector() {
  const site = useEditorStore((state) => state.site);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const floor = useEditorStore((state) => state.floors.find((item) => item.id === activeFloorId));
  const updateSite = useEditorStore((state) => state.updateSite);
  const updateFloor = useEditorStore((state) => state.updateFloor);
  const duplicateActiveFloor = useEditorStore((state) => state.duplicateActiveFloor);
  return <>
    <div className="inspector-empty"><Move3D size={28} /><h2>Выберите элемент</h2><p>Нажмите на пол, стену или объект в сцене, чтобы открыть его параметры.</p></div>
    {floor ? <section className="inspector-section"><div className="inspector-title"><span>Активный этаж</span><Layers3 size={16} /></div><label className="floor-name-field"><span>Название</span><input defaultValue={floor.name} key={`${floor.id}:${floor.name}`} maxLength={80} onBlur={(event) => updateFloor(floor.id, { name: event.target.value })} /></label><NumericField label="Отметка" max={60} min={-20} onChange={(elevation) => updateFloor(floor.id, { elevation })} unit="м" value={floor.elevation} /><button className="duplicate-floor" onClick={duplicateActiveFloor} type="button"><Copy size={15} /> Дублировать этаж со всем содержимым</button></section> : null}
    <section className="inspector-section"><div className="inspector-title"><span>Площадка</span><Ruler size={16} /></div><div className="field-row"><NumericField label="Ширина" max={200} min={4} onChange={(width) => updateSite({ width })} unit="м" value={site.width} /><NumericField label="Глубина" max={200} min={4} onChange={(depth) => updateSite({ depth })} unit="м" value={site.depth} /></div></section>
    <div className="shortcut-card"><b>Быстрые клавиши</b><p><kbd>Del</kbd> удалить · <kbd>Esc</kbd> снять выбор</p><p><kbd>⌘Z</kbd> отменить · <kbd>D</kbd> размеры · <kbd>1–3</kbd> камера</p></div>
  </>;
}

function RoomInspector({ id, selectedVertexIndex }: { id: string; selectedVertexIndex?: number }) {
  const room = useEditorStore((state) => state.rooms.find((item) => item.id === id));
  const updateRoom = useEditorStore((state) => state.updateRoom);
  const updatePolygonVertex = useEditorStore((state) => state.updatePolygonVertex);
  const insertPolygonVertex = useEditorStore((state) => state.insertPolygonVertex);
  const removePolygonVertex = useEditorStore((state) => state.removePolygonVertex);
  const duplicateRoom = useEditorStore((state) => state.duplicateRoom);
  const removeRoom = useEditorStore((state) => state.removeRoom);
  if (!room) return <EmptyInspector />;
  const degrees = room.rotation * 180 / Math.PI;
  const shapeLabel = room.shape === 'polygon' ? 'Произвольный контур' : room.shape === 'triangle' ? 'Треугольный блок' : 'Прямоугольный блок';
  return <>
    <div className="inspector-head"><span className="selection-tag">{shapeLabel}</span><input aria-label="Название блока" maxLength={80} onChange={(event) => updateRoom(room.id, { name: event.target.value })} value={room.name} /></div>
    <section className="inspector-section"><div className="inspector-title"><span>Положение</span><Move3D size={16} /></div><div className="field-row"><NumericField label="X" max={200} min={-200} onChange={(x) => updateRoom(room.id, { x })} unit="м" value={room.x} /><NumericField label="Z" max={200} min={-200} onChange={(z) => updateRoom(room.id, { z })} unit="м" value={room.z} /></div><NumericField label="Поворот" max={360} min={-360} onChange={(rotation) => updateRoom(room.id, { rotation: rotation * Math.PI / 180 })} step={1} unit="°" value={degrees} /></section>
    <section className="inspector-section"><div className="inspector-title"><span>Размеры</span><Ruler size={16} /></div>{room.shape === 'polygon' ? <div className="polygon-summary"><span><b>{room.vertices?.length ?? 0}</b> вершин</span><span><b>{room.width.toFixed(1)} × {room.depth.toFixed(1)}</b> м</span></div> : <div className="field-row"><NumericField label="Ширина" max={50} min={0.5} onChange={(width) => updateRoom(room.id, { width })} unit="м" value={room.width} /><NumericField label="Глубина" max={50} min={0.5} onChange={(depth) => updateRoom(room.id, { depth })} unit="м" value={room.depth} /></div>}<div className="field-row"><NumericField label="Высота стен" max={12} min={0.2} onChange={(wallHeight) => updateRoom(room.id, { wallHeight })} unit="м" value={room.wallHeight} /><NumericField label="Толщина" max={1} min={0.05} onChange={(wallThickness) => updateRoom(room.id, { wallThickness })} step={0.01} unit="м" value={room.wallThickness} /></div></section>
    <section className="inspector-section"><div className="inspector-title"><span>Пол</span><Droplets size={16} /></div><label className="color-field"><input onChange={(event) => updateRoom(room.id, { floorColor: event.target.value })} type="color" value={room.floorColor} /><span>{room.floorColor.toUpperCase()}</span><b>{roomArea(room).toFixed(1)} м²</b></label></section>
    {room.shape === 'polygon' && room.vertices ? <section className="inspector-section"><div className="inspector-title"><span>Вершины контура</span><Move3D size={16} /></div><p className="vertex-note">Координаты указаны относительно центра объекта. Выберите маркер и двигайте его по осям X/Z с шагом 0,5 м.</p><div className="vertex-list">{room.vertices.map((point, index) => <div className={`vertex-row${selectedVertexIndex === index ? ' active' : ''}`} key={index}><b>{index + 1}</b><div className="vertex-controls"><div className="field-row"><NumericField label="X" max={50} min={-50} onChange={(x) => updatePolygonVertex(room.id, index, { x })} unit="м" value={point[0]} /><NumericField label="Z" max={50} min={-50} onChange={(z) => updatePolygonVertex(room.id, index, { z })} unit="м" value={point[1]} /></div><div className="vertex-actions"><button onClick={() => insertPolygonVertex(room.id, index)} title={`Добавить вершину после ${index + 1}`} type="button"><Plus size={13} /> После этой стены</button><button className="danger" disabled={room.vertices!.length <= 3} onClick={() => removePolygonVertex(room.id, index)} title={`Удалить вершину ${index + 1}`} type="button"><Trash2 size={12} /></button></div></div></div>)}</div></section> : null}
    <div className="inspector-actions"><button onClick={() => duplicateRoom(room.id)} type="button"><Copy size={16} /> Копировать</button><button className="danger" onClick={() => removeRoom(room.id)} type="button"><Trash2 size={16} /> Удалить</button></div>
  </>;
}

function WallInspector({ roomId, wallIndex }: { roomId: string; wallIndex: number }) {
  const room = useEditorStore((state) => state.rooms.find((item) => item.id === roomId));
  const finish = useEditorStore((state) => state.wallFinishes[wallId(roomId, wallIndex)]);
  const opening = useEditorStore((state) => state.openings.find((item) => item.roomId === roomId && item.wallIndex === wallIndex));
  const textures = useEditorStore((state) => state.textures);
  const setWallFinish = useEditorStore((state) => state.setWallFinish);
  const clearWallFinish = useEditorStore((state) => state.clearWallFinish);
  const addWallOpening = useEditorStore((state) => state.addWallOpening);
  const updateWallOpening = useEditorStore((state) => state.updateWallOpening);
  const removeWallOpening = useEditorStore((state) => state.removeWallOpening);
  const color = finish?.color ?? '#E9E4DA';
  if (!room) return <EmptyInspector />;
  return <>
    <div className="inspector-head"><span className="selection-tag">Отдельная стена · грань {wallIndex + 1}</span><h2>{room.name}</h2></div>
    <section className="inspector-section"><div className="inspector-title"><span>Двери и окна</span>{opening?.kind === 'door' ? <DoorOpen size={16} /> : <PanelTop size={16} />}</div>
      <div className="opening-choices"><button className={opening?.kind === 'door' ? 'active' : ''} onClick={() => addWallOpening(roomId, wallIndex, 'door')} type="button"><DoorOpen size={17} /> Дверь</button><button className={opening?.kind === 'window' ? 'active' : ''} onClick={() => addWallOpening(roomId, wallIndex, 'window')} type="button"><PanelTop size={17} /> Окно</button></div>
      {opening ? <div className="opening-fields"><div className="field-row"><NumericField label="Положение" max={98} min={2} onChange={(offset) => updateWallOpening(opening.id, { offset: offset / 100 })} step={1} unit="%" value={opening.offset * 100} /><NumericField label="Ширина" max={5} min={0.25} onChange={(width) => updateWallOpening(opening.id, { width })} unit="м" value={opening.width} /></div><div className="field-row"><NumericField label="Высота" max={4} min={0.3} onChange={(height) => updateWallOpening(opening.id, { height })} unit="м" value={opening.height} />{opening.kind === 'window' ? <NumericField label="Подоконник" max={3} min={0} onChange={(sillHeight) => updateWallOpening(opening.id, { sillHeight })} unit="м" value={opening.sillHeight} /> : <div />}</div><button className="remove-opening" onClick={() => removeWallOpening(opening.id)} type="button"><Trash2 size={14} /> Удалить проём</button></div> : <p className="empty-materials">Добавьте один проём на выбранную грань. Стена автоматически разделится вокруг него.</p>}
    </section>
    <section className="inspector-section"><div className="inspector-title"><span>Цвет стены</span><Droplets size={16} /></div><label className="color-field"><input onChange={(event) => setWallFinish(roomId, wallIndex, { color: event.target.value, ...(finish?.textureId ? { textureId: finish.textureId } : {}) })} type="color" value={color} /><span>{color.toUpperCase()}</span></label><div className="palette">{['#E9E4DA', '#D7E2DA', '#DAD4E4', '#D9C7BC', '#65776B', '#262A28'].map((item) => <button aria-label={`Цвет ${item}`} className={item.toLowerCase() === color.toLowerCase() && !finish?.textureId ? 'active' : ''} key={item} onClick={() => setWallFinish(roomId, wallIndex, { color: item })} style={{ background: item }} type="button" />)}</div></section>
    <section className="inspector-section"><div className="inspector-title"><span>Текстура обоев</span><BoxIcon /></div>{textures.length ? <div className="texture-grid">{textures.map((texture) => <button className={finish?.textureId === texture.id ? 'active' : ''} key={texture.id} onClick={() => setWallFinish(roomId, wallIndex, { color, textureId: texture.id })} title={texture.name} type="button"><img alt="" src={texture.url} /><span>{texture.name}</span></button>)}</div> : <p className="empty-materials">Сначала загрузите текстуру в панели слева. Она применится только к этой грани.</p>}</section>
    <button className="wide-action" onClick={() => clearWallFinish(roomId, wallIndex)} type="button">Сбросить отделку этой стены</button>
  </>;
}

function BoxIcon() { return <span className="mini-swatch" />; }

function ModelInspector({ id }: { id: string }) {
  const model = useEditorStore((state) => state.modelInstances.find((item) => item.id === id));
  const updateModel = useEditorStore((state) => state.updateModel);
  const duplicateModel = useEditorStore((state) => state.duplicateModel);
  const removeModel = useEditorStore((state) => state.removeModel);
  if (!model) return <EmptyInspector />;
  return <>
    <div className="inspector-head"><span className="selection-tag">3D-объект</span><input aria-label="Название объекта" maxLength={80} onChange={(event) => updateModel(model.id, { name: event.target.value })} value={model.name} /></div>
    <section className="inspector-section"><div className="inspector-title"><span>Положение</span><Move3D size={16} /></div><div className="field-row"><NumericField label="X" max={200} min={-200} onChange={(x) => updateModel(model.id, { x })} unit="м" value={model.x} /><NumericField label="Z" max={200} min={-200} onChange={(z) => updateModel(model.id, { z })} unit="м" value={model.z} /></div><NumericField label="Высота Y" max={50} min={-10} onChange={(y) => updateModel(model.id, { y })} unit="м" value={model.y} /></section>
    <section className="inspector-section"><div className="inspector-title"><span>Трансформация</span><RotateCw size={16} /></div><div className="field-row"><NumericField label="Поворот" max={360} min={-360} onChange={(rotation) => updateModel(model.id, { rotation: rotation * Math.PI / 180 })} step={1} unit="°" value={model.rotation * 180 / Math.PI} /><NumericField label="Масштаб" max={20} min={0.05} onChange={(scale) => updateModel(model.id, { scale })} step={0.05} unit="×" value={model.scale} /></div></section>
    <div className="inspector-actions"><button onClick={() => duplicateModel(model.id)} type="button"><Copy size={16} /> Копировать</button><button className="danger" onClick={() => removeModel(model.id)} type="button"><Trash2 size={16} /> Удалить</button></div>
  </>;
}

export function Inspector() {
  const selection = useEditorStore((state) => state.selection);
  return <aside className="side-panel inspector"><div className="panel-label">Инспектор <span>точные параметры</span></div>{!selection ? <EmptyInspector /> : selection.kind === 'room' ? <RoomInspector id={selection.id} /> : selection.kind === 'vertex' ? <RoomInspector id={selection.roomId} selectedVertexIndex={selection.vertexIndex} /> : selection.kind === 'wall' ? <WallInspector roomId={selection.roomId} wallIndex={selection.wallIndex} /> : <ModelInspector id={selection.id} />}</aside>;
}
