# Task 04: Initialize Python Backend with FastAPI Structure

## Context
This task initializes the Python backend for the Budget Tool MVP using FastAPI. It sets up the project dependencies, creates the initial application structure, and prepares the backend for development. FastAPI is chosen for its high performance, automatic API documentation, and excellent type hints support.

## Objectives
- Create Python virtual environment
- Define project dependencies in requirements.txt
- Initialize FastAPI application structure
- Create version management
- Set up basic project configuration
- Prepare for API development

## Prerequisites
- Task 01 completed (base project structure exists)
- Python 3.11+ installed (3.14 preferred)
- pip package manager available
- api/ directory structure created

## Task Instructions

### Step 1: Create requirements.txt
Create `api/requirements.txt` with the following content:

```txt
# Core Framework
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6

# Data Validation & Serialization
pydantic==2.5.3
pydantic-settings==2.1.0

# Date/Time Handling
python-dateutil==2.8.2

# File Processing
python-multipart==0.0.6
aiofiles==23.2.1

# Utilities
python-dotenv==1.0.0

# Development & Testing
pytest==7.4.4
pytest-cov==4.1.0
pytest-asyncio==0.23.3
httpx==0.26.0
pytest-mock==3.12.0

# Code Quality
black==24.1.0
flake8==7.0.0
mypy==1.8.0
isort==5.13.2

# Optional: Monitoring & Logging
python-json-logger==2.0.7
```

### Step 2: Create requirements-dev.txt
Create `api/requirements-dev.txt` for development-only dependencies:

```txt
# Include base requirements
-r requirements.txt

# Development tools
ipython==8.20.0
watchfiles==0.21.0
pre-commit==3.6.0

# Documentation
mkdocs==1.5.3
mkdocs-material==9.5.4
```

### Step 3: Create Version File
Create `api/app/version.py`:

```python
"""Version information for Budget Tool API."""

__version__ = "0.1.0-dev"
__api_version__ = "v1"
__app_name__ = "Budget Tool API"
__description__ = "Self-hosted envelope budgeting tool API"
```

### Step 4: Create Configuration Module
Create `api/app/config.py`:

```python
"""Configuration management for Budget Tool API."""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # Application
    app_name: str = "Budget Tool API"
    app_version: str = "0.1.0-dev"
    api_prefix: str = "/api/v1"
    debug: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"  # "json" or "text"
    
    # CORS
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://frontend:3000",
    ]
    cors_allow_credentials: bool = True
    cors_allow_methods: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    cors_allow_headers: List[str] = ["*"]
    
    # Ledger
    ledger_path: Path = Path("/app/volumes/ledger/main.ledger")
    ledger_backup_path: Path = Path("/app/volumes/ledger/backups")
    ledger_backup_count: int = 5
    
    # Security
    secret_key: str = "your-secret-key-here-change-in-production"
    
    # Environment
    environment: str = "development"  # development, staging, production
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.environment == "production"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
```

### Step 5: Create Main Application File
Create `api/app/main.py`:

```python
"""Main FastAPI application for Budget Tool."""

import logging
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.version import __api_version__, __app_name__, __description__, __version__

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info(f"Starting {__app_name__} v{__version__}")
    logger.info(f"Environment: {get_settings().environment}")
    logger.info(f"Debug mode: {get_settings().debug}")
    
    # Initialize resources here (database, cache, etc.)
    
    yield
    
    # Shutdown
    logger.info("Shutting down application")
    # Clean up resources here


def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title=__app_name__,
        description=__description__,
        version=__version__,
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        lifespan=lifespan,
    )
    
    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    
    # Add routes
    setup_routes(app)
    
    # Add exception handlers
    setup_exception_handlers(app)
    
    return app


def setup_routes(app: FastAPI) -> None:
    """Configure application routes."""
    settings = get_settings()
    
    @app.get("/", tags=["Root"])
    async def read_root() -> Dict[str, Any]:
        """Root endpoint."""
        return {
            "name": __app_name__,
            "version": __version__,
            "api_version": __api_version__,
            "status": "running",
            "docs": "/docs" if settings.is_development else None,
        }
    
    @app.get("/health", tags=["Health"])
    async def health_check() -> Dict[str, str]:
        """Basic health check endpoint."""
        return {"status": "healthy"}
    
    @app.get(f"{settings.api_prefix}/status", tags=["Health"])
    async def api_status() -> Dict[str, Any]:
        """Detailed API status."""
        return {
            "status": "operational",
            "version": __version__,
            "api_version": __api_version__,
            "environment": settings.environment,
            "debug": settings.debug,
            "ledger_path": str(settings.ledger_path),
        }


def setup_exception_handlers(app: FastAPI) -> None:
    """Configure exception handlers."""
    
    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Any) -> JSONResponse:
        """Handle 404 errors."""
        return JSONResponse(
            status_code=404,
            content={"detail": "Resource not found"},
        )
    
    @app.exception_handler(500)
    async def internal_error_handler(request: Request, exc: Any) -> JSONResponse:
        """Handle 500 errors."""
        logger.error(f"Internal server error: {exc}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )


# Create the application instance
app = create_application()


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower(),
    )
```

### Step 6: Create Setup Script
Create `api/setup.py` for package configuration:

```python
"""Setup configuration for Budget Tool API."""

from setuptools import find_packages, setup

from app.version import __version__

setup(
    name="budget-tool-api",
    version=__version__,
    description="Self-hosted envelope budgeting tool API",
    author="Budget Tool Contributors",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "fastapi>=0.109.0",
        "uvicorn[standard]>=0.27.0",
        "pydantic>=2.5.3",
        "python-dateutil>=2.8.2",
    ],
)
```

### Step 7: Create pyproject.toml
Create `api/pyproject.toml` for modern Python project configuration:

```toml
[tool.black]
line-length = 88
target-version = ['py311']
include = '\.pyi?$'
exclude = '''
/(
    \.git
  | \.hg
  | \.mypy_cache
  | \.tox
  | \.venv
  | _build
  | buck-out
  | build
  | dist
)/
'''

[tool.isort]
profile = "black"
line_length = 88
multi_line_output = 3
include_trailing_comma = true
force_grid_wrap = 0
use_parentheses = true
ensure_newline_before_comments = true

[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_any_generics = true
ignore_missing_imports = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_unreachable = true
strict_equality = true

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "-ra",
    "--strict-markers",
    "--ignore=docs",
    "--ignore=setup.py",
    "--ignore=.env",
    "--cov=app",
    "--cov-branch",
    "--cov-report=term-missing:skip-covered",
    "--cov-report=html:htmlcov",
    "--cov-report=xml",
    "--cov-fail-under=80",
]

[tool.coverage.run]
branch = true
source = ["app"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "def __str__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
    "if typing.TYPE_CHECKING:",
]
```

### Step 8: Create .env File for Development
Create `api/.env.development`:

```bash
# Application
APP_NAME="Budget Tool API"
DEBUG=true
ENVIRONMENT=development

# Server
HOST=0.0.0.0
PORT=8000
RELOAD=true

# Logging
LOG_LEVEL=DEBUG
LOG_FORMAT=text

# CORS
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]

# Ledger
LEDGER_PATH=./volumes/ledger/main.ledger
LEDGER_BACKUP_PATH=./volumes/ledger/backups
LEDGER_BACKUP_COUNT=5

# Security (change in production!)
SECRET_KEY=development-secret-key-change-in-production
```

### Step 9: Initialize Virtual Environment and Install Dependencies
Run these commands in the `api/` directory:

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On Unix/macOS:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements-dev.txt

# Verify installation
python -c "import fastapi; print(f'FastAPI version: {fastapi.__version__}')"
```

### Step 10: Test the Application
Run the application to verify it works:

```bash
# From the api/ directory with venv activated
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using Python directly
python -m app.main
```

Visit http://localhost:8000 to see the root response and http://localhost:8000/docs for API documentation.

## Success Criteria
- [ ] requirements.txt created with all necessary dependencies
- [ ] requirements-dev.txt created for development dependencies
- [ ] Version management file created
- [ ] Configuration module implemented with Pydantic settings
- [ ] Main FastAPI application created with basic endpoints
- [ ] CORS middleware configured
- [ ] pyproject.toml created with tool configurations
- [ ] Virtual environment created and dependencies installed
- [ ] Application runs successfully
- [ ] API documentation accessible at /docs

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check files exist
ls -la api/requirements*.txt
ls -la api/app/main.py api/app/config.py api/app/version.py
ls -la api/pyproject.toml api/setup.py

# Test Python imports (with venv activated)
cd api
python -c "from app.main import app; print('FastAPI app imported successfully')"
python -c "from app.config import get_settings; print(get_settings().app_name)"

# Run the application
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
sleep 3

# Test endpoints
curl http://localhost:8000/
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/status

# Kill the server
pkill -f uvicorn
```

## Troubleshooting
- Ensure Python 3.11+ is installed (3.14 preferred)
- If import errors occur, check virtual environment is activated
- If port 8000 is in use, change it in the configuration
- On Windows, use appropriate path separators and activation scripts
- If CORS issues occur, verify frontend URL in cors_origins

## Notes
- The application uses async/await for better performance
- Settings are cached using lru_cache for efficiency
- API documentation is only exposed in development mode
- All configuration can be overridden with environment variables
- The secret key must be changed for production deployment

## Next Steps
After completing this task, proceed to:
- Task 05: Implement FastAPI application with health endpoints