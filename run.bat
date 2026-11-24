@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo             Starting SmogWise Locally
echo ===================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js v20 or higher from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check if node_modules exists, install if missing
if not exist "node_modules\" (
    echo [INFO] node_modules folder not found. Installing dependencies...
    call npm install --legacy-peer-deps
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Please inspect the errors above.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
    echo.
)

:: 3. Check for .env file
if not exist ".env" (
    echo [WARNING] No .env file found. Creating default .env file...
    echo GEMINI_API_KEY="" > .env
    echo APP_URL="http://localhost:3000" >> .env
    echo [INFO] Default .env created. You can optionally add your GEMINI_API_KEY in .env.
    echo.
)

:: 4. Start the development server
echo [INFO] Starting SmogWise server on http://localhost:3000 ...
echo [INFO] Opening browser and launching application...
echo [INFO] Press Ctrl+C in this terminal window to stop the server.
echo.

start "" http://localhost:3000

call npm run dev
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] SmogWise stopped unexpectedly with error code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

endlocal
