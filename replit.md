# VirtuCam

An Expo/React Native application (VirtuCam) that primarily targets Android but also has web support via Metro bundler. The app provides a virtual camera interface with features like media studio, presets, and settings.

## Architecture

- **Framework**: Expo (React Native) with Expo Router for navigation
- **Target platforms**: Android (primary), Web (secondary via react-native-web)
- **Language**: TypeScript
- **Bundler**: Metro (configured in `metro.config.js`)
- **Navigation**: Expo Router with tab-based layout

## Project Structure

- `app/` - Expo Router screens and layouts
  - `(tabs)/` - Tab-based navigation screens (index, config, presets, settings)
  - `_layout.tsx` - Root layout
  - `onboarding.tsx` - Onboarding/setup screen
  - `diagnostic.tsx`, `logs.tsx` - Utility screens
- `components/` - Reusable UI components
  - `media-studio/` - HUD viewfinder, position controls, span/scale panel
- `services/` - App services (LogService, SystemVerification, etc.)
- `constants/` - Theme constants
- `hooks/` - Custom React hooks
- `assets/` - Fonts, images

## Development

- **Run web**: `npm run web` (starts on port 5000)
- **Run Android**: `npm run android`

## Theming System

- `context/ThemeContext.tsx` — React context providing `colors`, `colorMode`, `performanceMode`, `isDark`, `isPerformance`
- `hooks/useTheme.ts` — convenience re-export of the context hook
- `constants/theme.ts` — exports `DarkColors`, `LightColors`, `getColors(isDark, isPerformance)`, `Spacing`, `BorderRadius`, `FontSize`, `STORAGE_KEYS`
- All screens and components use `useTheme()` for dynamic colors — no hardcoded `Colors.*` references remain
- Performance mode strips all transparency, blur, and animations for maximum speed
- Color mode (`dark` | `system` | `day`) and performance mode are persisted to AsyncStorage

## Android Icon

- `android/app/src/main/res/drawable/ic_launcher_foreground.xml` — minimalist thin-stroke camera vector icon (108×108dp, content within 66dp safe zone)
- `android/app/src/main/res/drawable/ic_launcher_monochrome.xml` — identical paths used for Android 13+ themed icons (Pixel OS Material You tinting)
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` — adaptive icon with background + foreground + monochrome layers
- Background color: `#0A0A1A` (deep navy, matches macOS Tahoe dark palette)
- Supports: AOSP adaptive icons (API 26+), Pixel OS themed icons (API 33+), circular/squircle/any launcher shape

## Notes

- The app uses native Android modules (Root Access, LSPosed) which are not available on web — this is expected behavior
- Metro is configured with proxy support and module resolution for the `@` alias
- `EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0` is set to allow Replit's proxy to access the dev server
- `services/SystemVerification.ts` uses a lazy `getLogger()` getter instead of a direct import from `LogService.ts` to avoid the circular require cycle
- `platformShadow(color, offsetY, radius, opacity, elevation)` in `constants/theme.ts` — returns native shadow props on iOS/Android, and `boxShadow` on web. Used across all components to avoid the react-native-web `shadow*` deprecation warning
- `props.pointerEvents is deprecated` warning in the web console is from React Navigation/Expo Router's tab bar internal implementation — not from app code, cannot be fixed without patching the library
