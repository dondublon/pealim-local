import { useEffect, useState } from 'react';
import { createDictionary } from '../db';
import type { FormRow } from '../db';
import { Link } from '../router';

const dictionary = createDictionary();

type Status =
  | { phase: 'loading' }
  | { phase: 'done'; rows: FormRow[] }
  | { phase: 'error'; message: string };

/**
 * Страница слова: все формы одного canonical
 * (корень/перевод/примечание — общие для страницы, показываются один раз).
 */
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

          <ol className="results">
            {status.rows.map((row, i) => (
              <li key={`${row.word}|${i}`}>
                <span className="word">{row.word}</span>
                {row.transcription && <span className="transcription"> {row.transcription}</span>}
                <span className="meta">
                  {[row.pos, row.binyan, row.no_nikud !== row.word ? row.no_nikud : null]
                    .filter((p): p is string => Boolean(p))
                    .join(' · ')}
                </span>
                {row.form && <span className="form">{JSON.stringify(row.form)}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
