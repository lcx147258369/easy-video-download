#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"
PORT="${PORT:-4318}"

mkdir -p "$RUN_DIR"

find_node_bin() {
  if [ -n "${NVM_BIN:-}" ] && [ -x "${NVM_BIN}/node" ]; then
    printf '%s\n' "$NVM_BIN"
    return 0
  fi

  if [ -x "$HOME/.nvm/versions/node/v22.21.1/bin/node" ]; then
    printf '%s\n' "$HOME/.nvm/versions/node/v22.21.1/bin"
    return 0
  fi

  local latest
  latest="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -path '*/bin/node' 2>/dev/null | sort | tail -1)"
  if [ -n "$latest" ]; then
    dirname "$latest"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    dirname "$(command -v node)"
    return 0
  fi

  return 1
}

NODE_BIN_DIR="$(find_node_bin || true)"
if [ -z "$NODE_BIN_DIR" ]; then
  echo "Unable to locate a usable Node.js installation." >&2
  exit 1
fi

export PATH="$NODE_BIN_DIR:/opt/homebrew/bin:/usr/local/bin:$PATH"
NODE_CMD="$NODE_BIN_DIR/node"
PNPM_CMD="${PNPM_CMD:-$NODE_BIN_DIR/pnpm}"

if [ ! -x "$NODE_CMD" ]; then
  echo "Node executable not found at $NODE_CMD" >&2
  exit 1
fi

if [ ! -x "$PNPM_CMD" ]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm executable not found. Set PNPM_CMD or ensure pnpm is on PATH." >&2
    exit 1
  fi
  PNPM_CMD="$(command -v pnpm)"
fi

server_pid() {
  if [ -f "$PID_FILE" ]; then
    cat "$PID_FILE"
  fi
}

is_running() {
  local pid
  pid="$(server_pid || true)"
  [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

build_app() {
  echo "Building workspace..."
  (cd "$ROOT_DIR" && "$PNPM_CMD" build)
}

start_app() {
  if is_running; then
    echo "Server already running on port ${PORT} (pid $(server_pid))."
    return 0
  fi

  build_app

  echo "Starting server on port ${PORT}..."
  (
    cd "$ROOT_DIR"
    nohup env PATH="$PATH" PORT="$PORT" "$NODE_CMD" apps/server/dist/index.js >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )

  if wait_for_health; then
    echo "Server started successfully."
    echo "URL: http://localhost:${PORT}"
    echo "Log: $LOG_FILE"
    return 0
  fi

  echo "Server did not become healthy in time. Check logs: $LOG_FILE" >&2
  exit 1
}

stop_app() {
  if ! is_running; then
    rm -f "$PID_FILE"
    echo "Server is not running."
    return 0
  fi

  local pid
  pid="$(server_pid)"
  echo "Stopping server pid $pid..."
  kill "$pid" 2>/dev/null || true

  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Server stopped."
      return 0
    fi
    sleep 0.25
  done

  echo "Force killing server pid $pid..."
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Server stopped."
}

show_status() {
  if is_running; then
    echo "Server is running on port ${PORT} (pid $(server_pid))."
    echo "Health: $(curl -fsS "http://127.0.0.1:${PORT}/health" 2>/dev/null || echo 'unreachable')"
  else
    echo "Server is not running."
  fi
}

show_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "No log file found at $LOG_FILE"
    return 0
  fi
  tail -n 200 "$LOG_FILE"
}

case "${1:-restart}" in
  start)
    start_app
    ;;
  stop)
    stop_app
    ;;
  restart)
    stop_app
    start_app
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
