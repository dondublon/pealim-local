#!/usr/bin/env python3
"""Бенчмарк скорости ollama на разных моделях/настройках для задачи «предлоги глагола»."""

import json
import sys
import time
import urllib.request

API = "http://localhost:11435/api/chat"

PROMPT = (
    "Ты — эксперт по ивриту. Для глагола לספר перечисли предлоги, которые с ним "
    "употребляются. Для каждого: prep (иврит), example (глагол+предлог), "
    "comment (русский, 3-6 слов). Только JSON: "
    '{"verb":"...","prepositions":[{"prep":"...","example":"...","comment":"..."}]}'
)


def bench(model: str, extra: dict, label: str, prompt: str = PROMPT) -> None:
    payload = {
        "model": model,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
        **extra,
    }
    req = urllib.request.Request(
        API, json.dumps(payload).encode(), {"Content-Type": "application/json"}
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            d = json.loads(resp.read())
    except Exception as e:
        print(f"{label:35s} ОШИБКА: {e}")
        return
    wall = time.time() - t0
    content = d.get("message", {}).get("content", "")
    ev = d.get("eval_count") or 0
    ev_dur = (d.get("eval_duration") or 1) / 1e9
    prompt_dur = (d.get("prompt_eval_duration") or 0) / 1e9
    ok = "JSON✓" if _valid_json(content) else "JSON✗"
    print(
        f"{label:35s} {ok} итог={wall:5.1f}s | prompt={prompt_dur:4.1f}s "
        f"gen={ev_dur:5.1f}s ({ev:4d} ток, {ev / ev_dur:5.1f} т/с)"
    )


def _valid_json(s: str) -> bool:
    try:
        json.loads(s)
        return True
    except Exception:
        return False


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"

    if which in ("all", "1"):
        bench("qwen3.5:latest", {"think": False, "format": "json"}, "qwen3.5 think=false json")
    if which in ("all", "2"):
        bench("qwen3:8b", {"think": False, "format": "json"}, "qwen3:8b think=false json")
    if which in ("all", "3"):
        bench(
            "qwen3.5:latest",
            {"think": False, "format": "json", "options": {"num_ctx": 2048, "num_predict": 300}},
            "qwen3.5 +num_ctx2048 +npred300",
        )
    if which in ("all", "4"):
        bench("dicta-il/DictaLM-3.0-1.7B-Thinking:latest", {"format": "json"}, "dicta-1.7B json")
