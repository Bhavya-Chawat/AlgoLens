@echo off
echo Cleaning up previously running ports (3000, 5173, 5174)...

:: Kill process on port 3000 (Backend)
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :3000') DO (taskkill /F /PID %%T 2>NUL)
:: Kill process on port 5173 (Frontend default)
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5173') DO (taskkill /F /PID %%T 2>NUL)
:: Kill process on port 5174 (Frontend fallback)
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr :5174') DO (taskkill /F /PID %%T 2>NUL)

echo Starting AlgoLens Full-Stack Environment...

:: Start Backend
cd backend
IF NOT EXIST "node_modules\" (
    echo [Backend] node_modules not found. Installing dependencies...
    call npm install
)
echo [Backend] Launching Node.js API server...
start "AlgoLens Backend" cmd /c "npm start"
cd ..

:: Start Frontend
cd frontend
IF NOT EXIST "node_modules\" (
    echo [Frontend] node_modules not found. Installing dependencies...
    call npm install
)
echo [Frontend] Launching React app...
start "AlgoLens Frontend" cmd /c "npm run dev"
cd ..

echo.
echo ========================================================
echo AlgoLens is starting up! 
echo Frontend will be available at: http://localhost:5173
echo Backend API will be available at: http://localhost:3000
echo ========================================================
echo You can close this window at any time.
