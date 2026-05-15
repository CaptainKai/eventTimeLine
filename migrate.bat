@echo off
REM Set PostgreSQL client encoding to UTF-8
chcp 65001
set PGCLIENTENCODING=UTF8

echo Running database migration with UTF-8 encoding...
echo.

REM Run the fixed SQL file
psql -U postgres -d timeline -f sql\003_events_model_fixed.sql

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Migration completed successfully!
) else (
    echo.
    echo Migration failed with error code: %ERRORLEVEL%
)

pause
