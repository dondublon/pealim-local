#!/usr/bin/env python3
"""Проставление рода существительных в forms_ru.jsonl.

Для каждого canonical с pos='noun' запрашивается страница слова на
pealim.com; род берётся из первого <p> после заголовка («Существительное
– …, мужской род») и записывается во ВСЕ строки этого canonical.

Род кладётся в верхнеуровневое поле gender, а не в form: внутри form
существительных с местоименными окончаниями ключ gender уже занят
(там — род владельца окончания).

Особенности:
- кеш noun_genders.json → повторный запуск докидывает только недостающее;
- запись атомарная (tmp + rename): fill_prepositions.py читает этот файл
  прямо сейчас, инкрементальная перезапись на месте сломала бы его
  чтение (rename не мешает — старый inode остаётся у читателя);
- не-noun строки проходят в файл байт-в-байт.

Запуск: uv run python add_gender.py [лимит страниц для отладки]
"""

import asyncio
import json
import os
import sys
import time

import httpx
from bs4 import BeautifulSoup

SRC = "forms_ru.jsonl"
CACHE = "noun_genders.json"
BASE = "https://www.pealim.com/ru/dict/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; pealim-dict-scraper/0.1)"}
CONCURRENCY = 6

MALE, FEMALE = "Мужской род", "Женский род"


def _gender_from_text(txt: str) -> str | None:
    m, f = txt.find("мужской род"), txt.find("женский род")
    if m < 0 and f < 0:
        return None
    if m >= 0 and (f < 0 or m <= f):
        return MALE
    return FEMALE


def parse_gender(html: str) -> str | None:
    """Род: сначала первый <p> («Существительное – …, мужской род»),
    иначе — любой другой <p> на странице. Заголовки таблиц (th) не
    смотрим: там «мужской род» — род владельца окончания, не существительного."""
    soup = BeautifulSoup(html, "lxml")
    h2 = soup.select_one("h2.page-header")
    if h2 is None:
        return None
    p = h2.find_next_sibling("p")
    if p is not None:
        g = _gender_from_text(p.get_text(" ", strip=True))
        if g:
            return g
    for para in soup.find_all("p"):
        g = _gender_from_text(para.get_text(" ", strip=True))
        if g:
            return g
    return None


def collect_noun_canonicals(path: str) -> list[str]:
    """Уникальные canonical с pos='noun' в порядке появления."""
    seen: dict[str, None] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            (_, v), = json.loads(line).items()
            if v.get("pos") == "noun":
                seen.setdefault(v["canonical"])
    return list(seen)


async def fetch_genders(canons: list[str], cache: dict) -> tuple[int, list[str]]:
    """Запрос страниц; возвращает (сколько запросов, список неудач/без рода)."""
    sem = asyncio.Semaphore(CONCURRENCY)
    no_gender: list[str] = []
    errors: list[str] = []
    done_count = 0

    async def one(client: httpx.AsyncClient, canon: str) -> None:
        nonlocal done_count
        async with sem:
            for attempt in range(4):
                try:
                    r = await client.get(BASE + canon + "/")
                    r.raise_for_status()  # 429/5xx не считаем «без рода»
                    g = parse_gender(r.text)
                    # null кешируется: страница действительно без рода,
                    # переспрашивать её не будем; ошибки не кешируем
                    cache[canon] = g
                    if g is None:
                        no_gender.append(canon)
                    break
                except Exception:
                    if attempt == 3:
                        errors.append(canon)
                    else:
                        await asyncio.sleep(3 * (attempt + 1))
            done_count += 1
            if done_count % 100 == 0:
                print(f"  запрошено {done_count}/{len(canons)}", flush=True)
            await asyncio.sleep(0.1)  # мягче к сайту

    t0 = time.time()
    async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as client:
        await asyncio.gather(*(one(client, c) for c in canons))
    print(f"  запросов: {len(canons)}, {time.time() - t0:.0f} с")
    print(f"  без рода (кешировано null): {len(no_gender)}", no_gender[:10])
    print(f"  ошибок сети (будут повторены): {len(errors)}", errors[:10])
    return len(canons), errors


def load_cache() -> dict:
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict) -> None:
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=0)


def rewrite(genders: dict) -> tuple[int, int]:
    """Атомарно переписать forms_ru.jsonl, проставив gender у noun-строк."""
    tmp = SRC + ".tmp"
    n_added = n_skip = 0
    with open(SRC, encoding="utf-8") as fin, open(tmp, "w", encoding="utf-8") as fout:
        for line in fin:
            raw = line.rstrip("\n")
            (word, val), = json.loads(raw).items()
            if val.get("pos") == "noun" and "gender" not in val:
                g = genders.get(val["canonical"])
                if g:
                    new_val = {}
                    for k, v in val.items():
                        new_val[k] = v
                        if k == "pos":
                            new_val["gender"] = g
                    fout.write(json.dumps({word: new_val}, ensure_ascii=False) + "\n")
                    n_added += 1
                    continue
                n_skip += 1
            # не-noun (и уже проставленные) — байт-в-байт, без пересериализации
            fout.write(raw + "\n")
    os.replace(tmp, SRC)
    return n_added, n_skip


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None

    canons = collect_noun_canonicals(SRC)
    print(f"уникальных canonical с pos=noun: {len(canons)}")

    cache = load_cache()
    todo = [c for c in canons if c not in cache]
    if limit:
        todo = todo[:limit]
    print(f"в кеше: {len(cache)}, к запросу: {len(todo)}")

    if todo:
        _, failed = asyncio.run(fetch_genders(todo, cache))
        save_cache(cache)
        print(f"без рода/ошибок: {len(failed)}", failed[:10])

    missing = [c for c in canons if c not in cache]
    print(f"осталось без рода: {len(missing)}", missing[:10])

    added, skipped = rewrite(cache)
    print(f"проставлено gender: {added} строк; не покрыто (нет данных): {skipped}")


if __name__ == "__main__":
    main()
