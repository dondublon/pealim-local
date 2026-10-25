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
import type { FormRow, PrepositionEntry } from './types';

const DB_URL = '/pealim_ru.db';

const SELECT_COLUMNS = `
    SELECT f.word, f.pos, f.binyan, f.canonical, f.no_nikud, f.form,
           f.transcription, f.translation,
           g.root, g.description, g.prepositions, g.gender
    FROM forms f
    LEFT JOIN general g ON g.canonical = f.canonical
`;

const SQL: Record<SearchMethod, string> = {
  searchByNoNikud: `${SELECT_COLUMNS} WHERE f.no_nikud = ?`,
  searchByCanonical: `${SELECT_COLUMNS} WHERE f.canonical = ? ORDER BY f.id`,
};

/** general.prepositions — JSON {"verb":…, "prepositions":[…]}; разбираем в список. */
function parsePrepositions(raw: unknown): PrepositionEntry[] | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { prepositions?: unknown })?.prepositions;
    return Array.isArray(list) && list.length > 0 ? (list as PrepositionEntry[]) : null;
  } catch {
    return null;
  }
}

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
    gender: (r.gender as string) ?? null,
    prepositions: parsePrepositions(r.prepositions),
  };
}

let dbPromise: Promise<Database> | null = null;

async function loadDb(): Promise<Database> {
  const SQLjs = await initSqlJs({ locateFile: () => wasmUrl });
  // no-store: всегда брать актуальный файл — воркер живёт одну вкладку,
  // а БД меняется на лету (заливка предлогов); кеш браузера дал бы снапшот.
  const resp = await fetch(DB_URL, { cache: 'no-store' });
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
