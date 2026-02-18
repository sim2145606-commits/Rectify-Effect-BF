# Android SDK Setup Script for Windows
# This script downloads and installs Android command-line tools

$ErrorActionPreference = "Stop"

# Configuration
$ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
$CMDLINE_TOOLS_URL = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
$CMDLINE_TOOLS_ZIP = "$env:TEMP\commandlinetools.zip"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Android SDK Setup for VirtuCam" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create SDK directory
Write-Host "[1/6] Creating Android SDK directory..." -ForegroundColor Yellow
if (-not (Test-Path $ANDROID_SDK_ROOT)) {
    New-Item -ItemType Directory -Path $ANDROID_SDK_ROOT -Force | Out-Null
    Write-Host "✓ Created: $ANDROID_SDK_ROOT" -ForegroundColor Green
} else {
    Write-Host "✓ Directory already exists: $ANDROID_SDK_ROOT" -ForegroundColor Green
}

# Step 2: Download command-line tools
Write-Host ""
Write-Host "[2/6] Downloading Android command-line tools..." -ForegroundColor Yellow
Write-Host "URL: $CMDLINE_TOOLS_URL" -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri $CMDLINE_TOOLS_URL -OutFile $CMDLINE_TOOLS_ZIP -UseBasicParsing
    Write-Host "✓ Downloaded successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Download failed: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Extract command-line tools
Write-Host ""
Write-Host "[3/6] Extracting command-line tools..." -ForegroundColor Yellow
$CMDLINE_TOOLS_DIR = "$ANDROID_SDK_ROOT\cmdline-tools"
if (-not (Test-Path $CMDLINE_TOOLS_DIR)) {
    New-Item -ItemType Directory -Path $CMDLINE_TOOLS_DIR -Force | Out-Null
}

try {
    Expand-Archive -Path $CMDLINE_TOOLS_ZIP -DestinationPath "$CMDLINE_TOOLS_DIR\temp" -Force
    
    # Move to 'latest' directory (required structure)
    $LATEST_DIR = "$CMDLINE_TOOLS_DIR\latest"
    if (Test-Path $LATEST_DIR) {
        Remove-Item -Path $LATEST_DIR -Recurse -Force
    }
    Move-Item -Path "$CMDLINE_TOOLS_DIR\temp\cmdline-tools" -Destination $LATEST_DIR -Force
    Remove-Item -Path "$CMDLINE_TOOLS_DIR\temp" -Recurse -Force
    
    Write-Host "✓ Extracted to: $LATEST_DIR" -ForegroundColor Green
} catch {
    Write-Host "✗ Extraction failed: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Set environment variables
Write-Host ""
Write-Host "[4/6] Setting environment variables..." -ForegroundColor Yellow
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", $ANDROID_SDK_ROOT, [System.EnvironmentVariableTarget]::User)
[System.Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $ANDROID_SDK_ROOT, [System.EnvironmentVariableTarget]::User)

# Update PATH
$currentPath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
$pathsToAdd = @(
    "$ANDROID_SDK_ROOT\cmdline-tools\latest\bin",
    "$ANDROID_SDK_ROOT\platform-tools",
    "$ANDROID_SDK_ROOT\build-tools\36.0.0"
)

foreach ($pathToAdd in $pathsToAdd) {
    if ($currentPath -notlike "*$pathToAdd*") {
        $currentPath = "$currentPath;$pathToAdd"
    }
}
[System.Environment]::SetEnvironmentVariable("Path", $currentPath, [System.EnvironmentVariableTarget]::User)

# Set for current session
$env:ANDROID_HOME = $ANDROID_SDK_ROOT
$env:ANDROID_SDK_ROOT = $ANDROID_SDK_ROOT
$env:Path = "$env:Path;$ANDROID_SDK_ROOT\cmdline-tools\latest\bin;$ANDROID_SDK_ROOT\platform-tools;$ANDROID_SDK_ROOT\build-tools\36.0.0"

Write-Host "✓ ANDROID_HOME = $ANDROID_SDK_ROOT" -ForegroundColor Green
Write-Host "✓ PATH updated" -ForegroundColor Green

# Step 5: Accept licenses
Write-Host ""
Write-Host "[5/6] Accepting Android SDK licenses..." -ForegroundColor Yellow
$sdkmanager = "$ANDROID_SDK_ROOT\cmdline-tools\latest\bin\sdkmanager.bat"
try {
    $licenses = "y`ny`ny`ny`ny`ny`ny`ny`ny`n"
    $licenses | & $sdkmanager --licenses 2>&1 | Out-Null
    Write-Host "✓ Licenses accepted" -ForegroundColor Green
} catch {
    Write-Host "⚠ License acceptance may have failed (this is usually OK)" -ForegroundColor Yellow
}

# Step 6: Install required SDK packages
Write-Host ""
Write-Host "[6/6] Installing required SDK packages..." -ForegroundColor Yellow
Write-Host "This may take several minutes..." -ForegroundColor Gray

$packages = @(
    "platform-tools",
    "platforms;android-36",
    "build-tools;36.0.0",
    "ndk;27.1.12297006",
    "cmake;3.22.1"
)

foreach ($pkg in $packages) {
    Write-Host "  Installing: $pkg" -ForegroundColor Gray
    try {
        & $sdkmanager $pkg 2>&1 | Out-Null
        Write-Host "  ✓ $pkg" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to install $pkg" -ForegroundColor Red
    }
}

# Cleanup
Write-Host ""
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $CMDLINE_TOOLS_ZIP -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Android SDK Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "SDK Location: $ANDROID_SDK_ROOT" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Please restart your terminal or VSCode for environment variables to take effect!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Close and reopen your terminal/VSCode" -ForegroundColor White
Write-Host "2. Run: cd android" -ForegroundColor White
Write-Host "3. Run: gradlew.bat assembleRelease" -ForegroundColor White
Write-Host ""
