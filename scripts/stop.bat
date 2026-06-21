@echo off
REM Stop the app (Windows).
cd /d "%~dp0.."
docker compose down
echo App stopped
