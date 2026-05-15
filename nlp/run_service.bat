@echo off
REM Run script for NLP Event Extraction service (Windows)

set SCRIPT_DIR=%~dp0

REM Check if virtual environment exists
if not exist "%SCRIPT_DIR%venv" (
    echo Virtual environment not found. Running setup...
    call "%SCRIPT_DIR%setup.bat"
    goto :eof
)

REM Default port
set PORT=%1
if "%PORT%"=="" set PORT=5001
set HOST=%2
if "%HOST%"=="" set HOST=127.0.0.1

REM Activate venv
call "%SCRIPT_DIR%venv\Scripts\activate.bat"

REM Change to parent directory (eventTimeLine root) where nlp package is
cd /d "%SCRIPT_DIR%.."

echo Starting NLP service on %HOST%:%PORT%...
python -m nlp.service --port %PORT% --host %HOST%