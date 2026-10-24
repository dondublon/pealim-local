#!/usr/bin/env python3
"""Загрузка имен и стран (pos='name') в pealim_ru.db (таблица forms).

Источники:
- israeli_hebrew_names_with_translation.jsonl — человеческие имена:
    {слово: {pos: "name", form: {gender}}, no_nikud, translation}
- countries.csv — страны (колонки: Русский, Иврит_с_огласовками,
  Иврит_без_огласовок); form не заполняется.

Имена и страны грузятся вместе: скрипт идемпотентен как единое целое
(DELETE pos='name' стирает оба типа, затем вставляет заново).
canonical = no_nikud — варианты написания одного имени делят «страницу».
general не трогаем: LEFT JOIN даст пустые root/description.

Запуск: uv run python load_names.py
"""

import csv
import json
import sqlite3

DB = "pealim_ru.db"
NAMES_SRC = "israeli_hebrew_names_with_translation.jsonl"
COUNTRIES_SRC = "countries.csv"


def load_names() -> list[tuple]:
    rows = []
    with open(NAMES_SRC, encoding="utf-8") as f:
        for line in f:
            obj = json.loads(line)
            word = next(k for k in obj if k not in ("no_nikud", "translation"))
            meta = obj[word]
            form = meta.get("form")
            rows.append(
                (
                    word,
                    meta.get("pos", "name"),
                    json.dumps(form, ensure_ascii=False) if form else None,
                    obj["no_nikud"],
                    obj["translation"],
                )
            )
    return rows


def load_countries() -> list[tuple]:
    rows = []
    with open(COUNTRIES_SRC, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            rows.append(
                (
                    r["Иврит_с_огласовками"].strip(),
                    "name",
                    None,
                    r["Иврит_без_огласовок"].strip(),
                    r["Русский"].strip(),
                )
            )
    return rows


def main() -> None:
    names = load_names()
    countries = load_countries()
    rows = names + countries

    con = sqlite3.connect(DB)
    con.execute("PRAGMA busy_timeout = 10000")  # фоновая заливка предлогов тоже пишет в БД
    with con:
        # идемпотентность: сначала убираем прошлую загрузку (имена + страны)
        con.execute("DELETE FROM forms WHERE pos = 'name'")
        con.executemany(
            """
            INSERT INTO forms
                (word, pos, binyan, canonical, no_nikud, form, transcription, translation)
            VALUES (?, ?, NULL, ?, ?, ?, NULL, ?)
            """,
            # порядок: word, pos, canonical=no_nikud, no_nikud, form, translation
            [(w, pos, nn, nn, form, tr) for w, pos, form, nn, tr in rows],
        )
    n = con.execute("SELECT count(*) FROM forms WHERE pos = 'name'").fetchone()[0]
    uniq = con.execute(
        "SELECT count(DISTINCT canonical) FROM forms WHERE pos = 'name'"
    ).fetchone()[0]
    print(f"загружено строк pos=name: {n} (уникальных canonical: {uniq})")
    print(f"  имен: {len(names)}, стран: {len(countries)}")
    con.close()


if __name__ == "__main__":
    main()
