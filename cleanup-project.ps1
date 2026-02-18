# VirtuCam Project Cleanup Script
# This script removes all build artifacts and cache files to reduce project size

Write-Output "Starting VirtuCam project cleanup...`n"

# Track total space freed
$initialSize = (Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB

# 1. Clean Android build artifacts
Write-Output "Cleaning Android build artifacts..."
$androidPaths = @(
    'android\.gradle',
    'android\build',
    'android\app\build',
    'android\app\.cxx',
    'android\.cxx'
)

foreach ($path in $androidPaths) {
    if (Test-Path $path) {
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
        Write-Output "  ✓ Deleted $path"
    }
}

# 2. Clean Expo cache
Write-Output "`nCleaning Expo cache..."
if (Test-Path '.expo') {
    Remove-Item -Recurse -Force '.expo' -ErrorAction SilentlyContinue
    Write-Output "  ✓ Deleted .expo"
}

# 3. Clean build artifacts from node_modules packages
Write-Output "`nCleaning build artifacts from node_modules packages..."
$nodeModulesPackages = @(
    'react-native-reanimated',
    'react-native-worklets',
    'expo-modules-core',
    'react-native-screens',
    'react-native-gesture-handler'
)

foreach ($pkg in $nodeModulesPackages) {
    $buildPath = "node_modules\$pkg\android\build"
    $cxxPath = "node_modules\$pkg\android\.cxx"
    
    if (Test-Path $buildPath) {
        Remove-Item -Recurse -Force $buildPath -ErrorAction SilentlyContinue
        Write-Output "  ✓ Deleted $pkg/android/build"
    }
    
    if (Test-Path $cxxPath) {
        Remove-Item -Recurse -Force $cxxPath -ErrorAction SilentlyContinue
        Write-Output "  ✓ Deleted $pkg/android/.cxx"
    }
}

# 4. Clean any remaining build/cache directories in node_modules
Write-Output "`nScanning for remaining build artifacts in node_modules..."
$cleaned = 0
Get-ChildItem node_modules -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object {
    ($_.Name -eq 'build' -and $_.Parent.Name -eq 'android') -or
    ($_.Name -eq '.cxx' -and $_.Parent.Name -eq 'android') -or
    ($_.Name -eq '.gradle')
} | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "  ✓ Deleted $($_.FullName.Replace((Get-Location).Path + '\', ''))"
    $cleaned++
}

if ($cleaned -eq 0) {
    Write-Output "  ✓ No additional artifacts found"
}

# 5. Calculate final size
$finalSize = (Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB
$freed = $initialSize - $finalSize

Write-Output "`n" + "="*60
Write-Output "Cleanup Complete!"
Write-Output "="*60
Write-Output "Initial size: $([math]::Round($initialSize, 2)) GB"
Write-Output "Final size:   $([math]::Round($finalSize, 2)) GB"
Write-Output "Space freed:  $([math]::Round($freed, 2)) GB"
Write-Output "`nYour project is now optimized and ready for development!"
