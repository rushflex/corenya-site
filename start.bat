@echo off
title Corenya Vanilla - Site
cd /d "%~dp0"
echo.
echo   Corenya Vanilla sitesi baslatiliyor...
echo   Tarayici: http://localhost:3000
echo.
start "" "http://localhost:3000"
node server.js
pause
