import { Eye, EyeOff, Layers3, Plus, Trash2 } from 'lucide-react';

import { useEditorStore } from '../store/editorStore';

export function FloorBar() {
  const floors = useEditorStore((state) => state.floors);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const showAllFloors = useEditorStore((state) => state.showAllFloors);
  const setActiveFloor = useEditorStore((state) => state.setActiveFloor);
  const addFloor = useEditorStore((state) => state.addFloor);
  const removeActiveFloor = useEditorStore((state) => state.removeActiveFloor);
  const toggleAllFloors = useEditorStore((state) => state.toggleAllFloors);

  return (
    <div className="floorbar">
      <div className="floorbar-title"><Layers3 size={16} /> Этажи</div>
      <div className="floor-tabs">
        {floors.map((floor) => <button className={floor.id === activeFloorId ? 'active' : ''} key={floor.id} onClick={() => setActiveFloor(floor.id)} type="button">{floor.name}<small>{floor.elevation.toFixed(1)} м</small></button>)}
      </div>
      <button className="floor-action" onClick={addFloor} title="Добавить этаж" type="button"><Plus size={17} /></button>
      <button className={`floor-action ${showAllFloors ? 'active' : ''}`} onClick={toggleAllFloors} title={showAllFloors ? 'Показать только активный этаж' : 'Показать все этажи'} type="button">{showAllFloors ? <Eye size={17} /> : <EyeOff size={17} />}</button>
      <button className="floor-action danger" disabled={floors.length <= 1} onClick={removeActiveFloor} title="Удалить активный этаж" type="button"><Trash2 size={16} /></button>
    </div>
  );
}
