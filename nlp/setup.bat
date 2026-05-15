@echo off
REM Setup script for NLP Event Extraction service (Windows)

echo Setting up NLP Event Extraction service...

REM Create virtual environment
echo Creating virtual environment...
python -m venv venv

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies (from parent directory where requirements.txt exists)
cd /d "%~dp0.."
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