from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# Directory containing the built/static frontend served at "/".
# In Part 3 this is replaced by the Next.js static export.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Project Management MVP")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


# Serve the static site at "/". Mounted last so /api routes take precedence.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
