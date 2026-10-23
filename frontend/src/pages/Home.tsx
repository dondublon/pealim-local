import { useEffect, useState } from 'react';
import { createDictionary } from '../db';
import type { FormRow } from '../db';
import { Link, useLocation } from '../router';

const dictionary = createDictionary();

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; rows: FormRow[]; query: string }
  | { phase: 'error'; message: string };

/**
 * Главная страница: результаты поиска по ?q= в URL.
 * Поле ввода живёт на уровне App (SearchForm) — сюда приходит только
 * готовый запрос.
 */
export default function Home() {
  const { search } = useLocation();
  const q = new URLSearchParams(search).get('q') ?? '';
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  useEffect(() => {
    if (!q) {
      setStatus({ phase: 'idle' });
      return;
    }
    let cancelled = false;
    setStatus({ phase: 'loading' });
    dictionary
      .searchByNoNikud(q)
      .then((rows) => {
        if (!cancelled) setStatus({ phase: 'done', rows, query: q });
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
  }, [q]);

  return (
    <>
      <h1>pealim — поиск по словарю</h1>

      {status.phase === 'idle' && (
        <p className="status">Введите слово — с огласовками или без, и нажмите «Искать».</p>
      )}
      {status.phase === 'loading' && <p className="status">Ищу…</p>}
      {status.phase === 'error' && <p className="status error">Ошибка: {status.message}</p>}

      {status.phase === 'done' && (
        <>
          <p className="status">
            «{status.query}» — найдено строк: {status.rows.length}
            {status.rows.some((r) => r.via_prefix) &&
              ` (из них по профору: ${status.rows.filter((r) => r.via_prefix).length})`}
          </p>
          <ol className="results">
            {status.rows.map((row, i) => (
              <li key={`${row.canonical}|${row.word}|${i}`}>
                <span className="word">{row.word}</span>
                {row.transcription && <span className="transcription"> {row.transcription}</span>}
                {row.via_prefix && (
                  <span className="via-prefix">
                    {row.via_prefix}+{row.no_nikud}
                  </span>
                )}
                <span className="meta">
                  {(() => {
                    const parts = [
                      row.pos,
                      row.binyan,
                      row.no_nikud !== row.word ? row.no_nikud : null,
                    ].filter((p): p is string => Boolean(p));
                    return (
                      <>
                        {parts.length > 0 && <>{parts.join(' · ')} · </>}
                        <Link to={`/canonic/${encodeURIComponent(row.canonical)}`}>
                          {row.canonical}
                        </Link>
                      </>
                    );
                  })()}
                </span>
                {row.form && <span className="form">{JSON.stringify(row.form)}</span>}
                <span className="translation">{row.translation}</span>
                {row.root && (
                  <span className="root">
                    корень: <b>{row.root}</b>
                  </span>
                )}
                {row.description && <span className="description">{row.description}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
