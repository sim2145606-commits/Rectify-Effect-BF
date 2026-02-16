# Contributing to VirtuCam

Thank you for your interest in contributing to VirtuCam! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:
- Node.js 18.x or higher
- npm or yarn package manager
- Android development environment (for testing)
- Git for version control

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/virtucam.git
   cd virtucam
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npx expo start
   ```

## 📝 Development Workflow

### Code Standards

- **TypeScript**: All new code should be written in TypeScript with strict mode enabled
- **Formatting**: Run `npm run format` before committing (uses Prettier)
- **Linting**: Ensure `npm run lint` passes without errors
- **Type Checking**: Run `npm run type-check` to verify TypeScript types

### Git Workflow

1. Create a new branch for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code standards

3. Commit your changes with clear, descriptive messages:
   ```bash
   git commit -m "feat: add new feature description"
   ```

4. Push to your fork and create a Pull Request

### Commit Message Convention

We follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## 🧪 Testing

- Write tests for new features and bug fixes
- Ensure all tests pass before submitting a PR: `npm test`
- Aim for good test coverage of critical functionality

## 🔍 Code Review Process

1. All submissions require review before merging
2. Address any feedback from reviewers promptly
3. Keep PRs focused and reasonably sized
4. Update documentation as needed

## 📚 Documentation

- Update README.md if adding new features
- Add JSDoc comments to public functions and components
- Update relevant markdown documentation files

## 🐛 Bug Reports

When filing a bug report, include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Device/OS information
- Relevant logs or error messages

## 💡 Feature Requests

For feature requests:
- Explain the use case and benefits
- Consider if it aligns with project goals
- Be open to discussion and feedback

## ⚖️ Legal

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License). You also confirm that you have the right to submit the contributions.

## 🤝 Code of Conduct

Be respectful, inclusive, and professional in all interactions. We're all here to build something great together.

## 📞 Questions?

- Open an issue for questions
- Join discussions in existing issues/PRs
- Reach out to maintainers if needed

Thank you for contributing to VirtuCam! 🎉
