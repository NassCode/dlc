@echo off
echo Testing Optimized Deep Live Cam Streaming
echo.
echo This will start the Electron app with optimized streaming enabled.
echo The optimized version includes:
echo - WebSocket-based streaming instead of HTTP polling
echo - Binary frame transfer instead of base64 conversion
echo - Adaptive frame rate control
echo - Real-time performance monitoring
echo - Direct browser streaming for testing
echo.

echo Starting optimized version...
npm run dev -- --optimized

pause