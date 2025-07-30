@echo off
REM filepath: /home/new_username/Documents/projects/redactor/backend/run.bat
setlocal enabledelayedexpansion

REM Court Report Redactor Backend - Startup Script for Windows

echo Starting Court Report Redactor Backend API...

REM Check if we're in the backend directory
if not exist "requirements.txt" (
    echo Error: This script must be run from the backend directory
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo Virtual environment not found. Creating...
    python -m venv venv
    
    if !errorlevel! neq 0 (
        echo Failed to create virtual environment
        pause
        exit /b 1
    )
    
    echo Virtual environment created successfully
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

if !errorlevel! neq 0 (
    echo Failed to activate virtual environment
    pause
    exit /b 1
)

REM Check if dependencies are installed
python -c "import fastapi" >nul 2>&1
if !errorlevel! neq 0 (
    echo Dependencies not installed. Installing...
    pip install -r requirements.txt
    
    if !errorlevel! neq 0 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
    
    echo Dependencies installed successfully
)

REM Optional: Download model on first run
echo Checking if model needs to be downloaded...
python -c "from transformers import AutoTokenizer, AutoModelForTokenClassification; import sys; print('Downloading/verifying model...'); tokenizer = AutoTokenizer.from_pretrained('iiiorg/piiranha-v1-detect-personal-information'); model = AutoModelForTokenClassification.from_pretrained('iiiorg/piiranha-v1-detect-personal-information'); print('Model ready!')" 2>nul
if !errorlevel! neq 0 (
    echo Warning: Could not pre-download model
    echo Model will be downloaded on first use
)

REM Start the server
echo Starting Uvicorn server on http://0.0.0.0:8000
echo API documentation available at http://localhost:8000/docs
echo Press Ctrl+C to stop the server

REM Run uvicorn with auto-reload for development
uvicorn app.main:app --host 0.0.0.0 --port 8000