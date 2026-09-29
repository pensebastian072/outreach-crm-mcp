@echo off
REM Start Outreach CRM and open it in your browser. Runs on this computer only (127.0.0.1).
setlocal EnableExtensions
cd /d "%~dp0"
title Outreach CRM
if not exist "dist\web-server.js" (
  echo  Not installed yet - running install.bat first...
  call "%~dp0install.bat"
  exit /b
)
if not defined PORT set "PORT=8080"
set "HOST=127.0.0.1"
set "URL=http://127.0.0.1:%PORT%"
powershell -NoProfile -Command "try{(New-Object Net.Sockets.TcpClient('127.0.0.1',%PORT%)).Close();exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 (
  echo  Port %PORT% is already in use - opening %URL%
  start "" "%URL%"
  exit /b 0
)
if not defined NO_BROWSER start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 240;$i++){try{(New-Object Net.Sockets.TcpClient('127.0.0.1',%PORT%)).Close();Start-Process '%URL%';exit}catch{Start-Sleep -Milliseconds 500}}"
echo.
echo  Outreach CRM is starting at %URL%
echo  Your browser opens by itself when it is ready. Close this window to stop.
echo.
call npm start
echo.
echo  Outreach CRM stopped.
if not defined NO_BROWSER pause
