# Security Policy

## Supported Versions

Currently, we support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in VirtuCam, please report it by:

1. **Email**: Send details to the repository maintainers (check GitHub profile for contact)
2. **Private Security Advisory**: Use GitHub's private vulnerability reporting feature

### What to Include

When reporting a vulnerability, please include:

- Type of vulnerability (e.g., injection, XSS, authentication bypass)
- Full paths of affected source file(s)
- Location of the affected code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment and potential consequences
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Assessment**: We'll assess the vulnerability and determine severity
- **Fix Timeline**: Critical issues will be addressed within 7 days; others based on severity
- **Disclosure**: We'll coordinate disclosure with you after a fix is available
- **Credit**: You'll be credited in the security advisory (unless you prefer anonymity)

## Security Best Practices for Users

Since VirtuCam requires root access and system-level hooks:

1. **Use on Test Devices**: Only use VirtuCam on devices intended for development/testing
2. **Review Code**: This is open source - review the code before granting root access
3. **Keep Updated**: Always use the latest version with security patches
4. **Limit Scope**: Only enable VirtuCam for applications you trust
5. **Monitor Behavior**: Check logs regularly for unexpected activity

## Known Security Considerations

VirtuCam is designed for:

- **Educational purposes**
- **Development and testing**
- **Research environments**

It is NOT intended for:

- Production environments
- Privacy-sensitive applications
- Circumventing security measures
- Any illegal activities

## Dependencies

We regularly monitor and update dependencies for known vulnerabilities. To check for vulnerable dependencies:

```bash
npm audit
```

To automatically fix vulnerabilities where possible:

```bash
npm audit fix
```

## Disclosure Policy

- We follow responsible disclosure practices
- Security advisories will be published after fixes are available
- We'll credit security researchers who report issues responsibly
- Coordinated disclosure timeline is typically 90 days

## Contact

For security concerns, please contact the project maintainers through:

- GitHub Security Advisories (preferred)
- Repository maintainer contacts listed in GitHub

Thank you for helping keep VirtuCam secure! 🔒
