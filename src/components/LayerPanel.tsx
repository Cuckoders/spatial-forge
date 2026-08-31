import { useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Layers3, Lock, Plus, Trash2, Unlock } from 'lucide-react';

import { selectionLayerKeys } from '../lib/layers';
import { useEditorStore } from '../store/editorStore';

export function LayerPanel() {
  const [expanded, setExpanded] = useState(true);
  const layers = useEditorStore((state) => state.layers);
  const assignments = useEditorStore((state) => state.layerAssignments);
  const selection = useEditorStore((state) => state.selection);
  const addLayer = useEditorStore((state) => state.addLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const removeLayer = useEditorStore((state) => state.removeLayer);
  const assignSelectionToLayer = useEditorStore((state) => state.assignSelectionToLayer);
  const selectedKeys = useMemo(() => selectionLayerKeys(selection), [selection]);
  const selectedLayerIds = new Set(selectedKeys.map((key) => assignments[key] ?? ''));
  const selectedLayerId = !selectedKeys.length ? '' : selectedLayerIds.size === 1 ? [...selectedLayerIds][0] ?? '' : '__mixed';
  const layerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const layerId of Object.values(assignments)) counts.set(layerId, (counts.get(layerId) ?? 0) + 1);
    return counts;
  }, [assignments]);

  return <aside className={`layer-panel${expanded ? ' expanded' : ''}`}>
    <button aria-expanded={expanded} className="layer-panel-toggle" onClick={() => setExpanded((value) => !value)} type="button"><Layers3 size={16} /><span>Слои</span><b>{layers.length}</b><ChevronDown size={14} /></button>
    {expanded ? <div className="layer-panel-content">
      <label className="layer-assignment"><span>Слой выделения</span><select aria-label="Слой выделения" disabled={!selectedKeys.length} onChange={(event) => assignSelectionToLayer(event.target.value || undefined)} value={selectedLayerId}>
        {selectedLayerId === '__mixed' ? <option value="__mixed">Несколько слоёв</option> : null}
        <option value="">Основной слой</option>
        {layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
      </select><small>{selectedKeys.length ? `Выбрано элементов: ${selectedKeys.length}` : 'Выберите комнату, стену, объект или группу'}</small></label>
      <div className="layer-list">
        <div className="layer-row base"><span className="layer-color" /><div><b>Основной слой</b><small>Без назначения</small></div><span className="layer-count">—</span></div>
        {layers.map((layer) => <div className={`layer-row${!layer.visible ? ' hidden' : ''}${layer.locked ? ' locked' : ''}`} key={layer.id}>
          <input aria-label={`Цвет слоя ${layer.name}`} className="layer-color-input" onChange={(event) => updateLayer(layer.id, { color: event.target.value })} type="color" value={layer.color} />
          <input aria-label={`Название слоя ${layer.name}`} className="layer-name" defaultValue={layer.name} key={`${layer.id}:${layer.name}`} maxLength={40} onBlur={(event) => updateLayer(layer.id, { name: event.target.value })} />
          <span className="layer-count">{layerCounts.get(layer.id) ?? 0}</span>
          <button aria-label={`${layer.visible ? 'Скрыть' : 'Показать'} слой ${layer.name}`} aria-pressed={layer.visible} onClick={() => updateLayer(layer.id, { visible: !layer.visible })} title={layer.visible ? 'Скрыть слой' : 'Показать слой'} type="button">{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
          <button aria-label={`${layer.locked ? 'Разблокировать' : 'Заблокировать'} слой ${layer.name}`} aria-pressed={layer.locked} onClick={() => updateLayer(layer.id, { locked: !layer.locked })} title={layer.locked ? 'Разблокировать слой' : 'Заблокировать слой'} type="button">{layer.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
          <button aria-label={`Удалить слой ${layer.name}`} className="layer-delete" onClick={() => removeLayer(layer.id)} title="Удалить слой" type="button"><Trash2 size={12} /></button>
        </div>)}
      </div>
      <button className="layer-add" disabled={layers.length >= 24} onClick={addLayer} type="button"><Plus size={14} /> Добавить пользовательский слой</button>
    </div> : null}
  </aside>;
}
