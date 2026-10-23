"""Разбор страницы слова pealim.com → JSONL-строки (одна строка = одна форма)."""

import json
import re
import sys

import httpx
from bs4 import BeautifulSoup

POS_MAP = {
    "Существительное": "noun",
    "Прилагательное": "adjective",
    "Глагол": "verb",
    "Наречие": "adverb",
    "Предлог": "preposition",
    "Местоимение": "pronoun",
    "Числительное": "numeral",
    "Союз": "conjunction",
    "Частица": "particle",
    "Междометие": "interjection",
}


def clean(s: str) -> str:
    """Убрать невидимые символы (RTL mark и т.п.)."""
    return re.sub(r"[​-‏﻿]", "", s).strip()


def build_grid(table) -> tuple[dict, int]:
    """Развернуть таблицу в сетку (r, c) -> ячейка. Возвращает сетку и число строк thead."""
    grid: dict = {}
    thead_rows = 0
    r = 0
    for tr in table.find_all("tr"):
        if tr.find_parent("thead") is not None:
            thead_rows += 1
        c = 0
        for cell in tr.find_all(["th", "td"], recursive=False):
            while (r, c) in grid:
                c += 1
            cs = int(cell.get("colspan", 1))
            rs = int(cell.get("rowspan", 1))
            for dr in range(rs):
                for dc in range(cs):
                    grid.setdefault((r + dr, c + dc), cell)
            c += cs
        r += 1
    return grid, thead_rows


def column_labels(grid: dict, thead_rows: int, c0: int, c1: int) -> list[str]:
    """Заголовки столбцов (уровни thead) для диапазона столбцов ячейки.

    Уровень с несколькими разными подписями (ячейка охватывает несколько
    подстолбцов) опускается — подпись становится неоднозначной.
    """
    levels: dict[int, set[str]] = {}
    for (rr, cc), cell in grid.items():
        if rr < thead_rows and c0 <= cc <= c1:
            txt = clean(cell.get_text(" ", strip=True))
            if txt:
                levels.setdefault(rr, set()).add(txt)
    labels: list[str] = []
    for rr in sorted(levels):
        if len(levels[rr]) == 1:
            labels.extend(levels[rr])
    return labels


def row_labels(grid: dict, thead_rows: int, r: int, c0: int) -> list[str]:
    """Заголовки строк (th в tbody слева от ячейки), без повторов."""
    labels: list[str] = []
    for c in range(c0):
        cell = grid.get((r, c))
        if cell is not None and cell.name == "th":
            txt = clean(cell.get_text(" ", strip=True))
            if txt and txt not in labels:
                labels.append(txt)
    return labels


def cell_words(td) -> list[str]:
    """Слова ячейки: вариант с никкудом + вариант после '~' (если есть)."""
    words = []
    mk = td.select_one("span.menukad")
    if mk:
        w = clean(mk.get_text(strip=True)).rstrip("!").strip()
        if w:
            words.append(w)
    ch = td.select_one("span.chaser")
    if ch:
        t = clean(ch.get_text(strip=True))
        if t.startswith("~"):
            v = t.lstrip("~").strip()
            if v:
                words.append(v)
    return words


def table_forms(table) -> list[tuple[str, list[str]]]:
    """(слово, подпись формы) для всех ячеек одной conjugation-таблицы."""
    grid, thead_rows = build_grid(table)
    out = []
    seen = set()
    for (r, c), cell in sorted(grid.items()):
        if r < thead_rows or cell.name != "td" or id(cell) in seen:
            continue
        seen.add(id(cell))
        # границы ячейки: от первого до последнего её столбца
        c1 = c
        while grid.get((r, c1 + 1)) is cell:
            c1 += 1
        # порядок: сначала столбцы, потом строка
        labels = column_labels(grid, thead_rows, c, c1) + row_labels(grid, thead_rows, r, c)
        for w in cell_words(cell):
            out.append((w, labels))
    return out


def parse_page(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")

    lead = soup.select_one("div.lead")
    translation = clean(lead.get_text(" ", strip=True)) if lead else ""

    pos = "unknown"
    h2 = soup.select_one("h2.page-header")
    if h2:
        p = h2.find_next_sibling("p")
        if p:
            txt = clean(p.get_text(" ", strip=True))
            name = re.split(r"\s+[–—-]\s+", txt, maxsplit=1)[0].strip()
            pos = POS_MAP.get(name, name.lower())

    lines = []
    section = ""
    for el in soup.find_all(["h3", "table"]):
        if el.name == "h3":
            section = clean(el.get_text(" ", strip=True))
            continue
        if "conjugation-table" not in (el.get("class") or []):
            continue
        m = re.search(r"Биньян\s+(\S+)", section)
        binyan = m.group(1) if m else None
        for word, labels in table_forms(el):
            val: dict = {"pos": pos}
            if binyan:
                val["binyan"] = binyan
            val["form"] = labels
            val["translation"] = translation
            lines.append(json.dumps({word: val}, ensure_ascii=False))
    return lines


def main() -> None:
    for url in sys.argv[1:]:
        r = httpx.get(url, timeout=30, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; pealim-dict-scraper/0.1)"})
        r.raise_for_status()
        for line in parse_page(r.text):
            print(line)


if __name__ == "__main__":
    main()
