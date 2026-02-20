@echo off
setlocal

set "EXE_DIR=%~dp0backend\dist\AI Studio"
set "EXE_PATH=%EXE_DIR%\AI Studio.exe"

if not exist "%EXE_PATH%" (
    echo ERROR: Desktop EXE not found: %EXE_PATH%
    echo Build it first with: build_desktop.bat
    pause
    exit /b 1
)

cd /d "%EXE_DIR%"
start "" "AI Studio.exe"
exit
