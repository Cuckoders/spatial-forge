import { useMemo, useRef, type ChangeEvent } from 'react';
import { Armchair, BedDouble, Box, BrickWall, Cable, Cuboid, Droplets, Eye, EyeOff, Flame, GitFork, ImagePlus, MousePointer2, MoveUpRight, PenTool, Square, TableProperties, Trash2, Trees, Triangle, Upload } from 'lucide-react';

import { deletePersistedAsset, persistAsset } from '../lib/assetStorage';
import { createModelAsset, createTextureAsset } from '../lib/files';
import { useEditorStore } from '../store/editorStore';
import { UTILITY_DEVICE_KINDS, UTILITY_KINDS } from '../lib/utilities';
import { analyzeUtilityNetworks } from '../lib/utilityAnalysis';
import type { BuiltInModelKind, EditorTool, UtilityDeviceKind, UtilityKind } from '../types';

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

const utilityDeviceKinds: Array<{ id: UtilityDeviceKind; icon: typeof Cable }> = [
  { id: 'outlet', icon: Cable }, { id: 'switch', icon: MousePointer2 }, { id: 'panel', icon: Box },
  { id: 'waterPoint', icon: Droplets }, { id: 'drain', icon: MoveUpRight }, { id: 'radiator', icon: Flame },
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
  const utilityDevices = useEditorStore((state) => state.utilityDevices);
  const utilityRisers = useEditorStore((state) => state.utilityRisers);
  const utilityJunctions = useEditorStore((state) => state.utilityJunctions);
  const utilityDeviceKind = useEditorStore((state) => state.utilityDeviceKind);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const floorCount = useEditorStore((state) => state.floors.length);
  const textures = useEditorStore((state) => state.textures);
  const modelAssets = useEditorStore((state) => state.modelAssets);
  const setTool = useEditorStore((state) => state.setTool);
  const setUtilityKind = useEditorStore((state) => state.setUtilityKind);
  const setUtilityDeviceKind = useEditorStore((state) => state.setUtilityDeviceKind);
  const toggleUtilityVisibility = useEditorStore((state) => state.toggleUtilityVisibility);
  const addTexture = useEditorStore((state) => state.addTexture);
  const removeTexture = useEditorStore((state) => state.removeTexture);
  const addModelAsset = useEditorStore((state) => state.addModelAsset);
  const removeModelAsset = useEditorStore((state) => state.removeModelAsset);
  const addBuiltInModel = useEditorStore((state) => state.addBuiltInModel);
  const addCustomModel = useEditorStore((state) => state.addCustomModel);
  const notify = useEditorStore((state) => state.notify);
  const activeUtilityDevices = utilityDevices.filter((device) => device.floorId === activeFloorId);
  const activeUtilityRisers = utilityRisers.filter((riser) => riser.fromFloorId === activeFloorId || riser.toFloorId === activeFloorId);
  const activeUtilityJunctions = utilityJunctions.filter((junction) => junction.floorId === activeFloorId);
  const utilityAnalysis = useMemo(() => analyzeUtilityNetworks({ routes: utilities, devices: utilityDevices, risers: utilityRisers, junctions: utilityJunctions }),
    [utilities, utilityDevices, utilityJunctions, utilityRisers]);
  const recommendedForRoutes = (routeIds: Array<string | undefined>) => routeIds.reduce((maximum, routeId) => Math.max(maximum, routeId ? utilityAnalysis.get(routeId)?.recommendedDiameter ?? 0 : 0), 0);
  const undersizedActiveRouteCount = utilities.filter((route) => route.floorId === activeFloorId && utilityAnalysis.get(route.id)?.undersized).length;
  const undersizedActiveRiserCount = activeUtilityRisers.filter((riser) => riser.diameter + 0.000_001 < recommendedForRoutes([riser.fromRouteId, riser.toRouteId])).length;
  const undersizedActiveJunctionCount = activeUtilityJunctions.filter((junction) => junction.diameter + 0.000_001 < recommendedForRoutes(junction.routeIds)).length;
  const undersizedActiveElementCount = undersizedActiveRouteCount + undersizedActiveRiserCount + undersizedActiveJunctionCount;
  const unconnectedDeviceCount = activeUtilityDevices.filter((device) => !device.routeId).length;
  const unconnectedRiserEndpointCount = activeUtilityRisers.reduce((count, riser) => count
    + Number(riser.fromFloorId === activeFloorId && !riser.fromRouteId) + Number(riser.toFloorId === activeFloorId && !riser.toRouteId), 0);
  const incompleteJunctionCount = activeUtilityJunctions.filter((junction) => junction.routeIds.length < 2).length;

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
        {undersizedActiveElementCount ? <div className="connection-audit"><span>{undersizedActiveElementCount}</span><div><b>Недостаточный диаметр</b><small>Проверьте трассы, стояки и узлы</small></div></div> : utilities.some((route) => route.floorId === activeFloorId) ? <div className="connection-audit ready"><span>✓</span><div><b>Диаметры проверены</b><small>Связанный участок соответствует нагрузке</small></div></div> : null}
        <div className="utility-device-heading"><b>Стояки между этажами</b><span>{activeUtilityRisers.length}</span></div>
        <div className="utility-riser-grid">{utilityKinds.map((item) => { const count = activeUtilityRisers.filter((riser) => riser.kind === item.id).length; return <button aria-pressed={tool === 'utility-riser' && utilityKind === item.id} className={tool === 'utility-riser' && utilityKind === item.id ? 'active' : ''} disabled={floorCount < 2} key={item.id} onClick={() => { setUtilityKind(item.id); setTool('utility-riser'); }} type="button"><MoveUpRight size={14} style={{ color: item.color }} /><b>{item.id === 'electric' ? 'Эл. стояк' : item.id === 'water' ? 'Вода' : 'Тепло'}</b>{count ? <small>{count}</small> : null}</button>; })}</div>
        {unconnectedRiserEndpointCount ? <div className="connection-audit"><span>{unconnectedRiserEndpointCount}</span><div><b>Концы стояков без связи</b><small>Подключите трассы текущего этажа</small></div></div> : activeUtilityRisers.length ? <div className="connection-audit ready"><span>✓</span><div><b>Стояки подключены</b><small>Текущий этаж связан с трассами</small></div></div> : null}
        <div className="utility-device-heading"><b>Узлы ветвления</b><span>{activeUtilityJunctions.length}</span></div>
        <div className="utility-riser-grid">{utilityKinds.map((item) => { const count = activeUtilityJunctions.filter((junction) => junction.kind === item.id).length; return <button aria-pressed={tool === 'utility-junction' && utilityKind === item.id} className={tool === 'utility-junction' && utilityKind === item.id ? 'active' : ''} key={item.id} onClick={() => { setUtilityKind(item.id); setTool('utility-junction'); }} type="button"><GitFork size={14} style={{ color: item.color }} /><b>{item.id === 'electric' ? 'Эл. узел' : item.id === 'water' ? 'Вода' : 'Тепло'}</b>{count ? <small>{count}</small> : null}</button>; })}</div>
        {incompleteJunctionCount ? <div className="connection-audit"><span>{incompleteJunctionCount}</span><div><b>Узлы без ветвления</b><small>Нужно минимум две трассы</small></div></div> : activeUtilityJunctions.length ? <div className="connection-audit ready"><span>✓</span><div><b>Узлы сформированы</b><small>Все объединяют несколько трасс</small></div></div> : null}
        <div className="utility-device-heading"><b>Точки подключения</b><span>{activeUtilityDevices.length}</span></div>
        <div className="utility-device-grid">{utilityDeviceKinds.map((item) => { const Icon = item.icon; const style = UTILITY_DEVICE_KINDS[item.id]; const count = utilityDevices.filter((device) => device.floorId === activeFloorId && device.kind === item.id).length; return <button aria-pressed={tool === 'utility-device' && utilityDeviceKind === item.id} className={tool === 'utility-device' && utilityDeviceKind === item.id ? 'active' : ''} key={item.id} onClick={() => { setUtilityDeviceKind(item.id); setTool('utility-device'); }} type="button"><span style={{ color: style.color }}><Icon size={15} /></span><b>{style.shortLabel}</b>{count ? <small>{count}</small> : null}</button>; })}</div>
        {unconnectedDeviceCount ? <div className="connection-audit"><span>{unconnectedDeviceCount}</span><div><b>Без подключения</b><small>Отмечены красным в сцене</small></div></div> : activeUtilityDevices.length ? <div className="connection-audit ready"><span>✓</span><div><b>Все точки подключены</b><small>Связи с трассами корректны</small></div></div> : null}
        <p className="panel-note">{tool === 'utility' ? `${utilitySegmentCount ? `Продолжайте трассу · сегментов ${utilitySegmentCount}` : 'Укажите начальную точку'}. ЛКМ — следующая точка, Enter или Escape — завершить.` : tool === 'utility-device' ? `Размещайте «${UTILITY_DEVICE_KINDS[utilityDeviceKind].label}» по сетке. После установки параметры доступны справа.` : tool === 'utility-riser' ? `Размещайте стояк «${UTILITY_KINDS[utilityKind].label}» между активным и соседним этажом.` : tool === 'utility-junction' ? `Размещайте узел «${UTILITY_KINDS[utilityKind].label}» рядом с двумя или более трассами.` : 'Выберите трассу, стояк, узел или точку подключения и разместите их на активном этаже.'}</p>
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
