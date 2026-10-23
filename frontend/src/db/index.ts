/**
 * Единственная точка выбора реализации данных для UI.
 *
 * Чтобы заменить источник (например, на REST API бэкенда), достаточно
 * вернуть здесь другую реализацию Dictionary — остальной код не меняется.
 *
 * Экземпляр один на всё приложение; сама база при этом живёт в Web
 * Worker (worker.ts) — главный поток не блокируется ни её загрузкой,
 * ни запросами.
 */
import type { Dictionary } from './types';
import { createWorkerDictionary } from './workerClient';

export type { Dictionary, FormRow } from './types';

let instance: Dictionary | undefined;

export function createDictionary(): Dictionary {
  return (instance ??= createWorkerDictionary());
}
