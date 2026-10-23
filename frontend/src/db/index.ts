/**
 * Единственная точка выбора реализации данных для UI.
 *
 * Чтобы заменить источник (например, на REST API бэкенда), достаточно
 * вернуть здесь другую реализацию Dictionary — остальной код не меняется.
 */
import { createSqliteDictionary } from './sqlite';
import type { Dictionary } from './types';

export type { Dictionary, FormRow } from './types';

export function createDictionary(): Dictionary {
  return createSqliteDictionary();
}
