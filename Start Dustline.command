#!/bin/zsh
# Keeps the game attached to this Terminal window; only this launch is recorded.
set -u
export PATH="$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "${0:A:h}" || exit 1
project_dir="$PWD"
port="${PORT:-3000}"
url="http://localhost:$port"
pid_file="$project_dir/.dustline.pid"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print 'Dustline needs Node.js 22.12 or newer, including npm.'
  print 'Install Node.js, then double-click this launcher again.'
  read '?Press Return to close. '
  exit 1
fi
if [[ -f "$pid_file" ]]; then
  existing_pid="$(sed -n '1p' "$pid_file" 2>/dev/null)"
  existing_started="$(sed -n '2p' "$pid_file" 2>/dev/null)"
  if [[ "$existing_pid" == <-> ]] && [[ "$(ps -p "$existing_pid" -o lstart= 2>/dev/null)" == "$existing_started" ]] && [[ -n "$existing_started" ]]; then
    print 'The game already has a running launcher. Its Terminal window contains the server log.'
    if curl -fsS --max-time 2 "$url/health" >/dev/null 2>&1; then open "$url"; fi
    exit 0
  fi
  rm -f -- "$pid_file"
fi
if /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
  print "Port $port is already in use. Stop that server before starting this launcher."
  print "If Dustline is already running, open $url in your browser."
  read '?Press Return to close. '
  exit 1
fi
if [[ ! -d node_modules/tsx || ! -d node_modules/vite ]]; then
  print 'Installing dependencies for the first launch…'
  npm install || { read '?Install failed. Press Return to close. '; exit 1; }
fi
print "Starting Dustline at $url"
print 'Keep this window open. Press Control-C here, or use Stop Dustline.command, to stop.'
PORT="$port" npm run dev &
server_pid=$!
print -r -- "$server_pid" > "$pid_file"
ps -p "$server_pid" -o lstart= >> "$pid_file"
(
  for attempt in {1..60}; do
    kill -0 "$server_pid" 2>/dev/null || exit 0
    if curl -fsS --max-time 1 "$url/health" >/dev/null 2>&1; then
      [[ "${DUSTLINE_NO_OPEN:-0}" == "1" ]] || open "$url"
      exit 0
    fi
    sleep .5
  done
  print "The browser hasn't opened because the server isn't ready. Check the log above."
) &
browser_helper=$!
cleanup() {
  kill "$browser_helper" 2>/dev/null || true
  if [[ -f "$pid_file" ]] && [[ "$(sed -n '1p' "$pid_file" 2>/dev/null)" == "$server_pid" ]]; then
    "$project_dir/Stop Dustline.command" --quiet
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
wait "$server_pid"
