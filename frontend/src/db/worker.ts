/**
 * Web Worker: загрузка pealim_ru.db и SQL-запросы (sql.js, WASM).
 *
 * Всё, что раньше блокировало главный поток, теперь выполняется здесь:
 * скачивание 108 МБ, десериализация базы в кучу WASM и синхронные
 * запросы к ней. Главный поток только отправляет/принимает сообщения.
 */
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { prefixExtras } from './prefixes';
import type { SearchMethod, SearchRequest, SearchResponse } from './protocol';
import type { FormRow } from './types';

const DB_URL = '/pealim_ru.db';

const SQL: Record<SearchMethod, string> = {
  searchByNoNikud: `
    SELECT f.word, f.pos, f.binyan, f.canonical, f.no_nikud, f.form,
           f.transcription, f.translation,
           g.root, g.description
    FROM forms f
    LEFT JOIN general g ON g.canonical = f.canonical
    WHERE f.no_nikud = ?
  `,
  searchByCanonical: `
    SELECT f.word, f.pos, f.binyan, f.canonical, f.no_nikud, f.form,
           f.transcription, f.translation,
           g.root, g.description
    FROM forms f
    LEFT JOIN general g ON g.canonical = f.canonical
    WHERE f.canonical = ?
    ORDER BY f.id
  `,
};

function toFormRow(r: Record<string, unknown>): FormRow {
  return {
    word: r.word as string,
    pos: (r.pos as string) ?? null,
    binyan: (r.binyan as string) ?? null,
    canonical: r.canonical as string,
    no_nikud: r.no_nikud as string,
    form: r.form ? (JSON.parse(r.form as string) as Record<string, string>) : null,
    transcription: (r.transcription as string) ?? null,
    translation: r.translation as string,
    root: (r.root as string) ?? '',
    description: (r.description as string) ?? '',
  };
}

let dbPromise: Promise<Database> | null = null;

async function loadDb(): Promise<Database> {
  const SQLjs = await initSqlJs({ locateFile: () => wasmUrl });
  const resp = await fetch(DB_URL);
  if (!resp.ok) {
    throw new Error(`не удалось загрузить ${DB_URL}: HTTP ${resp.status}`);
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());
  return new SQLjs.Database(bytes);
}

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = loadDb().catch((err) => {
      // не отравливаем кеш ошибкой: повторим загрузку при следующем запросе
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Воркерный контекст: типизируем минимально, чтобы не смешивать
// библиотеки DOM и WebWorker в tsconfig.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SearchRequest>) => void) | null;
  postMessage(message: SearchResponse): void;
};

function queryRows(db: Database, sql: string, arg: string): FormRow[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind([arg]);
    const rows: FormRow[] = [];
    while (stmt.step()) {
      rows.push(toFormRow(stmt.getAsObject() as Record<string, unknown>));
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/** Поиск no_nikud: точное совпадение + строки по профору (если запрос с профором). */
function searchByNoNikud(db: Database, query: string): FormRow[] {
  const exact = queryRows(db, SQL.searchByNoNikud, query);
  const extras = prefixExtras(query, (rest) =>
    queryRows(db, SQL.searchByNoNikud, rest),
  );
  return [...exact, ...extras];
}

ctx.onmessage = (e) => {
  const { id, method, arg } = e.data;
  void (async () => {
    try {
      const db = await getDb();
      const rows =
        method === 'searchByNoNikud'
          ? searchByNoNikud(db, arg)
          : queryRows(db, SQL[method], arg);
      ctx.postMessage({ id, ok: true, rows });
    } catch (err) {
      ctx.postMessage({
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
};
