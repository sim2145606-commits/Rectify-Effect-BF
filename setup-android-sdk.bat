@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Android SDK Setup for VirtuCam
echo ========================================
echo.

set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
set "CMDLINE_TOOLS_URL=https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
set "CMDLINE_TOOLS_ZIP=%TEMP%\commandlinetools.zip"

REM Step 1: Create SDK directory
echo [1/6] Creating Android SDK directory...
if not exist "%ANDROID_SDK_ROOT%" (
    mkdir "%ANDROID_SDK_ROOT%"
    echo Created: %ANDROID_SDK_ROOT%
) else (
    echo Directory already exists: %ANDROID_SDK_ROOT%
)

REM Step 2: Download command-line tools
echo.
echo [2/6] Downloading Android command-line tools...
echo URL: %CMDLINE_TOOLS_URL%
powershell -Command "Invoke-WebRequest -Uri '%CMDLINE_TOOLS_URL%' -OutFile '%CMDLINE_TOOLS_ZIP%' -UseBasicParsing"
if errorlevel 1 (
    echo Download failed!
    exit /b 1
)
echo Downloaded successfully

REM Step 3: Extract command-line tools
echo.
echo [3/6] Extracting command-line tools...
set "CMDLINE_TOOLS_DIR=%ANDROID_SDK_ROOT%\cmdline-tools"
if not exist "%CMDLINE_TOOLS_DIR%" mkdir "%CMDLINE_TOOLS_DIR%"

powershell -Command "Expand-Archive -Path '%CMDLINE_TOOLS_ZIP%' -DestinationPath '%CMDLINE_TOOLS_DIR%\temp' -Force"

set "LATEST_DIR=%CMDLINE_TOOLS_DIR%\latest"
if exist "%LATEST_DIR%" rmdir /s /q "%LATEST_DIR%"
move "%CMDLINE_TOOLS_DIR%\temp\cmdline-tools" "%LATEST_DIR%" >nul
rmdir /s /q "%CMDLINE_TOOLS_DIR%\temp"
echo Extracted to: %LATEST_DIR%

REM Step 4: Set environment variables
echo.
echo [4/6] Setting environment variables...
setx ANDROID_HOME "%ANDROID_SDK_ROOT%" >nul
setx ANDROID_SDK_ROOT "%ANDROID_SDK_ROOT%" >nul
set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
set "ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT%"
echo ANDROID_HOME = %ANDROID_SDK_ROOT%
echo Environment variables set

REM Step 5: Accept licenses
echo.
echo [5/6] Accepting Android SDK licenses...
set "SDKMANAGER=%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat"
echo y | "%SDKMANAGER%" --licenses >nul 2>&1
echo Licenses accepted

REM Step 6: Install required SDK packages
echo.
echo [6/6] Installing required SDK packages...
echo This may take several minutes...

echo   Installing: platform-tools
call "%SDKMANAGER%" "platform-tools" >nul 2>&1
echo   Done: platform-tools

echo   Installing: platforms;android-36
call "%SDKMANAGER%" "platforms;android-36" >nul 2>&1
echo   Done: platforms;android-36

echo   Installing: build-tools;36.0.0
call "%SDKMANAGER%" "build-tools;36.0.0" >nul 2>&1
echo   Done: build-tools;36.0.0

echo   Installing: ndk;27.1.12297006
call "%SDKMANAGER%" "ndk;27.1.12297006" >nul 2>&1
echo   Done: ndk;27.1.12297006

echo   Installing: cmake;3.22.1
call "%SDKMANAGER%" "cmake;3.22.1" >nul 2>&1
echo   Done: cmake;3.22.1

REM Cleanup
echo.
echo Cleaning up...
del /f /q "%CMDLINE_TOOLS_ZIP%" 2>nul

echo.
echo ========================================
echo Android SDK Setup Complete!
echo ========================================
echo.
echo SDK Location: %ANDROID_SDK_ROOT%
echo.
echo IMPORTANT: Please restart your terminal or VSCode for environment variables to take effect!
echo.
echo Next steps:
echo 1. Close and reopen your terminal/VSCode
echo 2. Run: cd android
echo 3. Run: gradlew.bat assembleRelease
echo.
pause
