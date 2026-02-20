@echo off
setlocal

set "EXE_DIR=%~dp0backend\dist\AI Studio"
set "EXE_PATH=%EXE_DIR%\AI Studio.exe"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\AI Studio.lnk"
set "ENV_SRC=%~dp0.env"

if not exist "%EXE_PATH%" (
    echo ERROR: AI Studio.exe not found at %EXE_PATH%
    echo Please build the project first using: cd backend ^&^& pyinstaller ai_studio.spec --noconfirm
    pause
    exit /b 1
)

REM Copy .env next to EXE for portable API key access
if exist "%ENV_SRC%" (
    copy /Y "%ENV_SRC%" "%EXE_DIR%\.env" >nul
    echo Copied .env to portable build folder.
)

echo Creating desktop shortcut...
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
    "$s.TargetPath = '%EXE_PATH%'; " ^
    "$s.WorkingDirectory = '%EXE_DIR%'; " ^
    "$s.Description = 'AI Studio Desktop'; " ^
    "$s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo Shortcut created on Desktop: AI Studio
    echo You can now launch AI Studio from your Desktop!
) else (
    echo ERROR: Failed to create shortcut.
)

echo.
pause

