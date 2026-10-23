/**
 * Реализация Dictionary, отправляющая запросы в Web Worker (worker.ts).
 *
 * На главном потоке — только постановка сообщений и сопоставление
 * ответов с обещаниями; ни скачивание базы, ни десериализация, ни
 * SQL здесь не выполняются.
 */
import { stripNikud } from './nikud';
import type { SearchMethod, SearchRequest, SearchResponse } from './protocol';
import type { Dictionary, FormRow } from './types';

export function createWorkerDictionary(): Dictionary {
  let worker: Worker | undefined;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (rows: FormRow[]) => void; reject: (err: Error) => void }
  >();

  function ensureWorker(): Worker {
    if (worker) return worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    w.onmessage = (e: MessageEvent<SearchResponse>) => {
      const msg = e.data;
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.ok) {
        waiter.resolve(msg.rows);
      } else {
        waiter.reject(new Error(msg.error));
      }
    };

    w.onerror = (e) => {
      // Крах воркера: отклоняем всё ожидающее и убираем его —
      // следующий запрос создаст новый экземпляр.
      const err = new Error(e.message || 'ошибка Web Worker');
      for (const waiter of pending.values()) {
        waiter.reject(err);
      }
      pending.clear();
      w.terminate();
      if (worker === w) {
        worker = undefined;
      }
    };

    worker = w;
    return w;
  }

  function call(method: SearchMethod, arg: string): Promise<FormRow[]> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const req: SearchRequest = { id, method, arg };
      ensureWorker().postMessage(req);
    });
  }

  return {
    searchByNoNikud(query: string): Promise<FormRow[]> {
      return call('searchByNoNikud', stripNikud(query.trim()));
    },
    searchByCanonical(canonical: string): Promise<FormRow[]> {
      return call('searchByCanonical', canonical.trim());
    },
  };
}
