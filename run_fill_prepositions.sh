#!/usr/bin/env bash
# Заливка предлогов для глаголов в pealim_ru.db (llm/fill_prepositions.py).
#
#   ./run_fill_prepositions.sh        # запуск (или возобновление) в фоне
#   tail -f logs/fill_prepositions.log    # ход выполнения
#   kill -INT $(cat logs/fill_prepositions.pid)   # корректная остановка (позиция сохранится)
set -euo pipefail
cd "$(dirname "$0")"

TUNNEL_PID_FILE="logs/tunnel_11435.pid"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

# 1. Туннель к ollama на slava-1080-rj (порт 11435, т.к. 11434 занят локальным ollama)
if ! curl -s --max-time 3 http://localhost:11435/api/tags > /dev/null; then
    echo "туннель к ollama не отвечает — поднимаю..."
    ssh -f -N -L 11435:localhost:11434 slava-1080-rj
    echo $! > "$TUNNEL_PID_FILE"
    sleep 1
    curl -s --max-time 5 http://localhost:11435/api/tags > /dev/null
    echo "туннель поднят"
fi

# 2. Не запускать вторую копию
PID_FILE="$LOG_DIR/fill_prepositions.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "уже запущен (pid $(cat "$PID_FILE")) — см. $LOG_DIR/fill_prepositions.log"
    exit 1
fi

# 3. Фоновый запуск: uv из корня проекта, лог и pid-файл
nohup uv run python llm/fill_prepositions.py \
    > "$LOG_DIR/fill_prepositions.log" 2>&1 &
echo $! > "$PID_FILE"
echo "запущен в фоне: pid $(cat "$PID_FILE"), лог: $LOG_DIR/fill_prepositions.log"
echo "текущая позиция: $(cat status_prepositions.txt 2>/dev/null || echo '0 (начало)')"
