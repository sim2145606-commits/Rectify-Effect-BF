# VirtuCam Icon Design Documentation

## Overview

VirtuCam features a professional icon design inspired by OBS Studio's aesthetic, specifically tailored for an Android virtual camera application. The icons use a camera lens motif to represent the app's virtual camera functionality.

## Design Philosophy

The icon design follows these principles:
- **Professional & Elegant**: Dark theme with modern color palette
- **Recognizable**: Camera lens design clearly communicates the app's purpose
- **OBS Studio-Inspired**: Similar dark professional aesthetic to OBS Studio
- **Android-Optimized**: Full support for adaptive icons with proper densities

## Color Palette

| Color | Hex Code | Usage |
|-------|----------|-------|
| Dark Background | `#1E1E1E` | Icon background, main dark theme |
| Splash Background | `#1A1F2E` | Splash screen background |
| Primary Green | `#4CAF50` | Outer lens ring, "virtual" indicator |
| Secondary Blue | `#2196F3` | Inner lens elements, camera accent |
| Highlight Teal | `#64FFDA` | Center square, modern tech appeal |
| Deep Shadow | `#0D0D0D` | Depth and contrast |

## Icon Components

### 1. App Icon (`icon.png`)
- **Size**: 1024x1024px
- **Background**: Gradient from `#263238` to `#1A1F2E`
- **Design**: Complete camera lens with all elements on gradient background
- **Usage**: Main app icon, launcher icon

### 2. Adaptive Icon (`adaptive-icon.png`)
- **Size**: 1024x1024px
- **Background**: Transparent (uses `iconBackground` color from Android resources)
- **Design**: Camera lens foreground layer for adaptive icons
- **Usage**: Android adaptive icon foreground

### 3. Splash Screen Icon (`splash-icon.png`)
- **Size**: 1024x1024px
- **Background**: Transparent
- **Design**: Simplified camera lens design for quick recognition
- **Usage**: Splash screen logo

### 4. Favicon (`favicon.png`)
- **Size**: 48x48px
- **Design**: Downscaled adaptive icon
- **Usage**: Web favicon

## Android Resources

### Mipmap Densities

The following densities are generated for adaptive icons:

| Density | Size | DPI |
|---------|------|-----|
| mdpi | 108x108 | ~160dpi |
| hdpi | 162x162 | ~240dpi |
| xhdpi | 216x216 | ~320dpi |
| xxhdpi | 324x324 | ~480dpi |
| xxxhdpi | 432x432 | ~640dpi |

Generated files:
- `mipmap-{density}/ic_launcher_foreground.png`
- `mipmap-{density}/ic_launcher_round.png`

### Drawable Densities

The following densities are generated for splash screen:

| Density | Size |
|---------|------|
| mdpi | 150x150 |
| hdpi | 225x225 |
| xhdpi | 300x300 |
| xxhdpi | 450x450 |
| xxxhdpi | 600x600 |

Generated files:
- `drawable-{density}/splashscreen_logo.png`

## Configuration Files

### app.json
```json
{
  "android": {
    "adaptiveIcon": {
      "foregroundImage": "./assets/images/adaptive-icon.png",
      "backgroundColor": "#1E1E1E"
    }
  },
  "plugins": [
    [
      "expo-splash-screen",
      {
        "image": "./assets/images/splash-icon.png",
        "imageWidth": 200,
        "resizeMode": "contain",
        "backgroundColor": "#1A1F2E"
      }
    ]
  ]
}
```

### colors.xml
```xml
<resources>
  <color name="splashscreen_background">#1A1F2E</color>
  <color name="iconBackground">#1E1E1E</color>
  <color name="colorPrimary">#023c69</color>
  <color name="colorPrimaryDark">#1A1F2E</color>
</resources>
```

## Design Elements

### Camera Lens Layers (from outer to inner)

1. **Outer Green Ring**: Represents the virtual camera concept
2. **Dark Inner Circle**: Creates depth and contrast
3. **Blue Ring**: Secondary camera element
4. **Dark Center Circle**: Additional depth
5. **Teal Rounded Square**: Virtual camera viewfinder/frame indicator
6. **Green Center Dot**: Focal point, camera lens center

## Regenerating Icons

If you need to regenerate the icons, you can use ImageMagick with the following color scheme:

```bash
DARK_BG="#1E1E1E"
LENS_OUTER="#4CAF50"
LENS_INNER="#2196F3"
HIGHLIGHT="#64FFDA"
SHADOW="#0D0D0D"
```

## File Locations

### Source Assets
- `/assets/images/icon.png` - Main app icon
- `/assets/images/adaptive-icon.png` - Adaptive icon foreground
- `/assets/images/splash-icon.png` - Splash screen icon
- `/assets/images/favicon.png` - Web favicon

### Android Resources
- `/android/app/src/main/res/mipmap-*/ic_launcher_foreground.png`
- `/android/app/src/main/res/mipmap-*/ic_launcher_round.png`
- `/android/app/src/main/res/drawable-*/splashscreen_logo.png`

## Inspiration

The icon design draws inspiration from:
- **OBS Studio**: Dark professional theme and color palette
- **Camera Lenses**: Concentric circles representing camera optics
- **Virtual Reality**: Teal/cyan colors often associated with virtual/digital concepts
- **Modern Tech**: Clean geometric shapes and gradients

## License

These icons are part of the VirtuCam project and follow the same MIT License as the main project.
