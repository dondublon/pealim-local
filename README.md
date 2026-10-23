# pealim-scraper

Скрапинг словаря [pealim.com](https://www.pealim.com/ru/dict/) (язык ru) →
JSONL → SQLite → веб-поиск по формам слов.

## Файлы данных

| Файл | Что это |
|---|---|
| `list_first.txt` | первичный список: `слово;URL` (9186 канонических страниц) |
| `forms_ru.jsonl` | все формы слов: `форма → {pos, binyan, canonical, no_nikud, form, transcription, translation}` |
| `forms_general_ru.jsonl` | по каждому canonical: `корень` и `примечание` |
| `pealim_ru.db` | SQLite: таблицы `forms` (327k строк) и `general`, индексы по `canonical`/`pos`/`no_nikud` |

## Python-скрипты (зависимости через uv)

```bash
# 1. сбор первичного списка со страниц списка словаря (622 стр.) → list_first.txt
uv run python scrape_dict.py

# 2. разбор одной страницы слова в stdout (отладка парсера)
uv run python parse_word.py https://www.pealim.com/ru/dict/4216-ev/

# 3. обход всех URL из list_first.txt → оба JSONL одним проходом
uv run python run_parse.py all forms_ru.jsonl      # полный прогон
uv run python run_parse.py 100 forms_test.jsonl    # тестовый (100 URL)

# 4. пересборка БД из JSONL (создаёт pealim_ru.db заново)
uv run python build_db.py
```

Порядок обновления данных: `scrape_dict` → `run_parse` → `build_db`.

## Фронтенд (`frontend/`, TypeScript + React + Vite)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck (tsc) + production-сборка
```

- Поиск по полю `no_nikud` (запрос можно вводить с огласовками — они снимаются).
- `/canonic/<canonical>` — все формы слова: глаголы таблицей, разбивкой по
  биньянам (по образцу pealim), остальные части речи — секции-заглушки.
- SQLite работает в браузере через sql.js (WASM) **в Web Worker** — загрузка
  108-мегабайтной базы и запросы не блокируют главный поток; воркер ленивый
  (создаётся при первом поиске). База отдаётся dev-сервером по симлинку
  `frontend/public/pealim_ru.db` → `../pealim_ru.db`.
- Доступ к данным изолирован в `frontend/src/db/` (интерфейс `Dictionary`);
  для замены на REST-бэкенд достаточно поменять `frontend/src/db/index.ts`.
