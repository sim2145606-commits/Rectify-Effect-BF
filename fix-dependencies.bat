@echo off
echo ========================================
echo VirtuCam Dependency Fix
echo ========================================
echo.

echo This will fix the "expo-autolinking-settings" error.
echo.

echo [1/4] Removing node_modules...
if exist node_modules (
    rmdir /s /q node_modules
    echo Done!
) else (
    echo Already clean.
)
echo.

echo [2/4] Removing package-lock.json...
if exist package-lock.json (
    del package-lock.json
    echo Done!
) else (
    echo Already clean.
)
echo.

echo [3/4] Reinstalling dependencies (this may take 2-3 minutes)...
call npm install
echo Done!
echo.

echo [4/4] Verifying installation...
if exist "node_modules\expo-modules-autolinking\android\expo-gradle-plugin" (
    echo ✓ Expo autolinking plugin found!
    echo.
    echo Dependencies fixed successfully!
    echo.
    echo Now run: quick-build.bat
) else (
    echo ✗ Plugin still missing!
    echo.
    echo Try running: npm cache clean --force
    echo Then run this script again.
)
echo.
pause
