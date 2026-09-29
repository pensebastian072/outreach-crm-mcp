#!/usr/bin/env bash
# One-step install for Outreach CRM (macOS / Linux):  ./install.sh   (then ./start.sh next time)
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ not found - install the LTS version from https://nodejs.org/"; exit 1; }
npm ci --no-audit --no-fund
npm run build
mkdir -p data
echo "Installed. Next time just run ./start.sh  (email sending is off until you add your own keys - see SETUP.md)"
exec ./start.sh
