@echo off
REM One-step install for Outreach CRM (Windows). Double-click me.
REM Installs Node packages, builds, then starts the app and opens your browser.
setlocal EnableExtensions
cd /d "%~dp0"
title Outreach CRM - install
echo.
echo  Installing Outreach CRM ...
echo.
where node >nul 2>nul
if errorlevel 1 goto :nonode
call npm ci --no-audit --no-fund
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
if not exist "data" mkdir "data"
echo.
echo  Installed. Next time just double-click start.bat
echo  (Email sending is off until you add your own keys - see SETUP.md.)
echo.
call "%~dp0start.bat"
exit /b 0

:nonode
echo  Node.js 20 or newer was not found.
echo  Install the LTS version from https://nodejs.org/ then double-click install.bat again.
if not defined NO_BROWSER pause
exit /b 1

:fail
echo.
echo  Install failed - see the messages above.
if not defined NO_BROWSER pause
exit /b 1
