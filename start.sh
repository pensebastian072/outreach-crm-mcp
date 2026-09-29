#!/usr/bin/env bash
# Start Outreach CRM and open it in your browser. Runs on this computer only (127.0.0.1).
set -euo pipefail
cd "$(dirname "$0")"
[ -f dist/web-server.js ] || exec ./install.sh
export PORT="${PORT:-8080}"
export HOST=127.0.0.1
URL="http://127.0.0.1:$PORT"
up() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; }
openurl() {
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  else echo "Open $URL in your browser"; fi
}
if up; then echo "Port $PORT is already in use - opening $URL"; openurl; exit 0; fi
[ -n "${NO_BROWSER:-}" ] || ( for _ in $(seq 1 240); do if up; then openurl; exit 0; fi; sleep 0.5; done ) &
echo "Starting Outreach CRM at $URL  (Ctrl+C to stop)"
exec npm start
