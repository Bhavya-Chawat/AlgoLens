@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js 20 or newer is required: https://nodejs.org
    pause
    exit /b 1
)

echo Freeing ports 3000, 5173 and 5174 if a previous AlgoLens is still listening...
for %%P in (3000 5173 5174) do (
    for /f "tokens=5" %%T in ('netstat -a -n -o ^| findstr /R /C:":%%P .*LISTENING"') do taskkill /F /PID %%T >nul 2>nul
)

:: Dependencies (the frontend's install also copies the Python runtime next to the app)
if not exist "backend\node_modules\" (
    echo [Backend] Installing dependencies...
    pushd backend
    call npm install
    popd
)
if not exist "frontend\node_modules\" (
    echo [Frontend] Installing dependencies...
    pushd frontend
    call npm install
    popd
)

:: Java and C++ run in a Docker sandbox; Python and JavaScript do not need it
docker info >nul 2>nul
if errorlevel 1 (
    echo.
    echo [Note] Docker is not running or not installed. Python and JavaScript work without it.
    echo        For Java and C++ install and start Docker Desktop, then run them from the app.
    echo.
)

echo Starting AlgoLens...
where wt >nul 2>nul
if errorlevel 1 (
    start "AlgoLens Backend" /d "%~dp0backend" cmd /k "npm start"
    start "AlgoLens Frontend" /d "%~dp0frontend" cmd /k "npm run dev"
) else (
    wt -d "%~dp0backend" cmd /k "title AlgoLens Backend && npm start" ; new-tab -d "%~dp0frontend" cmd /k "title AlgoLens Frontend && npm run dev"
)

echo.
echo ========================================================
echo AlgoLens is starting up!
echo App:         http://localhost:5173
echo Backend API: http://localhost:3000  (this computer only)
echo ========================================================
echo You can close this window at any time.
