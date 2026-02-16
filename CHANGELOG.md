# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Prettier configuration for consistent code formatting
- Pre-commit hooks with husky and lint-staged
- Comprehensive project documentation:
  - CONTRIBUTING.md - Development and contribution guidelines
  - CODE_OF_CONDUCT.md - Community standards
  - SECURITY.md - Security policy and vulnerability reporting
  - LICENSE - MIT License
  - CHANGELOG.md - Version history tracking
- Additional npm scripts for better DX:
  - `format` - Auto-format code with Prettier
  - `format:check` - Check code formatting
  - `type-check` - Validate TypeScript types
  - `validate` - Run all checks (lint, type-check, format)
- Improved CI/CD workflow to run on pull requests
- VS Code recommended extensions configuration
- .editorconfig for consistent editor settings

### Changed
- Updated .gitignore to exclude JVM crash logs
- Enhanced GitHub Actions workflow with linting and type checking

### Fixed
- Removed accidentally committed error log files (hs_err_*.log, replay_*.log)

## [1.0.0] - 2026-02-16

### Added
- Initial release of VirtuCam
- System-wide virtual camera injection for Android
- LSPosed/Xposed framework integration
- Media Studio with playback controls
- AI Enhancement Suite
- Low latency injection engine
- React Native HUD interface
- Configuration management system
- Log viewing and diagnostics
- Permission management
- System status monitoring
