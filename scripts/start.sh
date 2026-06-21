#!/usr/bin/env bash
# Start the app (Mac/Linux). Builds and runs the Docker container.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up --build -d
echo "App running at http://localhost:8000"
