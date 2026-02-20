@echo off
setlocal

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } ^| Select-Object -First 1 -ExpandProperty IPAddress)"`) do set LAN_IP=%%i
if "%LAN_IP%"=="" set LAN_IP=localhost

echo Starting Backend on http://0.0.0.0:8000 ...
start "AI Studio Backend" /D "backend" cmd /k "python main.py"

echo Starting Frontend on http://0.0.0.0:5173 ...
start "AI Studio Frontend" /D "frontend" cmd /k "npm run dev"

echo Waiting for services to start...
timeout /t 5 >nul

echo.
echo Desktop URL: http://localhost:5173
echo Phone URL:   http://%LAN_IP%:5173
echo.

echo Opening Desktop URL in browser...
start http://localhost:5173

echo Done.
endlocal
exit
