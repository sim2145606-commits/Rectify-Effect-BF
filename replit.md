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

## Notes

- The app uses native Android modules (Root Access, LSPosed) which are not available on web - this is expected behavior
- Metro is configured with proxy support and module resolution for the `@` alias
- `EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0` is set to allow Replit's proxy to access the dev server
