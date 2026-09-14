@echo off
setlocal
cd /d "%~dp0backend"

echo.
echo ============================================
echo   Fleet Parlour AI Office Manager
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not available in PATH.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run detected. Installing backend dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting AI Office Manager on http://localhost:3000/office/
echo The Website is available from the last menu option inside it.
echo Keep this window open while using the system.
echo.
start "" "http://localhost:3000/office/"
call npm start

endlocal
