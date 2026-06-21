# syntax=docker/dockerfile:1

# Stage 1: build the Next.js static export.
FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend that serves the API and the static frontend.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app

# Install dependencies first for better layer caching.
COPY backend/pyproject.toml ./
RUN uv sync --no-dev

# Copy the application.
COPY backend/app ./app

# Copy the built frontend into the static directory served at "/".
COPY --from=frontend /frontend/out ./static

EXPOSE 8000

CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
