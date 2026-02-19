@echo off
echo ========================================
echo VirtuCam APK Builder
echo ========================================
echo.

echo [1/5] Cleaning previous build...
cd android
call gradlew.bat clean
cd ..
echo Done!
echo.

echo [2/5] Installing dependencies...
call npm install
echo Done!
echo.

echo [3/5] Building release APK...
cd android
call gradlew.bat assembleRelease
cd ..
echo Done!
echo.

echo [4/5] Locating APK...
set APK_PATH=android\app\build\outputs\apk\release\app-release.apk
if exist "%APK_PATH%" (
    echo APK built successfully!
    echo Location: %APK_PATH%
    echo.
    
    echo [5/5] Installing on device...
    echo Make sure your device is connected via USB with USB debugging enabled.
    pause
    adb install -r "%APK_PATH%"
    echo.
    
    echo ========================================
    echo Build and installation complete!
    echo ========================================
    echo.
    echo Next steps:
    echo 1. Open VirtuCam app on your device
    echo 2. Grant root access when prompted
    echo 3. Grant all permissions
    echo 4. Open LSPosed Manager
    echo 5. Enable VirtuCam module
    echo 6. Add target apps to scope
    echo 7. Reboot your device
    echo.
) else (
    echo ERROR: APK not found!
    echo Build may have failed. Check the output above for errors.
    echo.
)

pause
