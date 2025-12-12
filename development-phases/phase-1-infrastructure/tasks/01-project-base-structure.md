# Task 01: Create Base Project Structure and Git Configuration

## Context
This is the first task in building the Budget Tool MVP, a self-hosted envelope budgeting application. This task establishes the foundational directory structure and Git configuration for the entire project. The project uses a monorepo approach with separate directories for the API (Python/FastAPI) and frontend (SvelteKit) services.

## Objectives
- Create the complete directory structure for the project
- Initialize Git repository with proper configuration
- Set up .gitignore for Python and Node.js development
- Create placeholder files for key directories
- Establish the foundation for Docker volumes

## Prerequisites
- Empty directory named `budget-tool` exists
- Git is installed
- No existing Git repository in the directory

## Task Instructions

### Step 1: Initialize Git Repository
Navigate to the `budget-tool` directory and initialize Git:

```bash
cd budget-tool
git init
```

### Step 2: Create Directory Structure
Create the following directory structure:

```
budget-tool/
├── api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── models/
│   │   │   └── __init__.py
│   │   ├── routes/
│   │   │   └── __init__.py
│   │   ├── services/
│   │   │   └── __init__.py
│   │   └── ledger/
│   │       └── __init__.py
│   └── tests/
│       └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── routes/
│   │   └── lib/
│   │       ├── api/
│   │       └── components/
│   ├── static/
│   └── tests/
├── volumes/
│   └── ledger/
│       └── .gitkeep
├── scripts/
└── docs/
```

### Step 3: Create .gitignore File
Create `.gitignore` in the root directory with the following content:

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST
.pytest_cache/
.coverage
htmlcov/
.tox/
.hypothesis/
*.log

# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
.npm
.yarn
dist/
dist-ssr/
*.local

# SvelteKit
.svelte-kit/
build/

# Environment Variables
.env
.env.local
.env.*.local
.env.production

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.DS_Store
Thumbs.db

# Docker
volumes/ledger/*.txt
volumes/ledger/*.dat
volumes/ledger/*.ledger
!volumes/ledger/.gitkeep

# Testing
coverage/
*.lcov
.nyc_output/

# Temporary files
*.tmp
*.temp
.temp/
.tmp/

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
```

### Step 4: Create Python __init__ Files
Create empty `__init__.py` files in the following directories to make them Python packages:

- `api/app/__init__.py`
- `api/app/models/__init__.py`
- `api/app/routes/__init__.py`
- `api/app/services/__init__.py`
- `api/app/ledger/__init__.py`
- `api/tests/__init__.py`

### Step 5: Create .gitkeep Files
Create `.gitkeep` files in empty directories to ensure they're tracked by Git:

- `frontend/src/routes/.gitkeep`
- `frontend/src/lib/api/.gitkeep`
- `frontend/src/lib/components/.gitkeep`
- `frontend/static/.gitkeep`
- `frontend/tests/.gitkeep`
- `volumes/ledger/.gitkeep`
- `scripts/.gitkeep`
- `docs/.gitkeep`

### Step 6: Create .editorconfig File
Create `.editorconfig` in the root directory for consistent coding styles:

```ini
# EditorConfig is awesome: https://EditorConfig.org

# top-most EditorConfig file
root = true

# General settings for all files
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space

# Python files
[*.py]
indent_size = 4
max_line_length = 88

# JavaScript/TypeScript files
[*.{js,jsx,ts,tsx,vue,svelte}]
indent_size = 2

# JSON files
[*.json]
indent_size = 2

# YAML files
[*.{yml,yaml}]
indent_size = 2

# Markdown files
[*.md]
trim_trailing_whitespace = false

# Makefile
[Makefile]
indent_style = tab

# Docker files
[Dockerfile*]
indent_size = 2
```

### Step 7: Create Initial Git Commit
Stage and commit the initial structure:

```bash
git add .
git commit -m "Initial project structure setup"
```

## Expected File Structure
After completing this task, you should have:

```
budget-tool/
├── .git/                    # Git repository
├── .gitignore              # Git ignore configuration
├── .editorconfig           # Editor configuration
├── api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── models/
│   │   │   └── __init__.py
│   │   ├── routes/
│   │   │   └── __init__.py
│   │   ├── services/
│   │   │   └── __init__.py
│   │   └── ledger/
│   │       └── __init__.py
│   └── tests/
│       └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── .gitkeep
│   │   └── lib/
│   │       ├── api/
│   │       │   └── .gitkeep
│   │       └── components/
│   │           └── .gitkeep
│   ├── static/
│   │   └── .gitkeep
│   └── tests/
│       └── .gitkeep
├── volumes/
│   └── ledger/
│       └── .gitkeep
├── scripts/
│   └── .gitkeep
└── docs/
    └── .gitkeep
```

## Success Criteria
- [ ] Git repository initialized
- [ ] All directories created as specified
- [ ] .gitignore file contains all necessary patterns
- [ ] .editorconfig file created
- [ ] All __init__.py files created for Python packages
- [ ] All .gitkeep files created for empty directories
- [ ] Initial commit made with descriptive message

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Verify Git repository
git status

# Verify directory structure (on Unix-like systems)
find . -type d -name ".git" -prune -o -type d -print | sort

# Verify Python packages have __init__.py
find api -name "__init__.py" | sort

# Verify .gitkeep files
find . -name ".gitkeep" | sort

# Count total directories (should be around 19 excluding .git)
find . -type d -name ".git" -prune -o -type d -print | wc -l
```

## Troubleshooting
- If directories already exist, ensure they're empty before starting
- If Git complains about existing repository, remove `.git` directory first
- Ensure all file paths use forward slashes, even on Windows
- Make sure .gitignore is in the root directory, not in subdirectories

## Next Steps
After completing this task, proceed to:
- Task 02: Create root-level documentation files (README, LICENSE)