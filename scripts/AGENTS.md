# Scripts

Start and stop scripts for running the app in Docker, for Mac/Linux and Windows.

## Files

- `start.sh` / `stop.sh` - Mac/Linux (bash)
- `start.bat` / `stop.bat` - Windows

## What they do

- Start: `docker compose up --build -d` from the project root (loads `.env`), then prints the URL.
- Stop: `docker compose down` from the project root.

The app is served at http://localhost:8000.

## Usage

```bash
# Mac/Linux
./scripts/start.sh
./scripts/stop.sh
```

```bat
REM Windows
scripts\start.bat
scripts\stop.bat
```

Requires Docker (with the Compose plugin) installed and running.