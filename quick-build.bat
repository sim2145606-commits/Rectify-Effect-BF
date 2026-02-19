@echo off
echo ========================================
echo VirtuCam Quick Builder (Expo Method)
echo ========================================
echo.

echo This will build and install VirtuCam on your connected device.
echo Make sure USB debugging is enabled and device is connected.
echo.
pause

echo [1/2] Installing dependencies...
call npm install
echo.

echo [2/2] Building and installing...
echo This may take 5-10 minutes on first build.
echo.
npx expo run:android --variant release

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Open VirtuCam on your device
echo 2. Grant all permissions
echo 3. Enable in LSPosed Manager
echo 4. Add target apps to scope
echo 5. Reboot device
echo.
pause
