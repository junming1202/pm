from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# Directory containing the built Next.js static export, served at "/".
# Populated by the Docker build (frontend "out/" is copied here).
# May be absent during local backend-only development.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Project Management MVP")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


# Serve the static site at "/". Mounted last so /api routes take precedence.
# Skipped when the export is not present (e.g. local backend-only dev).
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
