#!/bin/zsh
# Stops only the process tree recorded by Start Dustline.command.
set -u
cd -- "${0:A:h}" || exit 1
pid_file="$PWD/.dustline.pid"
[[ -f "$pid_file" ]] || { [[ "${1:-}" == '--quiet' ]] || print 'No server started by this launcher is running.'; exit 0; }
server_pid="$(sed -n '1p' "$pid_file" 2>/dev/null)"
started="$(sed -n '2p' "$pid_file" 2>/dev/null)"
actual_started="$(ps -p "$server_pid" -o lstart= 2>/dev/null)"
process_dir="$(/usr/sbin/lsof -a -p "$server_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
process_command="$(ps -p "$server_pid" -o command= 2>/dev/null)"
if [[ "$server_pid" != <-> || -z "$started" || "$actual_started" != "$started" || "$process_dir" != "$PWD" || "$process_command" != *'npm run dev'* ]]; then
  # Never terminate an unrelated process if a stale PID was reused.
  rm -f -- "$pid_file"
  [[ "${1:-}" == '--quiet' ]] || print 'The recorded game process has already stopped. No other process was touched.'
  exit 0
fi
stop_tree() {
  local process_id="$1"
  local child
  for child in $(pgrep -P "$process_id" 2>/dev/null); do stop_tree "$child"; done
  kill -TERM "$process_id" 2>/dev/null || true
}
stop_tree "$server_pid"
rm -f -- "$pid_file"
[[ "${1:-}" == '--quiet' ]] || print 'Dustline stopped.'
