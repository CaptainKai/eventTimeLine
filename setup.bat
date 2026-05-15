@echo off
REM Setup script for NLP Event Extraction service (Windows)

set SCRIPT_DIR=%~dp0

echo Setting up NLP Event Extraction service...

REM Change to parent directory (eventTimeLine root) where requirements.txt is
cd /d "%SCRIPT_DIR%.."

REM Create virtual environment in nlp directory
echo Creating virtual environment...
python -m venv nlp\venv

REM Activate virtual environment
call nlp\venv\Scripts\activate.bat

REM Install dependencies
echo Installing Python dependencies...
pip install -r nlp\requirements.txt

REM Download spaCy English model
echo Downloading spaCy English model (en_core_web_sm)...
python -m spacy download en_core_web_sm

echo.
echo Setup complete!
echo.
echo To start the service, run:
echo   nlp\run_service.bat

pause