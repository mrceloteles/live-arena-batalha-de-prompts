@echo off
cd /d "%~dp0"
set PORT=3000
node src/server/start.mjs
