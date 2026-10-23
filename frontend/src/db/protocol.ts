import type { FormRow } from './types';

/** Методы поиска, доступные воркеру. */
export type SearchMethod = 'searchByNoNikud' | 'searchByCanonical';

/** Запрос главный поток → воркер. arg — уже нормализованное значение. */
export interface SearchRequest {
  id: number;
  method: SearchMethod;
  arg: string;
}

/** Ответ воркер → главный поток. */
export type SearchResponse =
  | { id: number; ok: true; rows: FormRow[] }
  | { id: number; ok: false; error: string };
