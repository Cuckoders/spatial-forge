import { useRef, type ChangeEvent } from 'react';
import { Armchair, BedDouble, Box, BrickWall, Cable, Cuboid, Droplets, Eye, EyeOff, Flame, ImagePlus, MousePointer2, MoveUpRight, PenTool, Square, TableProperties, Trash2, Trees, Triangle, Upload } from 'lucide-react';

import { deletePersistedAsset, persistAsset } from '../lib/assetStorage';
import { createModelAsset, createTextureAsset } from '../lib/files';
import { useEditorStore } from '../store/editorStore';
import type { BuiltInModelKind, EditorTool, UtilityKind } from '../types';

const tools: Array<{ id: EditorTool; label: string; hint: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Выбор', hint: 'V', icon: MousePointer2 },
  { id: 'rectangle', label: 'Комната', hint: 'R', icon: Square },
  { id: 'triangle', label: 'Треугольник', hint: 'T', icon: Triangle },
  { id: 'polygon', label: 'Контур', hint: 'P', icon: PenTool },
  { id: 'wall', label: 'Стена', hint: 'L', icon: BrickWall },
];

const builtIns: Array<{ id: BuiltInModelKind; label: string; icon: typeof Box }> = [
  { id: 'sofa', label: 'Диван', icon: Armchair },
  { id: 'table', label: 'Стол', icon: TableProperties },
  { id: 'bed', label: 'Кровать', icon: BedDouble },
  { id: 'tree', label: 'Дерево', icon: Trees },
  { id: 'stairs', label: 'Лестница', icon: MoveUpRight },
];

const utilityKinds: Array<{ id: UtilityKind; label: string; icon: typeof Cable; color: string }> = [
  { id: 'electric', label: 'Электрика', icon: Cable, color: '#E7B928' },
  { id: 'water', label: 'Вода', icon: Droplets, color: '#3289D8' },
  { id: 'heating', label: 'Отопление', icon: Flame, color: '#D8583F' },
];

function fileSize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`; }

export function ToolPanel() {
  const textureInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const tool = useEditorStore((state) => state.tool);
  const polygonPointCount = useEditorStore((state) => state.draftPolygon.length);
  const wallStarted = useEditorStore((state) => Boolean(state.draftWallStart));
  const wallSegmentCount = useEditorStore((state) => state.draftWallChain?.segmentCount ?? 0);
  const wallSnapKind = useEditorStore((state) => state.draftWallSnap?.kind ?? null);
  const utilityKind = useEditorStore((state) => state.utilityKind);
  const utilitySegmentCount = useEditorStore((state) => state.draftUtilitySegmentCount);
  const utilityVisibility = useEditorStore((state) => state.utilityVisibility);
  const utilities = useEditorStore((state) => state.utilities);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const textures = useEditorStore((state) => state.textures);
  const modelAssets = useEditorStore((state) => state.modelAssets);
  const setTool = useEditorStore((state) => state.setTool);
  const setUtilityKind = useEditorStore((state) => state.setUtilityKind);
  const toggleUtilityVisibility = useEditorStore((state) => state.toggleUtilityVisibility);
  const addTexture = useEditorStore((state) => state.addTexture);
  const removeTexture = useEditorStore((state) => state.removeTexture);
  const addModelAsset = useEditorStore((state) => state.addModelAsset);
  const removeModelAsset = useEditorStore((state) => state.removeModelAsset);
  const addBuiltInModel = useEditorStore((state) => state.addBuiltInModel);
  const addCustomModel = useEditorStore((state) => state.addCustomModel);
  const notify = useEditorStore((state) => state.notify);

  const uploadTexture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const asset = await createTextureAsset(file); addTexture(asset);
      try { await persistAsset('texture', asset, file); } catch { notify('Текстура добавлена только на текущую сессию'); }
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось загрузить текстуру'); }
  };
  const uploadModel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const asset = await createModelAsset(file); addModelAsset(asset);
      try { await persistAsset('model', asset, file); } catch { notify('Модель добавлена только на текущую сессию'); }
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось загрузить модель'); }
  };
  const deleteTexture = async (id: string) => {
    try { await deletePersistedAsset(id); removeTexture(id); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось удалить текстуру'); }
  };
  const deleteModel = async (id: string) => {
    try { await deletePersistedAsset(id); removeModelAsset(id); }
    catch (error) { notify(error instanceof Error ? error.message : 'Не удалось удалить модель'); }
  };

  return (
    <aside className="side-panel tools-panel">
      <section>
        <div className="section-heading"><span>01</span><div><b>Геометрия</b><small>Стройте по сетке 0,5 м</small></div></div>
        <div className="tool-grid">
          {tools.map((item) => { const Icon = item.icon; return <button className={tool === item.id ? 'active' : ''} key={item.id} onClick={() => setTool(item.id)} type="button"><Icon size={19} /><span>{item.label}</span><kbd>{item.hint}</kbd></button>; })}
        </div>
        <p className="panel-note">{tool === 'polygon' ? `Контур: ставьте точки на сетке${polygonPointCount ? ` · точек ${polygonPointCount}` : ''}. Двойной клик или Enter — готово, Escape — отмена.`
          : tool === 'wall' ? `${wallSegmentCount ? `Продолжайте цепочку · сегментов ${wallSegmentCount}` : wallStarted ? 'Укажите конечную точку' : 'Укажите начало цепочки'}. Сетка 0,5 м и магнит к стенам${wallSnapKind ? ` · ${wallSnapKind === 'segment' ? 'Т-соединение' : 'соединение'} найдено` : ''}. После первой точки доступны точная длина и угол.`
            : 'Выберите фигуру, затем нажмите на сетку. Размеры и высоту можно изменить справа.'}</p>
      </section>

      <section>
        <div className="section-heading"><span>02</span><div><b>Инженерные сети</b><small>Трассы по активному этажу</small></div></div>
        <div className="utility-tools">
          {utilityKinds.map((item) => { const Icon = item.icon; const visible = utilityVisibility[item.id]; const count = utilities.filter((route) => route.floorId === activeFloorId && route.kind === item.id).length; return <div className="utility-tool-row" key={item.id}>
            <button aria-pressed={tool === 'utility' && utilityKind === item.id} className={`utility-kind-button${tool === 'utility' && utilityKind === item.id ? ' active' : ''}`} onClick={() => { setUtilityKind(item.id); setTool('utility'); }} type="button"><span style={{ color: item.color }}><Icon size={17} /></span><b>{item.label}</b><small>{count}</small></button>
            <button aria-label={`${visible ? 'Скрыть' : 'Показать'}: ${item.label}`} aria-pressed={visible} className={`utility-visibility${visible ? ' visible' : ''}`} onClick={() => toggleUtilityVisibility(item.id)} title={`${visible ? 'Скрыть' : 'Показать'} трассы`} type="button">{visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          </div>; })}
        </div>
        <p className="panel-note">{tool === 'utility' ? `${utilitySegmentCount ? `Продолжайте трассу · сегментов ${utilitySegmentCount}` : 'Укажите начальную точку'}. ЛКМ — следующая точка, Enter или Escape — завершить.` : 'Выберите тип сети и прокладывайте её последовательными сегментами по сетке 0,5 м.'}</p>
      </section>

      <section>
        <div className="section-heading"><span>03</span><div><b>Объекты</b><small>Встроенная библиотека</small></div></div>
        <div className="asset-grid">
          {builtIns.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => addBuiltInModel(item.id)} type="button"><span><Icon size={23} /></span>{item.label}</button>; })}
        </div>
      </section>

      <section>
        <div className="section-heading"><span>04</span><div><b>Свои материалы</b><small>Локально, без отправки</small></div></div>
        <button className="upload-button" onClick={() => textureInput.current?.click()} type="button"><ImagePlus size={18} /><span><b>Текстура стены</b><small>PNG, JPEG, WebP · до 8 МБ</small></span></button>
        <button className="upload-button" onClick={() => modelInput.current?.click()} type="button"><Upload size={18} /><span><b>3D-модель</b><small>Самодостаточная GLB · до 25 МБ</small></span></button>
        {modelAssets.length ? <div className="custom-assets">
          {modelAssets.map((asset) => <div className="custom-asset-row" key={asset.id}><button className="asset-place" onClick={() => addCustomModel(asset.id)} title="Разместить модель" type="button"><Cuboid size={17} /><span>{asset.name}<small>{fileSize(asset.size)}</small></span><b>+</b></button><button className="asset-delete" onClick={() => void deleteModel(asset.id)} title="Удалить модель из библиотеки" type="button"><Trash2 size={13} /></button></div>)}
        </div> : null}
        {textures.length ? <div className="texture-assets"><div className="asset-count">Локальные текстуры: <b>{textures.length}</b></div>{textures.map((texture) => <div className="texture-asset-row" key={texture.id}><img alt="" src={texture.url} /><span title={texture.name}>{texture.name}</span><button onClick={() => void deleteTexture(texture.id)} title="Удалить текстуру" type="button"><Trash2 size={12} /></button></div>)}</div> : null}
      </section>
      <input accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="visually-hidden" onChange={uploadTexture} ref={textureInput} type="file" />
      <input accept="model/gltf-binary,.glb" className="visually-hidden" onChange={uploadModel} ref={modelInput} type="file" />
    </aside>
  );
}
