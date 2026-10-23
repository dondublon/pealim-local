"""Загрузка forms_ru.jsonl + forms_general_ru.jsonl в SQLite (pealim_ru.db).

Схема:
  general  — canonical (PK, ключ файла), root (≤6), description (≤512)
  forms    — id (surrogate PK), слово и все поля формы;
             индексы: canonical, pos, no_nikud (неуникальные)
"""

import json
import os
import sqlite3

DB = "pealim_ru.db"
FORMS_JSONL = "forms_ru.jsonl"
GENERAL_JSONL = "forms_general_ru.jsonl"
BATCH = 50_000

FORMS_INSERT = (
    "INSERT INTO forms (word, pos, binyan, canonical, no_nikud, form, "
    "transcription, translation) VALUES (?,?,?,?,?,?,?,?)"
)


def build_schema(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE general (
            canonical   TEXT PRIMARY KEY,
            root        TEXT NOT NULL DEFAULT '' CHECK (length(root) <= 6),
            description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 512)
        );

        CREATE TABLE forms (
            id            INTEGER PRIMARY KEY,
            word          TEXT NOT NULL,
            pos           TEXT,
            binyan        TEXT,
            canonical     TEXT NOT NULL,
            no_nikud      TEXT NOT NULL,
            form          TEXT,
            transcription TEXT,
            translation   TEXT NOT NULL
        );
        """
    )


def load_general(con: sqlite3.Connection) -> int:
    rows = []
    with open(GENERAL_JSONL, encoding="utf-8") as f:
        for line in f:
            (canonical, v), = json.loads(line).items()
            rows.append((canonical, v["root"], v["description"]))
    con.executemany("INSERT INTO general VALUES (?,?,?)", rows)
    return len(rows)


def load_forms(con: sqlite3.Connection) -> int:
    n = 0
    batch = []
    with open(FORMS_JSONL, encoding="utf-8") as f:
        for line in f:
            (word, v), = json.loads(line).items()
            batch.append(
                (
                    word,
                    v.get("pos"),
                    v.get("binyan"),
                    v["canonical"],
                    v["no_nikud"],
                    json.dumps(v["form"], ensure_ascii=False) if "form" in v else None,
                    v.get("transcription"),
                    v["translation"],
                )
            )
            if len(batch) >= BATCH:
                con.executemany(FORMS_INSERT, batch)
                n += len(batch)
                batch = []
    if batch:
        con.executemany(FORMS_INSERT, batch)
        n += len(batch)
    return n


def main() -> None:
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)

    build_schema(con)
    n_gen = load_general(con)
    n_forms = load_forms(con)

    # индексы после загрузки — быстрее, чем при вставке
    con.executescript(
        """
        CREATE INDEX idx_forms_canonical ON forms(canonical);
        CREATE INDEX idx_forms_pos        ON forms(pos);
        CREATE INDEX idx_forms_no_nikud   ON forms(no_nikud);
        """
    )
    con.commit()
    con.execute("VACUUM")
    con.close()

    print(f"general: {n_gen} строк")
    print(f"forms:   {n_forms} строк")
    print(f"{DB}: {os.path.getsize(DB) / 1e6:.1f} МБ")


if __name__ == "__main__":
    main()
