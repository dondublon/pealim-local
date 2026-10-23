import type { FormRow } from '../../db';
import BinyanBlock from './BinyanBlock';

/**
 * Секция «Глагол»: строки делятся на биньяны (в порядке появления
 * форм на странице), каждый биньян — отдельный BinyanBlock.
 */
export default function VerbSection({ rows }: { rows: FormRow[] }) {
  const groups: { binyan: string | null; rows: FormRow[] }[] = [];
  const byName = new Map<string | null, { binyan: string | null; rows: FormRow[] }>();

  for (const row of rows) {
    const key = row.binyan;
    let group = byName.get(key);
    if (!group) {
      group = { binyan: key, rows: [] };
      byName.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return (
    <section className="pos-section">
      <h2 className="pos-title">Глагол</h2>
      {groups.map((g) => (
        <BinyanBlock key={g.binyan ?? '—'} name={g.binyan} rows={g.rows} />
      ))}
    </section>
  );
}
