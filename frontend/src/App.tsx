import { useState } from 'react';
import { createDictionary } from './db';
import type { FormRow } from './db';

const dictionary = createDictionary();

type Status =
  | { phase: 'idle' }
  | { phase: 'loading' } // первый поиск: грузится wasm + база
  | { phase: 'searching' }
  | { phase: 'done'; rows: FormRow[]; query: string }
  | { phase: 'error'; message: string };

function rowKey(row: FormRow, i: number): string {
  // Ключ строки результата: одинаковых (word, canonical) может быть несколько
  return `${row.canonical}|${row.word}|${i}`;
}

export default function App() {
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
        <button type="submit" disabled={status.phase === 'loading' || status.phase === 'searching'}>
          Искать
        </button>
      </form>

      {status.phase === 'loading' && (
        <p className="status">Загрузка базы (≈108 МБ, первый поиск)…</p>
      )}
      {status.phase === 'searching' && <p className="status">Ищу…</p>}
      {status.phase === 'error' && <p className="status error">Ошибка: {status.message}</p>}

      {status.phase === 'done' && (
        <>
          <p className="status">
            «{status.query}» — найдено строк: {status.rows.length}
          </p>
          <ol className="results">
            {status.rows.map((row, i) => (
              <li key={rowKey(row, i)}>
                <span className="word">{row.word}</span>
                {row.transcription && <span className="transcription"> {row.transcription}</span>}
                <span className="meta">
                  {[
                    row.pos,
                    row.binyan,
                    row.canonical,
                    row.no_nikud !== row.word ? row.no_nikud : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {row.form && <span className="form">{JSON.stringify(row.form)}</span>}
                <span className="translation">{row.translation}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
