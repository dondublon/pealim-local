"""Прогон parse_word по URL из list_first.txt → два JSONL с одного прохода.

  out_path          — формы (parse_page)
  out_path c «general_» после «forms» — корень и примечания (parse_general)
"""

import asyncio
import json
import sys

import httpx

from parse_word import parse_general, parse_page

CONCURRENCY = 6
TIMEOUT = 30.0
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; pealim-dict-scraper/0.1)"}


def load_urls(path: str, limit: int | None = None) -> list[str]:
    urls = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            word, url = line.split(";", 1)
            urls.append(url)
            if limit and len(urls) >= limit:
                break
    return urls


def general_path(out_path: str) -> str:
    """forms_ru.jsonl → forms_general_ru.jsonl"""
    return out_path.replace("forms", "forms_general", 1)


async def fetch(client, url, sem, stat) -> tuple[list[str], str]:
    canonical = url.rstrip("/").rsplit("/", 1)[-1]
    async with sem:
        for attempt in range(3):
            try:
                r = await client.get(url)
                r.raise_for_status()
                lines = parse_page(r.text, canonical)
                gen = json.dumps({canonical: parse_general(r.text)}, ensure_ascii=False)
                stat["ok"] += 1
                if not lines:
                    stat["empty"] += 1
                    print(f"  ПУСТО: {url}", file=sys.stderr)
                return lines, gen
            except Exception as e:
                if attempt == 2:
                    stat["fail"] += 1
                    print(f"  ОШИБКА {url}: {e}", file=sys.stderr)
                    return [], ""
                await asyncio.sleep(2 * (attempt + 1))
    return [], ""


async def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != "all" else None
    out_path = sys.argv[2] if len(sys.argv) > 2 else "forms.jsonl"
    gen_path = general_path(out_path)

    urls = load_urls("list_first.txt", limit)
    print(f"URL к обработке: {len(urls)}")

    stat = {"ok": 0, "fail": 0, "empty": 0}
    sem = asyncio.Semaphore(CONCURRENCY)
    results: list[tuple[list[str], str]] = [None] * len(urls)

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        async def worker(i: int, url: str) -> None:
            results[i] = await fetch(client, url, sem, stat)
            if (stat["ok"] + stat["fail"]) % 20 == 0:
                print(f"прогресс: {stat['ok'] + stat['fail']}/{len(urls)}")

        await asyncio.gather(*(worker(i, u) for i, u in enumerate(urls)))

    total = gen_total = 0
    with open(out_path, "w", encoding="utf-8") as f, open(gen_path, "w", encoding="utf-8") as g:
        for lines, gen in results:
            for line in lines:
                f.write(line + "\n")
                total += 1
            if gen:
                g.write(gen + "\n")
                gen_total += 1

    print(f"\nГотово: ok={stat['ok']}, fail={stat['fail']}, пустых={stat['empty']}, "
          f"строк форм={total} -> {out_path}, "
          f"строк general={gen_total} -> {gen_path}")


if __name__ == "__main__":
    asyncio.run(main())
