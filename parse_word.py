"""Разбор страницы слова pealim.com → JSONL-строки (одна строка = одна форма)."""

import json
import re
import sys

import httpx
from bs4 import BeautifulSoup
from bs4.element import NavigableString

POS_MAP = {
    "Существительное": "noun",
    "Прилагательное": "adjective",
    "Глагол": "verb",
    "Наречие": "adverb",
    "Предлог": "preposition",
    "Местоимение": "pronoun",
    "Числительное": "numeral",
    "Количественное числительное": "numeral",
    "Союз": "conjunction",
    "Частица": "particle",
    "Междометие": "interjection",
}

# Подписи форм со страниц → ключи в form (значения остаются как на сайте)
LABEL_KEYS = {
    "Единственное число": "number",
    "Множественное число": "number",
    "Единственное": "number",
    "Множественное": "number",
    "Единственное число владельцев": "num_owners",
    "Множественное число владельцев": "num_owners",
    "Мужской род": "gender",
    "Женский род": "gender",
    "1-е лицо": "person",
    "2-е лицо": "person",
    "3-е лицо": "person",
    "Будущее время": "tense",
    "Прошедшее время": "tense",
    "Настоящее время / причастие": "tense",
    "Повелительное наклонение": "tense",
    "Инфинитив": "tense",
    "Абсолютное состояние": "state",
    "Сопряженное состояние": "state",
    "Без местоименных окончаний": "suffixes",
}


def clean(s: str) -> str:
    """Убрать невидимые символы (RTL mark и т.п.)."""
    return re.sub(r"[​-‏﻿]", "", s).strip()


def strip_nikud(w: str) -> str:
    """Снять знаки огласовок/ударения, сохранив буквы и маqaf (־)."""
    return "".join(
        ch for ch in w
        if not (0x0591 <= ord(ch) <= 0x05C7 and ord(ch) != 0x05BE)
    )


def labels_to_form(labels: list[str]) -> dict:
    """Подписи формы → dict {ключ: подпись}; неизвестные подписи — на stderr."""
    form: dict = {}
    for lab in labels:
        key = LABEL_KEYS.get(lab)
        if key is None:
            print(f"WARN: неизвестная подпись формы: {lab!r}", file=sys.stderr)
            continue
        form[key] = lab
    return form


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
            if re.fullmatch(r"[123]-е", txt):
                # значения столбца «Лицо»: «1-е» → «1-е лицо»
                hdr = next(
                    (clean(grid[(hr, c)].get_text(" ", strip=True))
                     for hr in range(thead_rows) if (hr, c) in grid),
                    "",
                )
                if "Лицо" in hdr:
                    txt += " лицо"
            if txt and txt not in labels:
                labels.append(txt)
    return labels


def transcription_text(el) -> str:
    """Текст транскрипции; после ударной гласной (выделена <b>) — апостроф."""
    parts = []
    for child in el.children:
        if isinstance(child, NavigableString):
            parts.append(str(child))
        elif getattr(child, "name", None) == "b":
            parts.append(clean(child.get_text()) + "'")
    return re.sub(r"\s+", "", "".join(parts)).rstrip("!").strip()


def cell_forms(cell) -> list[tuple[list[str], str]]:
    """Все формы ячейки: (варианты слова, транскрипция).

    В одной ячейке сайта может быть несколько форм (альтернативы,
    «В разговорном языке», поповеры) — у каждой свой menukad и своя
    транскрипция. Вариант после '~' идёт сразу после menukad и делят
    с ним транскрипцию.
    """
    forms: list[tuple[list[str], str]] = []
    words: list[str] = []
    tr = ""
    opened = False

    def flush() -> None:
        nonlocal words, tr, opened
        if opened and words:
            forms.append((words, tr))
        words, tr, opened = [], "", False

    for el in cell.select("span.menukad, span.chaser, .transcription"):
        classes = el.get("class") or []
        if "menukad" in classes:
            flush()
            w = clean(el.get_text(strip=True)).rstrip("!").strip()
            words = [w] if w else []
            opened = bool(words)
        elif opened and "chaser" in classes:
            t = clean(el.get_text(strip=True))
            if t.startswith("~"):
                v = t.lstrip("~").strip()
                if v:
                    words.append(v)
        elif opened and "transcription" in classes and not tr:
            tr = transcription_text(el)
            flush()
    flush()
    return forms


def table_forms(table) -> list[tuple[str, list[str], str]]:
    """(слово, подпись формы, транскрипция) для всех ячеек одной таблицы."""
    grid, thead_rows = build_grid(table)
    # Таблица с местоименными окончаниями: столбцы «Единственное/Множественное
    # число» — это число владельцев (окончания), а не число самого существительного
    possessive = any(
        clean(th.get_text(" ", strip=True)) == "Число существительного"
        for th in table.select("thead th")
    )
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
        col_labs = column_labels(grid, thead_rows, c, c1)
        if possessive:
            col_labs = [
                lab + " владельцев" if lab in ("Единственное число", "Множественное число") else lab
                for lab in col_labs
            ]
        labels = col_labs + row_labels(grid, thead_rows, r, c)
        for words, tr in cell_forms(cell):
            for w in words:
                out.append((w, labels, tr))
    return out


def parse_general(html: str) -> dict:
    """Корень и примечания страницы: {"root": ..., "description": ...}.

    Корень — из <p> «Корень: א - ב - ב» (без никкуда и разделителей).
    Примечания — абзацы между первым <p> (часть речи) и первым h3,
    склеенные через пустую строку. Отсутствующие значения — "".
    """
    soup = BeautifulSoup(html, "lxml")
    h2 = soup.select_one("h2.page-header")
    root, notes = "", []
    if h2:
        seen_pos = False
        for el in h2.find_all_next():
            if el.name == "h3":
                break
            if el.name != "p":
                continue
            txt = clean(el.get_text(" ", strip=True))
            if not seen_pos:
                seen_pos = True  # первый <p> — часть речи, не примечание
                continue
            if txt.startswith("Корень:"):
                mk = el.select_one("span.menukad")
                raw = mk.get_text(strip=True) if mk else txt.removeprefix("Корень:").strip()
                root = re.sub(r"\s*-\s*", "", strip_nikud(raw))
            elif txt:
                notes.append(txt)
    return {"root": root, "description": "\n\n".join(notes)}


def lemma_from_h2(h2) -> str:
    """Лемма из заголовка: убрать префиксы и ссылку на сайт."""
    h2 = BeautifulSoup(str(h2), "lxml").find("h2")  # копия, чтобы не портить оригинал
    span = h2.select_one("span.visible-print-inline")
    if span:
        span.decompose()
    txt = clean(h2.get_text(" ", strip=True))
    return re.sub(r"^(Формы слова|Спряжение глагола)\s+", "", txt).strip()


def parse_page(html: str, canonical: str = "") -> list[str]:
    soup = BeautifulSoup(html, "lxml")

    lead = soup.select_one("div.lead")
    translation = clean(lead.get_text(" ", strip=True)) if lead else ""

    # pos=None — сайт не указал часть речи (יֵשׁ, אֵין: «–»), ключ не добавляем
    pos = None
    h2 = soup.select_one("h2.page-header")
    if h2:
        p = h2.find_next_sibling("p")
        if p:
            txt = clean(p.get_text(" ", strip=True))
            if txt and txt not in ("–", "-", "—"):
                name = re.split(r"\s+[–—-]\s+", txt, maxsplit=1)[0].strip()
                if name:
                    pos = POS_MAP.get(name, name.lower())

    lines: list[str] = []
    seen: set = set()

    def emit(word: str, labels: list[str] | None, tr: str, binyan: str | None = None) -> None:
        key = (word, tuple(labels) if labels else (), binyan)
        if key in seen:
            return
        seen.add(key)
        val: dict = {}
        if pos:
            val["pos"] = pos
        if binyan:
            val["binyan"] = binyan
        val["canonical"] = canonical
        val["no_nikud"] = strip_nikud(word)
        if labels is not None:
            val["form"] = labels_to_form(labels)
        if tr:
            val["transcription"] = tr
        val["translation"] = translation
        lines.append(json.dumps({word: val}, ensure_ascii=False))

    # Основная форма вне таблицы: div после заголовка «Форма …» (ед. ч.)
    # — предлоги, יֵשׁ, אֵין и т.п. (у «Формы …» (мн. ч.) внутри таблицы)
    for h3 in soup.find_all("h3"):
        title = clean(h3.get_text(" ", strip=True))
        if not title.startswith("Форма "):
            continue
        sib = next((s for s in h3.next_siblings if getattr(s, "name", None)), None)
        if sib is None or sib.name != "div":
            continue
        label = title.removeprefix("Форма ").strip()
        label = label[0].upper() + label[1:] if label else title
        for words, tr in cell_forms(sib):
            for w in words:
                emit(w, [label], tr)

    # Таблицы форм (в т.ч. биньяны глагола)
    section = ""
    for el in soup.find_all(["h3", "table"]):
        if el.name == "h3":
            section = clean(el.get_text(" ", strip=True))
            continue
        if "conjugation-table" not in (el.get("class") or []):
            continue
        m = re.search(r"Биньян\s+(\S+)", section)
        binyan = m.group(1) if m else None
        for word, labels, tr in table_forms(el):
            emit(word, labels, tr, binyan)

    # Страницы без таблиц форм (союзы и т.п.): лемма без ключа form.
    # Предпочитаем menukad из div.lead (там же транскрипция), иначе h2.
    if not lines and h2:
        lemma, tr = "", ""
        for ld in soup.select("div.lead"):
            if ld.select_one("span.menukad"):
                forms = cell_forms(ld)
                if forms:
                    words, tr = forms[0]
                    lemma = words[0]
                    break
        if not lemma:
            lemma = lemma_from_h2(h2)
        if lemma:
            emit(lemma, None, tr)
    return lines


def main() -> None:
    for url in sys.argv[1:]:
        r = httpx.get(url, timeout=30, follow_redirects=True,
                      headers={"User-Agent": "Mozilla/5.0 (compatible; pealim-dict-scraper/0.1)"})
        r.raise_for_status()
        canonical = url.rstrip("/").rsplit("/", 1)[-1]
        for line in parse_page(r.text, canonical):
            print(line)


if __name__ == "__main__":
    main()
