"""Сбор первичного списка слов словаря pealim.com: каноническая форма;URL."""

import asyncio
import sys

import httpx
from bs4 import BeautifulSoup

BASE = "https://www.pealim.com"
START_PAGE = 1
CONCURRENCY = 6
TIMEOUT = 30.0


def parse_page(html: str) -> list[tuple[str, str]]:
    """Возвращает пары (слово, url) со страницы словаря."""
    soup = BeautifulSoup(html, "lxml")
    pairs = []
    for a in soup.select("span.dict-lemma a[href]"):
        word_el = a.select_one("span.menukad")
        word = word_el.get_text(strip=True) if word_el else a.get_text(strip=True)
        href = a["href"]
        if word and href.startswith("/ru/dict/"):
            pairs.append((word, BASE + href))
    return pairs


def total_pages(html: str) -> int:
    soup = BeautifulSoup(html, "lxml")
    last = 1
    for a in soup.select(".pagination a[href]"):
        href = a.get("href", "")
        if "page=" in href:
            try:
                last = max(last, int(href.split("page=")[1]))
            except ValueError:
                pass
    return last


async def fetch(client: httpx.AsyncClient, page: int) -> list[tuple[str, str]]:
    url = f"{BASE}/ru/dict/?page={page}"
    for attempt in range(3):
        try:
            r = await client.get(url)
            r.raise_for_status()
            return parse_page(r.text)
        except Exception as e:
            if attempt == 2:
                print(f"  ошибка на странице {page}: {e}", file=sys.stderr)
                return []
            await asyncio.sleep(2 * (attempt + 1))
    return []


async def main() -> None:
    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        headers={"User-Agent": "Mozilla/5.0 (compatible; pealim-dict-scraper/0.1)"},
        follow_redirects=True,
    ) as client:
        first = await client.get(f"{BASE}/ru/dict/?page={START_PAGE}")
        first.raise_for_status()
        pages = total_pages(first.text)
        print(f"Всего страниц: {pages}")

        seen: dict[str, str] = {}
        sem = asyncio.Semaphore(CONCURRENCY)

        async def worker(p: int) -> None:
            async with sem:
                pairs = await fetch(client, p)
                for word, url in pairs:
                    seen.setdefault(word, url)
                print(f"стр. {p}/{pages}: +{len(pairs)} (всего {len(seen)})")

        # Первую страницу берём из уже скачанного HTML
        for word, url in parse_page(first.text):
            seen.setdefault(word, url)
        print(f"стр. 1/{pages}: из кэша ({len(seen)})")

        await asyncio.gather(*(worker(p) for p in range(2, pages + 1)))

    with open("list_first.txt", "w", encoding="utf-8") as f:
        for word, url in seen.items():
            f.write(f"{word};{url}\n")
    print(f"\nГотово: {len(seen)} слов -> list_first.txt")


if __name__ == "__main__":
    asyncio.run(main())
