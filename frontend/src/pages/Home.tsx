import { useState } from 'react';
import { createDictionary } from '../db';
import type { FormRow } from '../db';
import { Link } from '../router';

const dictionary = createDictionary();

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' } // первый поиск: грузится wasm + база
  | { phase: 'done'; rows: FormRow[]; query: string }
  | { phase: 'error'; message: string };

export default function Home() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus({ phase: 'loading' });
    try {
      const rows = await dictionary.searchByNoNikud(q);
      setStatus({ phase: 'done', rows, query: q });
    } catch (err) {
      setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <main>
      <h1>pealim — поиск по словарю</h1>

      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Слово без огласовок, например: אב"
          dir="auto"
          autoFocus
        />
        <button type="submit" disabled={status.phase === 'loading'}>
          Искать
        </button>
      </form>

      {status.phase === 'loading' && (
        <p className="status">Загрузка базы (≈108 МБ, первый запрос)…</p>
      )}
      {status.phase === 'error' && <p className="status error">Ошибка: {status.message}</p>}

      {status.phase === 'done' && (
        <>
          <p className="status">
            «{status.query}» — найдено строк: {status.rows.length}
          </p>
          <ol className="results">
            {status.rows.map((row, i) => (
              <li key={`${row.canonical}|${row.word}|${i}`}>
                <span className="word">{row.word}</span>
                {row.transcription && <span className="transcription"> {row.transcription}</span>}
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
    </main>
  );
}
