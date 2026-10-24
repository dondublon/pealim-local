#!/usr/bin/env python3
"""Заливка предлогов для глаголов в pealim_ru.db (колонка general.prepositions).

Проход по forms_ru.jsonl: на строках pos=verb && form.tense=Инфинитив
глагол (по canonical — один раз) спрашивается у ollama/qwen3.5, и
предлоги пишутся в general.prepositions как JSON.

- счётчик идёт по ВСЕМ строкам jsonl (не только инфинитивам);
- при Ctrl+C номер последней записанной строки сохраняется в
  status_prepositions.txt; повторный запуск продолжает с этой строки;
- canonical, у которых предлоги уже есть в БД, пропускаются.

Запуск (туннель slava-1080-rj:11435 должен быть поднят):
  uv run python llm/fill_prepositions.py [путь-к-forms_ru.jsonl]
"""

import json
import os
import signal
import sqlite3
import sys
import time
import urllib.request

API = "http://localhost:11435/api/chat"
MODEL = "qwen3.5:latest"
DB = "pealim_ru.db"
STATUS_FILE = "status_prepositions.txt"
JSONL = sys.argv[1] if len(sys.argv) > 1 else "forms_ru.jsonl"

PROMPT = """Ты — эксперт по ивриту. Для глагола {verb} перечисли предлоги, которые с ним употребляются в современном иврите.

Значение этого глагола: {translation}.
{disambiguation}Правила:
- только ГОЛЫЕ предлоги (ל, על, אל, מ, ב...) — без местоименных суффиксов (לא עלי/אליה и т.п.)
- 3-5 самых частотных предлогов
- если предлогов вроде бы нет, всё равно приведи один-два возможных с пояснением

Для каждого предлога дай:
- prep: сам предлог на иврите
- example: сочетание «глагол + предлог» на иврите (без огласовок)
- comment: очень короткий русский комментарий к значению (3-6 слов)

Только JSON без пояснений:
{{"verb": "{verb}", "prepositions": [{{"prep": "...", "example": "...", "comment": "..."}}]}}"""

DISAMBIGUATION = (
    "Написание этого глагола НЕОДНОЗНАЧНО: есть и другие глаголы с теми же "
    "буквами, но другим значением. Учитывай ТОЛЬКО указанное значение.\n"
)


def is_ambiguous(con: sqlite3.Connection, no_nikud: str) -> bool:
    """Пишется ли это написание ещё каким-то другим canonical."""
    n = con.execute(
        "SELECT COUNT(DISTINCT canonical) FROM forms WHERE no_nikud = ?",
        (no_nikud,),
    ).fetchone()[0]
    return n > 1


def ask_prepositions(
    verb: str, translation: str, ambiguous: bool
) -> dict | None:
    prompt = PROMPT.format(
        verb=verb,
        translation=translation,
        disambiguation=DISAMBIGUATION if ambiguous else "",
    )
    payload = {
        "model": MODEL,
        "stream": False,
        "think": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {"num_predict": 300},
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        API, json.dumps(payload).encode(), {"Content-Type": "application/json"}
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                d = json.loads(resp.read())
            result = json.loads(d["message"]["content"])
            # модель может вернуть JSON без нужной структуры — не принимаем
            if not isinstance(result.get("prepositions"), list):
                raise ValueError(f"нет списка prepositions: {result}")
            return result
        except Exception as e:
            if attempt == 2:
                print(f"  ОШИБКА запроса ({verb}): {e}", file=sys.stderr)
                return None
            time.sleep(2)
    return None


def main() -> None:
    con = sqlite3.connect(DB)

    # позиция возобновления: номер строки forms_ru.jsonl (1-based)
    resume_after = 0
    if os.path.exists(STATUS_FILE):
        with open(STATUS_FILE, encoding="utf-8") as f:
            resume_after = int(f.read().strip())
        print(f"возобновление после строки {STATUS_FILE}={resume_after}")

    # canonical, у которых предлоги уже в БД (в т.ч. из прошлых запусков)
    done = {
        r[0]
        for r in con.execute(
            "SELECT canonical FROM general WHERE prepositions IS NOT NULL"
        )
    }
    print(f"уже в базе: {len(done)} canonical")

    total = sum(1 for _ in open(JSONL, encoding="utf-8"))
    print(f"строк в {JSONL}: {total}; начинаю со строки {resume_after + 1}")

    n_lines = resume_after  # глобальный счётчик пройденных строк
    n_inf = n_asked = n_written = 0
    last_written = resume_after
    interrupted = False

    def on_sigint(signum, frame):
        nonlocal interrupted
        interrupted = True

    signal.signal(signal.SIGINT, on_sigint)

    t0 = time.time()
    with open(JSONL, encoding="utf-8") as f, con:
        for lineno, line in enumerate(f, 1):
            if interrupted:
                break
            if lineno <= resume_after:
                continue
            n_lines = lineno  # глобальный номер текущей строки
            (word, v), = json.loads(line).items()

            if v.get("pos") != "verb" or (v.get("form") or {}).get("tense") != "Инфинитив":
                continue
            n_inf += 1
            canonical = v["canonical"]
            if canonical in done:
                continue

            # перевод берём из самой строки jsonl — он относится именно к
            # этому canonical (не путаем значения омонимов)
            translation = v["translation"]
            ambiguous = is_ambiguous(con, v["no_nikud"])
            result = ask_prepositions(word, translation, ambiguous)
            if result is None:
                continue  # оставляем на следующий прогон

            con.execute(
                "UPDATE general SET prepositions = ? WHERE canonical = ?",
                (json.dumps(result, ensure_ascii=False), canonical),
            )
            con.commit()
            done.add(canonical)
            n_asked += 1
            n_written += 1
            last_written = lineno

            # счётчик: все пройденные строки + инфинитивы + записи
            elapsed = time.time() - t0
            print(
                f"[стр {n_lines}/{total}] инфинитивов: {n_inf}, "
                f"спрошено: {n_asked}, записано: {n_written} "
                f"({elapsed:.0f} с, {canonical})",
                flush=True,
            )

    # финальная позиция — в статус-файл всегда (и при Ctrl+C, и при конце)
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        f.write(str(last_written))

    print(
        f"\nИтого: строк пройдено {n_lines}, инфинитивов {n_inf}, "
        f"записей {n_written}. Позиция сохранена в {STATUS_FILE} "
        f"({last_written}); в БД предлогов: {len(done)} canonical."
    )
    if interrupted:
        print("Прервано по Ctrl+C — перезапуск продолжит с этой строки.")


if __name__ == "__main__":
    main()
