/**
 * Реализация Dictionary поверх SQLite (sql.js — SQLite, скомпилированный
 * в WebAssembly). База pealim_ru.db отдаётся dev-сервером из public/,
 * целиком загружается в память вкладки при первом запросе.
 */
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Dictionary, FormRow } from './types';

const DB_URL = '/pealim_ru.db';

/** Снять огласовки (U+0591–U+05C7), сохранив буквы и маqaf (־). */
function stripNikud(word: string): string {
  let out = '';
  for (const ch of word) {
    const cp = ch.codePointAt(0) ?? 0;
    const isNikud = cp >= 0x0591 && cp <= 0x05c7 && cp !== 0x05be;
    if (!isNikud) out += ch;
  }
  return out;
}

const SELECT_COLUMNS = `
  SELECT f.word, f.pos, f.binyan, f.canonical, f.no_nikud, f.form,
         f.transcription, f.translation,
         g.root, g.description
  FROM forms f
  LEFT JOIN general g ON g.canonical = f.canonical
`;

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

export function createSqliteDictionary(): Dictionary {
  // Ленивая инициализация: первый поиск = загрузка wasm + 108 МБ базы.
  let dbPromise: Promise<Database> | undefined;

  async function loadDb(): Promise<Database> {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const resp = await fetch(DB_URL);
    if (!resp.ok) {
      throw new Error(`не удалось загрузить ${DB_URL}: HTTP ${resp.status}`);
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return new SQL.Database(bytes);
  }

  function getDb(): Promise<Database> {
    dbPromise ??= loadDb();
    return dbPromise;
  }

  async function runSql(sql: string, params: string[]): Promise<FormRow[]> {
    const db = await getDb();
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: FormRow[] = [];
      while (stmt.step()) {
        rows.push(toFormRow(stmt.getAsObject() as Record<string, unknown>));
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  return {
    searchByNoNikud(query: string): Promise<FormRow[]> {
      return runSql(`${SELECT_COLUMNS} WHERE f.no_nikud = ?`, [
        stripNikud(query.trim()),
      ]);
    },

    searchByCanonical(canonical: string): Promise<FormRow[]> {
      // id — surrogate PK в порядке загрузки = порядке форм на странице
      return runSql(`${SELECT_COLUMNS} WHERE f.canonical = ? ORDER BY f.id`, [
        canonical.trim(),
      ]);
    },
  };
}
