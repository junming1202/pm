#!/usr/bin/env bash
# Stop the app (Mac/Linux).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose down
echo "App stopped"
