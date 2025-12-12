# Task 03: Set Up GitHub Repository Structure and Workflows Directory

## Context
This task establishes the GitHub-specific configuration and automation infrastructure for the Budget Tool project. It sets up GitHub Actions workflows, issue templates, and other GitHub-specific files that enable continuous integration, automated testing, and structured project management.

## Objectives
- Create GitHub Actions workflow directory structure
- Set up issue and pull request templates
- Configure Dependabot for dependency updates
- Create security policy
- Establish branch protection documentation

## Prerequisites
- Task 01 completed (base project structure exists)
- Task 02 completed (documentation files exist)
- Git repository initialized
- Access to root directory of budget-tool project

## Task Instructions

### Step 1: Create GitHub Directories
Create the following directory structure:

```
budget-tool/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE/
```

### Step 2: Create Basic CI Workflow
Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

env:
  PYTHON_VERSION: '3.14'
  NODE_VERSION: '20'

jobs:
  # Backend Testing Job
  backend-test:
    name: Backend Tests
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ env.PYTHON_VERSION }}
    
    - name: Cache Python dependencies
      uses: actions/cache@v3
      with:
        path: ~/.cache/pip
        key: ${{ runner.os }}-pip-${{ hashFiles('api/requirements.txt') }}
        restore-keys: |
          ${{ runner.os }}-pip-
    
    - name: Install dependencies
      working-directory: ./api
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
        pip install pytest pytest-cov
    
    - name: Run tests
      working-directory: ./api
      run: |
        pytest --cov=app --cov-report=xml --cov-report=term
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        file: ./api/coverage.xml
        flags: backend
        name: backend-coverage

  # Frontend Testing Job
  frontend-test:
    name: Frontend Tests
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json
    
    - name: Install dependencies
      working-directory: ./frontend
      run: npm ci
    
    - name: Run linting
      working-directory: ./frontend
      run: npm run lint
      continue-on-error: true
    
    - name: Run unit tests
      working-directory: ./frontend
      run: npm run test:unit
      continue-on-error: true
    
    - name: Build application
      working-directory: ./frontend
      run: npm run build

  # Docker Build Test Job
  docker-build:
    name: Docker Build Test
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Build Backend Docker image
      uses: docker/build-push-action@v4
      with:
        context: ./api
        push: false
        tags: budget-tool-api:test
        cache-from: type=gha
        cache-to: type=gha,mode=max
    
    - name: Build Frontend Docker image
      uses: docker/build-push-action@v4
      with:
        context: ./frontend
        push: false
        tags: budget-tool-frontend:test
        cache-from: type=gha
        cache-to: type=gha,mode=max
    
    - name: Test Docker Compose
      run: |
        docker-compose config
        docker-compose build
```

### Step 3: Create Bug Report Issue Template
Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: 'bug'
assignees: ''
---

## Describe the bug
A clear and concise description of what the bug is.

## To Reproduce
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected behavior
A clear and concise description of what you expected to happen.

## Screenshots
If applicable, add screenshots to help explain your problem.

## Environment
 - OS: [e.g. Ubuntu 22.04]
 - Browser: [e.g. chrome, safari]
 - Version: [e.g. 22]
 - Docker version: [e.g. 24.0.0]
 - Docker Compose version: [e.g. 2.20.0]

## Additional context
Add any other context about the problem here.

## Logs
```
Paste any relevant logs here
```
```

### Step 4: Create Feature Request Issue Template
Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: 'enhancement'
assignees: ''
---

## Is your feature request related to a problem? Please describe.
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

## Describe the solution you'd like
A clear and concise description of what you want to happen.

## Describe alternatives you've considered
A clear and concise description of any alternative solutions or features you've considered.

## Additional context
Add any other context or screenshots about the feature request here.

## Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2
- [ ] Criteria 3
```

### Step 5: Create Pull Request Template
Create `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`:

```markdown
## Description
Brief description of what this PR does.

## Related Issue
Fixes #(issue number)

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Unit tests pass locally
- [ ] Integration tests pass locally
- [ ] E2E tests pass locally (if applicable)
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots to help reviewers understand the changes.

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Additional Notes
Any additional information that reviewers should know.
```

### Step 6: Create Dependabot Configuration
Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  # Python dependencies
  - package-ecosystem: "pip"
    directory: "/api"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "03:00"
    reviewers:
      - "yourusername"
    labels:
      - "dependencies"
      - "python"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore"
      include: "scope"

  # JavaScript dependencies
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "03:00"
    reviewers:
      - "yourusername"
    labels:
      - "dependencies"
      - "javascript"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore"
      include: "scope"

  # Docker dependencies
  - package-ecosystem: "docker"
    directory: "/api"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "docker"

  - package-ecosystem: "docker"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "docker"

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
    labels:
      - "dependencies"
      - "github-actions"
```

### Step 7: Create Security Policy
Create `.github/SECURITY.md`:

```markdown
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
```

### Step 8: Create GitHub Actions README
Create `.github/workflows/README.md`:

```markdown
# GitHub Actions Workflows

This directory contains automated workflows for the Budget Tool project.

## Workflows

### CI (ci.yml)
- **Trigger**: Push to main/develop, Pull requests
- **Purpose**: Run tests, linting, and build verification
- **Jobs**:
  - `backend-test`: Python tests with pytest
  - `frontend-test`: JavaScript tests and linting
  - `docker-build`: Verify Docker images build correctly

### Future Workflows

#### Release (release.yml) - TODO
- Automated release process
- Version tagging
- Docker image publishing
- Release notes generation

#### Deploy (deploy.yml) - TODO
- Deployment to staging/production
- Smoke tests
- Rollback capability

## Local Testing

To test workflows locally, you can use [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or see: https://github.com/nektos/act#installation

# Run workflows locally
act push  # Simulate push event
act pull_request  # Simulate PR event
```

## Secrets Required

The following secrets need to be configured in GitHub repository settings:

- `CODECOV_TOKEN` - For coverage reporting (optional)
- `DOCKER_HUB_USERNAME` - For Docker image publishing (future)
- `DOCKER_HUB_TOKEN` - For Docker image publishing (future)

## Workflow Maintenance

- Review and update dependency versions monthly
- Check for deprecated Actions quarterly
- Monitor workflow run times and optimize as needed
```

### Step 9: Create Branch Protection Rules Documentation
Create `.github/branch-protection.md`:

```markdown
# Branch Protection Rules

## Recommended Settings for `main` branch:

### Basic Settings
- [x] Require a pull request before merging
  - [x] Require approvals: 1
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from CODEOWNERS

### Status Checks
- [x] Require status checks to pass before merging
  - [x] Require branches to be up to date before merging
  - Required status checks:
    - `backend-test`
    - `frontend-test`
    - `docker-build`

### Additional Rules
- [x] Require conversation resolution before merging
- [x] Require signed commits (optional)
- [x] Include administrators
- [x] Restrict who can push to matching branches (optional)

## Setting Up Branch Protection

1. Go to Settings → Branches in your GitHub repository
2. Add a new branch protection rule for `main`
3. Configure settings as above
4. Save changes

## Development Workflow

1. Create feature branch from `main`
2. Make changes and commit
3. Push feature branch
4. Create pull request to `main`
5. Wait for CI checks to pass
6. Get code review approval
7. Merge to main
```

### Step 10: Commit GitHub Configuration
Stage and commit all GitHub configuration files:

```bash
git add .github/
git commit -m "Add GitHub repository structure and CI/CD workflows"
```

## Success Criteria
- [ ] .github directory structure created
- [ ] CI workflow file created and valid
- [ ] Issue templates created (bug report, feature request)
- [ ] Pull request template created
- [ ] Dependabot configuration added
- [ ] Security policy documented
- [ ] Workflow documentation added
- [ ] Branch protection documentation created
- [ ] All files committed to Git

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Verify GitHub directory structure
find .github -type f | sort

# Validate YAML syntax for workflows
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "CI workflow valid"
python -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))" && echo "Dependabot config valid"

# Check all expected files exist
ls -la .github/workflows/ci.yml
ls -la .github/ISSUE_TEMPLATE/*.md
ls -la .github/PULL_REQUEST_TEMPLATE/*.md
ls -la .github/dependabot.yml
ls -la .github/SECURITY.md

# Verify commit was made
git log --oneline -n 1 | grep -i github
```

## Troubleshooting
- Ensure YAML files use spaces, not tabs
- Validate YAML syntax before committing
- Check that workflow uses correct Python/Node versions
- Replace "yourusername" with actual GitHub username
- Update security email address when determined

## Notes
- The CI workflow will fail initially until backend/frontend code exists
- Dependabot will start creating PRs once repository is on GitHub
- Branch protection rules must be configured in GitHub UI
- Some workflow steps marked as `continue-on-error` initially

## Next Steps
After completing this task, proceed to:
- Task 04: Initialize Python backend with FastAPI structure