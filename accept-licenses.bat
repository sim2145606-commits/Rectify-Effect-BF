@echo off
set ANDROID_HOME=C:\Users\Administrator\AppData\Local\Android\Sdk
echo Accepting all Android SDK licenses...
echo.
(
echo y
echo y
echo y
echo y
echo y
echo y
echo y
echo y
) | "%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="%ANDROID_HOME%" --licenses
echo.
if %ERRORLEVEL% EQU 0 (
    echo All licenses accepted successfully!
) else (
    echo License acceptance completed with code: %ERRORLEVEL%
)
