#!/usr/bin/env bash
# IELTS Radar 服务运维管理脚本
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/data/server.pid"
LOG_FILE="$DIR/data/server.log"

mkdir -p "$DIR/data"

status() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "🟢 IELTS Radar 正在运行中 (PID: $PID, 端口: 3000)"
      echo "👉 访问地址: http://localhost:3000"
      return 0
    else
      echo "⚠️ 记录的 PID ($PID) 已失效"
      rm -f "$PID_FILE"
      return 1
    fi
  else
    # 检查 3000 端口占用
    PORT_PID=$(lsof -ti :3000 || true)
    if [ -n "$PORT_PID" ]; then
      echo "🟢 端口 3000 上有服务正在运行 (PID: $PORT_PID)"
      echo "👉 访问地址: http://localhost:3000"
      return 0
    else
      echo "⚪ IELTS Radar 未运行"
      return 1
    fi
  fi
}

start() {
  if status > /dev/null 2>&1; then
    echo "⚠️ 服务已在运行中，无需重复启动。"
    status
    return 0
  fi

  echo "🚀 正在后台启动 IELTS Radar 服务..."
  nohup node "$DIR/server.js" >> "$LOG_FILE" 2>&1 &
  PID=$!
  echo $PID > "$PID_FILE"
  sleep 1

  if ps -p "$PID" > /dev/null 2>&1; then
    echo "✅ 服务启动成功 (PID: $PID)"
    echo "👉 访问地址: http://localhost:3000"
    echo "📋 日志文件: $LOG_FILE"
  else
    echo "❌ 启动失败，请检查日志: $LOG_FILE"
    exit 1
  fi
}

stop() {
  echo "🛑 正在停止 IELTS Radar 服务..."
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      kill "$PID" || true
      rm -f "$PID_FILE"
      echo "✅ 服务已停止 (PID: $PID)"
      return 0
    fi
    rm -f "$PID_FILE"
  fi

  # 备用杀 3000 端口
  PORT_PID=$(lsof -ti :3000 || true)
  if [ -n "$PORT_PID" ]; then
    kill "$PORT_PID" || true
    echo "✅ 端口 3000 对应进程 ($PORT_PID) 已停止"
  else
    echo "⚪ 服务未在运行"
  fi
}

restart() {
  stop
  sleep 1
  start
}

case "$1" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    restart
    ;;
  status)
    status
    ;;
  *)
    echo "用法: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
