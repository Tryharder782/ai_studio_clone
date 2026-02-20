@echo off
setlocal

set "ROOT=%~dp0"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_DIR=%ROOT%backend"
set "EXE_DIR=%BACKEND_DIR%\dist\AI Studio"

echo [1/5] Installing backend dependencies...
cd /d "%BACKEND_DIR%"
python -m pip install -r requirements.txt
if errorlevel 1 goto :fail

echo [2/5] Installing frontend dependencies...
cd /d "%FRONTEND_DIR%"
if exist package-lock.json (
  npm ci
  if errorlevel 1 (
    echo npm ci failed, retrying with npm install...
    npm install
  )
) else (
  npm install
)
if errorlevel 1 goto :fail

echo [3/5] Building frontend...
call npm run build
if errorlevel 1 goto :fail

echo [4/5] Building desktop EXE (PyInstaller)...
cd /d "%BACKEND_DIR%"
python -m PyInstaller ai_studio.spec --noconfirm --clean
if errorlevel 1 goto :fail

echo [5/5] Finalizing portable files...
if exist "%ROOT%.env" (
  copy /Y "%ROOT%.env" "%EXE_DIR%\.env" >nul
)

echo.
echo Build completed.
echo EXE: %EXE_DIR%\AI Studio.exe
echo.
exit /b 0

:fail
echo.
echo Build failed. See error output above.
exit /b 1
