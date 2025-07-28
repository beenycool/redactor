@echo off
echo Starting Court Report Redactor Application...
echo ==========================================
echo.

echo Starting Backend Server...
cd backend
start "Redactor Backend" cmd /k "python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo.
echo Starting Frontend Server...
cd ..\frontend
start "Redactor Frontend" cmd /k "npm run dev"

echo.
echo ==========================================
echo Both servers are starting up...
echo.
echo Backend will be available at: http://localhost:8000
echo Frontend will be available at: http://localhost:3000
echo.
echo Please wait a few seconds for both servers to fully start.
echo You can close this window once both servers are running.
echo ==========================================

REM Window will remain open until user closes it manually