# Task 02: Create Root-Level Documentation Files

## Context
This task creates the essential documentation files at the root of the Budget Tool project. These files provide important information about the project, its license, and contribution guidelines. This documentation is crucial for open-source projects and helps developers understand how to use and contribute to the project.

## Objectives
- Create a comprehensive README.md with project overview
- Add an appropriate open-source LICENSE file
- Create CONTRIBUTING.md with contribution guidelines
- Add CHANGELOG.md for tracking version changes
- Create CODE_OF_CONDUCT.md for community guidelines

## Prerequisites
- Task 01 completed (base project structure exists)
- Git repository initialized
- Root directory of budget-tool project accessible

## Task Instructions

### Step 1: Create README.md
Create `README.md` in the root directory with the following content:

```markdown
# Budget Tool

A self-hosted, open-source envelope budgeting application using plain text accounting principles.

## 🎯 Overview

Budget Tool is a privacy-focused personal finance application that combines the envelope budgeting method with plain text accounting (compatible with ledger/hledger). It provides a modern web interface while maintaining your financial data in a human-readable, version-controllable format.

## ✨ Features

- 📦 **Envelope Budgeting**: Organize your money into virtual envelopes for different spending categories
- 📄 **Plain Text Accounting**: All data stored in ledger/hledger compatible format
- 📅 **Month-by-Month View**: Intuitive monthly budget management
- 💳 **CSV Import**: Import transactions from your bank
- 🔄 **Transaction Allocation**: Easily categorize imported transactions
- 💸 **Fund Transfers**: Move money between envelopes as needed
- 🔒 **Privacy-First**: Self-hosted solution with no external data sharing
- 🐳 **Docker-Based**: Simple deployment using Docker Compose

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- 2GB RAM minimum
- 1GB free disk space

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/budget-tool.git
   cd budget-tool
   ```

2. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the application:
   ```bash
   docker-compose up -d
   ```

4. Access the application at `http://localhost:3000`

## 🛠️ Development

### Tech Stack

- **Backend**: Python 3.14, FastAPI
- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Storage**: Plain text ledger files
- **Deployment**: Docker, Docker Compose

### Development Setup

1. Install dependencies:
   ```bash
   # Backend
   cd api
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt

   # Frontend
   cd ../frontend
   npm install
   ```

2. Run in development mode:
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

### Running Tests

```bash
# Backend tests
cd api
pytest

# Frontend tests
cd frontend
npm run test
npm run test:e2e
```

## 📚 Documentation

- [User Guide](docs/user-guide.md)
- [API Documentation](docs/api.md)
- [Development Guide](docs/development.md)
- [Deployment Guide](docs/deployment.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Actual Budget](https://actualbudget.com/)
- Built on [ledger](https://www.ledger-cli.org/) and [hledger](https://hledger.org/) principles
- Uses the envelope budgeting method

## 🔗 Links

- [Project Homepage](https://github.com/yourusername/budget-tool)
- [Issue Tracker](https://github.com/yourusername/budget-tool/issues)
- [Discussions](https://github.com/yourusername/budget-tool/discussions)

## 📊 Status

🚧 **MVP Development** - This project is currently in active development. Core features are being implemented.
```

### Step 2: Create LICENSE File
Create `LICENSE` in the root directory with the MIT License:

```text
MIT License

Copyright (c) 2024 Budget Tool Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Step 3: Create CONTRIBUTING.md
Create `CONTRIBUTING.md` in the root directory:

```markdown
# Contributing to Budget Tool

First off, thank you for considering contributing to Budget Tool! It's people like you that make Budget Tool such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, please include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Your environment (OS, Docker version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- A clear and descriptive title
- A detailed description of the proposed enhancement
- Any possible drawbacks
- If possible, a rough implementation approach

### Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Make your changes
4. Run tests (`pytest` for backend, `npm test` for frontend)
5. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
6. Push to the branch (`git push origin feature/AmazingFeature`)
7. Open a Pull Request

## Development Process

1. Check the issue tracker for open issues or create a new one
2. Fork the repository
3. Create a branch for your work
4. Make your changes following our coding standards
5. Write or update tests as needed
6. Ensure all tests pass
7. Submit a pull request

## Coding Standards

### Python (Backend)
- Follow PEP 8
- Use type hints where possible
- Maximum line length: 88 characters (Black formatter)
- Write docstrings for all public functions

### TypeScript/JavaScript (Frontend)
- Use TypeScript for new code
- Follow the existing code style
- Use meaningful variable names
- Add JSDoc comments for complex functions

### Commit Messages
- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Testing

- Write tests for new features
- Update tests when modifying existing features
- Ensure all tests pass before submitting PR
- Aim for >80% code coverage

## Documentation

- Update README.md if needed
- Add docstrings/comments to your code
- Update API documentation for endpoint changes
- Include screenshots for UI changes

## Questions?

Feel free to open an issue with your question or reach out in the discussions section.

Thank you for contributing! 🎉
```

### Step 4: Create CODE_OF_CONDUCT.md
Create `CODE_OF_CONDUCT.md` in the root directory:

```markdown
# Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, caste, color, religion, or sexual
identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment:

* Using welcoming and inclusive language
* Being respectful of differing viewpoints and experiences
* Gracefully accepting constructive criticism
* Focusing on what is best for the community
* Showing empathy towards other community members

Examples of unacceptable behavior:

* The use of sexualized language or imagery, and sexual attention or advances
* Trolling, insulting or derogatory comments, and personal or political attacks
* Public or private harassment
* Publishing others' private information without explicit permission
* Other conduct which could reasonably be considered inappropriate

## Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards of
acceptable behavior and will take appropriate and fair corrective action in
response to any behavior that they deem inappropriate, threatening, offensive,
or harmful.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported to the community leaders responsible for enforcement at
[INSERT CONTACT EMAIL].

All complaints will be reviewed and investigated promptly and fairly.

All community leaders are obligated to respect the privacy and security of the
reporter of any incident.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage],
version 2.1, available at
[https://www.contributor-covenant.org/version/2/1/code_of_conduct.html][v2.1].

[homepage]: https://www.contributor-covenant.org
[v2.1]: https://www.contributor-covenant.org/version/2/1/code_of_conduct.html
```

### Step 5: Create CHANGELOG.md
Create `CHANGELOG.md` in the root directory:

```markdown
# Changelog

All notable changes to Budget Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure
- FastAPI backend setup
- SvelteKit frontend setup
- Docker configuration
- Basic health check endpoints
- Project documentation

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

## [0.1.0] - TBD

Initial MVP release planned with:
- Envelope management
- CSV import functionality
- Transaction allocation
- Fund transfers
- Month-by-month view

[Unreleased]: https://github.com/yourusername/budget-tool/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/budget-tool/releases/tag/v0.1.0
```

### Step 6: Create .env.example
Create `.env.example` in the root directory:

```bash
# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
API_RELOAD=true
LOG_LEVEL=debug

# Frontend Configuration
PUBLIC_API_URL=http://localhost:8000
NODE_ENV=development

# Ledger Configuration
LEDGER_PATH=/app/volumes/ledger/main.ledger
BACKUP_PATH=/app/volumes/ledger/backups
BACKUP_COUNT=5

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
CORS_METHODS=GET,POST,PUT,DELETE
CORS_HEADERS=*

# Security
SECRET_KEY=your-secret-key-here-change-in-production
```

### Step 7: Commit the Documentation
Stage and commit all documentation files:

```bash
git add README.md LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md CHANGELOG.md .env.example
git commit -m "Add project documentation and license files"
```

## Success Criteria
- [ ] README.md created with comprehensive project information
- [ ] LICENSE file added with MIT License text
- [ ] CONTRIBUTING.md created with contribution guidelines
- [ ] CODE_OF_CONDUCT.md added with community standards
- [ ] CHANGELOG.md initialized with proper format
- [ ] .env.example created with all necessary configuration variables
- [ ] All files committed to Git

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Verify all documentation files exist
ls -la README.md LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md CHANGELOG.md .env.example

# Check README has content
head -n 10 README.md

# Verify LICENSE is MIT
grep -q "MIT License" LICENSE && echo "MIT License found"

# Check files are tracked by Git
git ls-files | grep -E "(README|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|CHANGELOG|.env.example)"

# Verify commit was made
git log --oneline -n 1
```

## Troubleshooting
- Ensure all files are created in the root directory, not in subdirectories
- Use UTF-8 encoding for all files
- Make sure .env.example doesn't contain actual secrets
- Verify markdown files render correctly (no syntax errors)

## Notes
- The README should be updated as features are implemented
- CHANGELOG should be maintained throughout development
- Replace "yourusername" with actual GitHub username when available
- Update contact email in CODE_OF_CONDUCT.md when determined

## Next Steps
After completing this task, proceed to:
- Task 03: Set up GitHub repository structure and workflows directory