@echo off
REM Start the app (Windows). Builds and runs the Docker container.
cd /d "%~dp0.."
docker compose up --build -d
if %errorlevel% neq 0 exit /b %errorlevel%
echo App running at http://localhost:8000
