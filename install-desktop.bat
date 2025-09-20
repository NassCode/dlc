@echo off
echo Installing Deep Live Cam Desktop App...
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Install npm dependencies
echo Installing dependencies...
npm install

:: Check if OBS Studio is installed (optional for virtual camera)
echo.
echo Checking for OBS Studio installation...
if exist "C:\Program Files\obs-studio\bin\64bit\obs64.exe" (
    echo ✓ OBS Studio found - Virtual camera backend available
) else if exist "C:\Program Files (x86)\obs-studio\bin\32bit\obs32.exe" (
    echo ✓ OBS Studio found - Virtual camera backend available
) else (
    echo ⚠ OBS Studio not found - Virtual camera will use mock mode
    echo   For full virtual camera functionality:
    echo   1. Install OBS Studio from https://obsproject.com/
    echo   2. Start OBS Virtual Camera manually when using the app
)

echo.
echo Installation complete!
echo.
echo To start the desktop app, run: npm start
echo To build executable, run: npm run build
echo.
pause