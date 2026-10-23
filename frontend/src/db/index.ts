/**
 * Единственная точка выбора реализации данных для UI.
 *
 * Чтобы заменить источник (например, на REST API бэкенда), достаточно
 * вернуть здесь другую реализацию Dictionary — остальной код не меняется.
 *
 * Экземпляр один на всё приложение: база (108 МБ) грузится в память
 * один раз, страница поиска и страница канонической формы делят её.
 */
import { createSqliteDictionary } from './sqlite';
import type { Dictionary } from './types';

export type { Dictionary, FormRow } from './types';

let instance: Dictionary | undefined;

export function createDictionary(): Dictionary {
  return (instance ??= createSqliteDictionary());
}
