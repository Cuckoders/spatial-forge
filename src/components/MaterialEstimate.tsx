import { useMemo, useState } from 'react';
import { Cable, Calculator, Download, Layers3, Paintbrush, RotateCcw, X } from 'lucide-react';

import { downloadBlob, safeDownloadName } from '../lib/files';
import { calculateProjectQuantities, createEstimateCsv, DEFAULT_ESTIMATE_RATES, materialEstimateRows, type EstimateRates, type WallFinishMode } from '../lib/materialEstimate';
import { useEditorStore } from '../store/editorStore';
import { UTILITY_KINDS } from '../lib/utilities';
import type { UtilityKind } from '../types';

interface MaterialEstimateProps {
  onClose: () => void;
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const currencyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0, style: 'currency', currency: 'RUB' });

function RateField({ label, value, unit, min, max, step = 1, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="estimate-rate-field"><span>{label}</span><div><input aria-label={label} max={max} min={min} onChange={(event) => {
    const nextValue = event.target.valueAsNumber;
    if (Number.isFinite(nextValue)) onChange(nextValue);
  }} step={step} type="number" value={Number.isFinite(value) ? value : 0} /><small>{unit}</small></div></label>;
}

function QuantityCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div className="estimate-quantity-card"><span>{label}</span><b>{numberFormat.format(value)} <small>{unit}</small></b></div>;
}

export default function MaterialEstimate({ onClose }: MaterialEstimateProps) {
  const projectName = useEditorStore((state) => state.projectName);
  const floors = useEditorStore((state) => state.floors);
  const rooms = useEditorStore((state) => state.rooms);
  const walls = useEditorStore((state) => state.walls);
  const openings = useEditorStore((state) => state.openings);
  const wallOpenings = useEditorStore((state) => state.wallOpenings);
  const utilities = useEditorStore((state) => state.utilities);
  const utilityDevices = useEditorStore((state) => state.utilityDevices);
  const utilityRisers = useEditorStore((state) => state.utilityRisers);
  const utilityJunctions = useEditorStore((state) => state.utilityJunctions);
  const notify = useEditorStore((state) => state.notify);
  const [rates, setRates] = useState<EstimateRates>(() => ({ ...DEFAULT_ESTIMATE_RATES }));
  const [wallMode, setWallMode] = useState<WallFinishMode>('paint');
  const quantities = useMemo(() => calculateProjectQuantities({ floors, rooms, walls, openings, wallOpenings, utilities, utilityDevices, utilityRisers, utilityJunctions }),
    [floors, openings, rooms, utilities, utilityDevices, utilityJunctions, utilityRisers, wallOpenings, walls]);
  const estimate = useMemo(() => materialEstimateRows(quantities, rates, wallMode), [quantities, rates, wallMode]);
  const updateRate = <K extends keyof EstimateRates>(key: K, value: EstimateRates[K]) => setRates((current) => ({ ...current, [key]: value }));

  const exportCsv = () => {
    const csv = createEstimateCsv(projectName, quantities, estimate.rows);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeDownloadName(projectName)}-materials.csv`);
    notify('Ведомость материалов сохранена в CSV');
  };

  return <div className="template-catalog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="material-estimate-title" aria-modal="true" className="material-estimate" role="dialog">
      <header className="template-catalog-head material-estimate-head">
        <div><span className="eyebrow">Расчёт проекта</span><h2 id="material-estimate-title">Ведомость материалов</h2><p>Площади, инженерные сети и ориентировочная стоимость без учёта работ и доставки.</p></div>
        <button aria-label="Закрыть ведомость" autoFocus className="template-close" onClick={onClose} type="button"><X size={19} /></button>
      </header>
      <div className="material-estimate-body">
        <main className="estimate-report">
          <div className="estimate-quantity-grid">
            <QuantityCard label="Стены без проёмов" unit="м²" value={quantities.wallArea} />
            <QuantityCard label="Полы" unit="м²" value={quantities.floorArea} />
            <QuantityCard label="Перекрытия" unit="м³" value={quantities.slabVolume} />
            <QuantityCard label="Кровля" unit="м²" value={quantities.roofArea} />
          </div>
          <section className="estimate-section">
            <div className="estimate-section-title"><span><Layers3 size={15} /> По этажам</span><small>Проёмы вычтены из стен</small></div>
            {quantities.floors.length ? <div className="floor-estimate-table"><div className="estimate-table-head"><span>Этаж</span><span>Стены</span><span>Пол</span><span>Кровля</span></div>{quantities.floors.map((floor) => <div key={floor.floorId}><b>{floor.floorName}</b><span>{numberFormat.format(floor.wallArea)} м²</span><span>{numberFormat.format(floor.floorArea)} м²</span><span>{numberFormat.format(floor.roofArea)} м²</span></div>)}</div> : null}
          </section>
          <section className="estimate-section">
            <div className="estimate-section-title"><span><Cable size={15} /> Инженерные сети</span><small>Всего {numberFormat.format(quantities.utilityLength)} м без запаса</small></div>
            <div className="engineering-estimate-table"><div className="estimate-table-head"><span>Сеть</span><span>Трассы</span><span>Стояки</span><span>Отводы</span><span>Итого</span></div>{(['electric', 'water', 'heating'] as UtilityKind[]).map((kind) => { const item = quantities.utilities[kind]; return <div key={kind}><b><i style={{ background: UTILITY_KINDS[kind].color }} /><span>{UTILITY_KINDS[kind].label}</span><small>{item.routeCount} тр. · {item.riserCount} ст. · {item.deviceCount} т. · {item.junctionCount} уз.</small></b><span>{numberFormat.format(item.routeLength)} м</span><span>{numberFormat.format(item.riserLength)} м</span><span>{numberFormat.format(item.connectionLength)} м</span><strong>{numberFormat.format(item.totalLength)} м</strong></div>; })}</div>
          </section>
          <section className="estimate-section wall-finish-choice">
            <div className="estimate-section-title"><span><Paintbrush size={15} /> Отделка стен</span><small>Выберите вариант для сметы</small></div>
            <div className="wall-finish-options">
              <button aria-pressed={wallMode === 'paint'} className={wallMode === 'paint' ? 'active' : ''} onClick={() => setWallMode('paint')} type="button"><span>Краска</span><b>{numberFormat.format(estimate.paintLiters)} л</b><small>{rates.paintCoats} слоя · {rates.paintCoverage} м²/л</small></button>
              <button aria-pressed={wallMode === 'wallpaper'} className={wallMode === 'wallpaper' ? 'active' : ''} onClick={() => setWallMode('wallpaper')} type="button"><span>Обои</span><b>{estimate.wallpaperRolls} рул.</b><small>{rates.wallpaperRollCoverage} м² полезной площади</small></button>
            </div>
          </section>
          <section className="estimate-section">
            <div className="estimate-section-title"><span><Calculator size={15} /> Материалы и стоимость</span><small>Запас {rates.wastePercent}%</small></div>
            {estimate.rows.length ? <div className="material-cost-table"><div className="estimate-table-head"><span>Материал</span><span>Количество</span><span>Цена</span><span>Сумма</span></div>{estimate.rows.map((row) => <div key={row.id}><b>{row.name}</b><span>{numberFormat.format(row.quantity)} {row.unit}</span><span>{currencyFormat.format(row.unitPrice)}</span><strong>{currencyFormat.format(row.cost)}</strong></div>)}</div> : <div className="empty-estimate">Добавьте помещения или инженерные сети, чтобы рассчитать материалы.</div>}
          </section>
        </main>
        <aside className="estimate-rates">
          <div className="estimate-rates-head"><div><b>Параметры расчёта</b><small>Цены можно заменить на свои</small></div><button onClick={() => setRates({ ...DEFAULT_ESTIMATE_RATES })} title="Сбросить цены" type="button"><RotateCcw size={15} /></button></div>
          <RateField label="Запас материалов" max={50} min={0} onChange={(value) => updateRate('wastePercent', value)} unit="%" value={rates.wastePercent} />
          <div className="estimate-rate-group"><b>Стены</b><RateField label="Укрывистость краски" max={30} min={1} onChange={(value) => updateRate('paintCoverage', value)} step={0.5} unit="м²/л" value={rates.paintCoverage} /><RateField label="Количество слоёв" max={5} min={1} onChange={(value) => updateRate('paintCoats', value)} unit="сл." value={rates.paintCoats} /><RateField label="Цена краски" max={100000} min={0} onChange={(value) => updateRate('paintPrice', value)} unit="₽/л" value={rates.paintPrice} /><RateField label="Площадь рулона обоев" max={20} min={1} onChange={(value) => updateRate('wallpaperRollCoverage', value)} step={0.5} unit="м²" value={rates.wallpaperRollCoverage} /><RateField label="Цена рулона обоев" max={100000} min={0} onChange={(value) => updateRate('wallpaperRollPrice', value)} unit="₽" value={rates.wallpaperRollPrice} /></div>
          <div className="estimate-rate-group"><b>Конструкции</b><RateField label="Напольное покрытие" max={100000} min={0} onChange={(value) => updateRate('floorCoveringPrice', value)} unit="₽/м²" value={rates.floorCoveringPrice} /><RateField label="Бетон" max={100000} min={0} onChange={(value) => updateRate('concretePrice', value)} unit="₽/м³" value={rates.concretePrice} /><RateField label="Кровельное покрытие" max={100000} min={0} onChange={(value) => updateRate('roofingPrice', value)} unit="₽/м²" value={rates.roofingPrice} /></div>
          <div className="estimate-rate-group"><b>Инженерные сети</b><RateField label="Электрический кабель" max={100000} min={0} onChange={(value) => updateRate('electricCablePrice', value)} unit="₽/м" value={rates.electricCablePrice} /><RateField label="Труба водоснабжения" max={100000} min={0} onChange={(value) => updateRate('waterPipePrice', value)} unit="₽/м" value={rates.waterPipePrice} /><RateField label="Труба отопления" max={100000} min={0} onChange={(value) => updateRate('heatingPipePrice', value)} unit="₽/м" value={rates.heatingPipePrice} /></div>
        </aside>
      </div>
      <footer className="material-estimate-footer"><div><span>Ориентировочный бюджет</span><b>{currencyFormat.format(estimate.total)}</b></div><button className="button ghost" onClick={onClose} type="button">Закрыть</button><button className="button primary" disabled={!estimate.rows.length} onClick={exportCsv} type="button"><Download size={16} /> Экспорт CSV</button></footer>
    </section>
  </div>;
}
