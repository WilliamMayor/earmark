# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take the security of Budget Tool seriously. If you have discovered a security vulnerability, please follow these steps:

### How to Report

1. **DO NOT** create a public GitHub issue for the vulnerability.
2. Email your findings to `security@budgettool.example` (replace with actual email).
3. Provide as much information as possible:
   - Type of vulnerability
   - Step-by-step instructions to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Initial Response**: We will acknowledge receipt within 48 hours.
- **Investigation**: We will investigate and validate the issue within 7 days.
- **Resolution**: We aim to release a fix within 30 days, depending on complexity.
- **Disclosure**: We will coordinate disclosure with you.

### Security Best Practices for Users

1. **Keep Updated**: Always use the latest version of Budget Tool.
2. **Secure Deployment**: 
   - Use HTTPS in production
   - Keep Docker and dependencies updated
   - Use strong, unique passwords
   - Regularly backup your ledger data

3. **Environment Variables**:
   - Never commit `.env` files
   - Use strong secret keys
   - Rotate credentials regularly

### Security Features

Budget Tool implements several security measures:
- No external data transmission
- Data stored locally in plain text (for transparency)
- Docker container isolation
- Input validation and sanitization
- CORS protection

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who help improve Budget Tool's security.