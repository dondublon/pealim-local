#!/usr/bin/env python3
"""Примеры: получить от ollama предлоги для глаголов в JSON.

Перевод глагола берётся из pealim_ru.db (чтобы модель попала в нужный
смысл однокоренных слов), модель — qwen3.5 (think off, format json).

Запуск (при поднятом туннеле slava-1080-rj:11435):
  uv run python llm/try_prepositions.py [лагол...]   # по умолчанию — набор примеров
"""

import json
import sqlite3
import sys
import time
import urllib.request

API = "http://localhost:11435/api/chat"
MODEL = "qwen3.5:latest"
DB = "pealim_ru.db"

EXAMPLES = ["לספר", "ללכת", "לחשוב", "לשבת", "להבין"]

PROMPT = """Ты — эксперт по ивриту. Для глагола {verb} (значения: {translation}) перечисли предлоги, которые с ним употребляются в современном иврите.

Правила:
- только ГОЛЫЕ предлоги (ל, על, אל, מ, ב...) — без местоименных суффиксов (не עלי/אליה и т.п.)
- 3-5 самых частотных предлогов
- если предлогов вроде бы нет, всё равно приведи один-два возможных с пояснением

Для каждого предлога дай:
- prep: сам предлог на иврите
- example: сочетание «глагол + предлог» на иврите (без огласовок)
- comment: очень короткий русский комментарий к значению (3-6 слов)

Только JSON без пояснений:
{{"verb": "{verb}", "prepositions": [{{"prep": "...", "example": "...", "comment": "..."}}]}}"""


def lookup_translation(verb: str) -> str:
    """Перевод(ы) глагола: все значения со страниц, где он есть, через точку с запятой."""
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT DISTINCT translation FROM forms WHERE no_nikud = ?", (verb,)
    ).fetchall()
    return "; ".join(r[0] for r in rows[:3])


def ask_prepositions(verb: str, translation: str) -> dict | None:
    payload = {
        "model": MODEL,
        "stream": False,
        "think": False,
        "format": "json",
        "keep_alive": "30m",  # не выгружать модель между запросами
        "options": {"num_predict": 300},
        "messages": [{"role": "user", "content": PROMPT.format(verb=verb, translation=translation)}],
    }
    req = urllib.request.Request(
        API, json.dumps(payload).encode(), {"Content-Type": "application/json"}
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as resp:
        d = json.loads(resp.read())
    wall = time.time() - t0
    content = d.get("message", {}).get("content", "")
    try:
        result = json.loads(content)
    except json.JSONDecodeError:
        print(f"  [{wall:.1f}s] НЕ-PARСИТСЯ:\n{content}", file=sys.stderr)
        return None
    print(f"  [{wall:.1f}s] ok, предлогов: {len(result.get('prepositions', []))}")
    return result


def main() -> None:
    verbs = sys.argv[1:] or EXAMPLES
    results = []
    for verb in verbs:
        translation = lookup_translation(verb)
        print(f"{verb} (перевод: {translation or '—'})")
        r = ask_prepositions(verb, translation)
        if r:
            results.append(r)
            print(json.dumps(r, ensure_ascii=False, indent=1))

    print(f"\n=== Итого: {len(results)}/{len(verbs)} глаголов ===")


if __name__ == "__main__":
    main()
