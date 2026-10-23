import type { FormRow } from '../../db';
import VerbTable from './VerbTable';

/**
 * Блок одного биньяна на странице глагола: заголовок биньяна
 * + таблица его форм (одна таблица = один компонент VerbTable).
 */
export default function BinyanBlock({
  name,
  rows,
}: {
  /** Название биньяна (hифъиль, hуфъаль…); null — на странице биньян не указан. */
  name: string | null;
  rows: FormRow[];
}) {
  return (
    <div className="binyan">
      {name && <h3 className="binyan-title">{name}</h3>}
      <VerbTable rows={rows} />
    </div>
  );
}
