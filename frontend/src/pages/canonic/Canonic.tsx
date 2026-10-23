import { useEffect, useState } from 'react';
import { createDictionary } from '../../db';
import type { FormRow } from '../../db';
import { Link } from '../../router';
import { orderPosKeys, SECTION_BY_POS } from './sections';
import { UnspecifiedSection } from './stubs';

const dictionary = createDictionary();

type Status =
  | { phase: 'loading' }
  | { phase: 'done'; rows: FormRow[] }
  | { phase: 'error'; message: string };

/** Страница канонической формы: секции по частям речи, внутри verb — биньяны. */
export default function Canonic({ canonical }: { canonical: string }) {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setStatus({ phase: 'loading' });
    dictionary
      .searchByCanonical(canonical)
      .then((rows) => {
        if (!cancelled) setStatus({ phase: 'done', rows });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus({
            phase: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canonical]);

  // Разделение верхнего уровня: строки по части речи (pos).
  const groups = new Map<string, FormRow[]>();
  if (status.phase === 'done') {
    for (const row of status.rows) {
      const key = row.pos ?? '';
      const group = groups.get(key);
      if (group) {
        group.push(row);
      } else {
        groups.set(key, [row]);
      }
    }
  }

  return (
    <main>
      <p className="back">
        <Link to="/">← на главную</Link>
      </p>

      <h1>
        <span className="canon-id">{canonical}</span>
      </h1>

      {status.phase === 'loading' && <p className="status">Загрузка базы…</p>}
      {status.phase === 'error' && <p className="status error">Ошибка: {status.message}</p>}

      {status.phase === 'done' && status.rows.length === 0 && (
        <p className="status">Строк с canonical = «{canonical}» не найдено.</p>
      )}

      {status.phase === 'done' && status.rows.length > 0 && (
        <>
          <section className="canon-info">
            <p className="translation">{status.rows[0].translation}</p>
            {status.rows[0].root && (
              <p className="root">
                корень: <b>{status.rows[0].root}</b>
              </p>
            )}
            {status.rows[0].description && (
              <p className="description">{status.rows[0].description}</p>
            )}
            <p className="status">Форм: {status.rows.length}</p>
          </section>

          {orderPosKeys(groups.keys()).map((pos) => {
            const Section = SECTION_BY_POS[pos];
            const rows = groups.get(pos)!;
            return Section ? (
              <Section key={pos} rows={rows} />
            ) : (
              <UnspecifiedSection key={pos} pos={pos} rows={rows} />
            );
          })}
        </>
      )}
    </main>
  );
}
