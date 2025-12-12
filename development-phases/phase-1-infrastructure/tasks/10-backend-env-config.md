# Task 10: Add Backend Environment Configuration

## Context
This task establishes comprehensive environment configuration for the Budget Tool API. Proper environment management allows the application to run correctly in different environments (development, staging, production) with appropriate settings. This includes creating environment files, validating configurations, managing secrets, and ensuring Docker containers receive proper environment variables.

## Objectives
- Create environment configuration files for different environments
- Implement environment variable validation
- Set up secret management patterns
- Configure Docker environment variable passing
- Create environment-specific settings
- Document all configuration options
- Implement configuration testing

## Prerequisites
- Task 09 completed (pytest and tests configured)
- FastAPI application with config module
- Docker setup complete
- Understanding of environment variables
- Virtual environment activated

## Task Instructions

### Step 1: Create Environment File Templates
Create `api/.env.example`:

```bash
# Application Configuration
APP_NAME="Budget Tool API"
APP_VERSION="0.1.0"
API_PREFIX="/api/v1"
DEBUG=false
ENVIRONMENT=production

# Server Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=1
RELOAD=false

# Logging Configuration
LOG_LEVEL=INFO
LOG_FORMAT=json
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/app/logs/api.log
LOG_FILE_MAX_SIZE=10485760  # 10MB in bytes
LOG_FILE_BACKUP_COUNT=5

# CORS Configuration
CORS_ORIGINS=["https://budget.example.com"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
CORS_ALLOW_HEADERS=["*"]
CORS_MAX_AGE=3600

# Ledger Configuration
LEDGER_PATH=/app/volumes/ledger/main.ledger
LEDGER_BACKUP_PATH=/app/volumes/ledger/backups
LEDGER_BACKUP_COUNT=5
LEDGER_AUTO_BACKUP=true

# Security Configuration
SECRET_KEY=change-this-to-a-random-secret-key-in-production
ALLOWED_HOSTS=["budget.example.com", "api.budget.example.com"]
TRUSTED_PROXIES=["127.0.0.1"]

# Rate Limiting (optional)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_PERIOD=60  # seconds

# Monitoring (optional)
SENTRY_DSN=
METRICS_ENABLED=false
METRICS_PORT=9090

# Feature Flags
FEATURE_CSV_IMPORT=true
FEATURE_AUTO_ALLOCATION=false
FEATURE_BULK_OPERATIONS=false
```

### Step 2: Create Development Environment File
Create `api/.env.development`:

```bash
# Development Environment Configuration
APP_NAME="Budget Tool API (Dev)"
APP_VERSION="0.1.0-dev"
API_PREFIX="/api/v1"
DEBUG=true
ENVIRONMENT=development

# Server Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=1
RELOAD=true

# Logging Configuration
LOG_LEVEL=DEBUG
LOG_FORMAT=text
LOG_FILE_ENABLED=false
LOG_FILE_PATH=./logs/api.log

# CORS Configuration (permissive for development)
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
CORS_MAX_AGE=3600

# Ledger Configuration
LEDGER_PATH=./volumes/ledger/main.ledger
LEDGER_BACKUP_PATH=./volumes/ledger/backups
LEDGER_BACKUP_COUNT=3
LEDGER_AUTO_BACKUP=true

# Security Configuration (development only)
SECRET_KEY=development-secret-key-not-for-production
ALLOWED_HOSTS=["*"]
TRUSTED_PROXIES=["*"]

# Rate Limiting (disabled for development)
RATE_LIMIT_ENABLED=false

# Monitoring (disabled for development)
SENTRY_DSN=
METRICS_ENABLED=false

# Feature Flags (all enabled for development)
FEATURE_CSV_IMPORT=true
FEATURE_AUTO_ALLOCATION=true
FEATURE_BULK_OPERATIONS=true
```

### Step 3: Create Production Environment Template
Create `api/.env.production`:

```bash
# Production Environment Configuration
APP_NAME="Budget Tool API"
APP_VERSION=1.0.0
API_PREFIX=/api/v1
DEBUG=false
ENVIRONMENT=production

# Server Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=4
RELOAD=false

# Logging Configuration
LOG_LEVEL=INFO
LOG_FORMAT=json
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/app/logs/api.log
LOG_FILE_MAX_SIZE=10485760
LOG_FILE_BACKUP_COUNT=10

# CORS Configuration (restrictive for production)
CORS_ORIGINS=["https://budget.yourdomain.com"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["GET", "POST", "PUT", "DELETE"]
CORS_ALLOW_HEADERS=["Accept", "Content-Type", "Authorization"]
CORS_MAX_AGE=86400

# Ledger Configuration
LEDGER_PATH=/app/volumes/ledger/main.ledger
LEDGER_BACKUP_PATH=/app/volumes/ledger/backups
LEDGER_BACKUP_COUNT=10
LEDGER_AUTO_BACKUP=true

# Security Configuration (MUST BE CHANGED)
SECRET_KEY=${SECRET_KEY}  # Set via environment variable
ALLOWED_HOSTS=["budget.yourdomain.com", "api.budget.yourdomain.com"]
TRUSTED_PROXIES=["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=1000
RATE_LIMIT_PERIOD=60

# Monitoring
SENTRY_DSN=${SENTRY_DSN}  # Set via environment variable
METRICS_ENABLED=true
METRICS_PORT=9090

# Feature Flags
FEATURE_CSV_IMPORT=true
FEATURE_AUTO_ALLOCATION=false
FEATURE_BULK_OPERATIONS=false
```

### Step 4: Create Settings Validator
Create `api/app/core/validators.py`:

```python
"""Configuration validators for Budget Tool API."""

import os
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, ValidationError


class ConfigValidator(BaseModel):
    """Validate configuration settings."""
    
    # Application
    app_name: str = Field(..., min_length=1, max_length=100)
    environment: str = Field(..., pattern="^(development|staging|production|testing)$")
    debug: bool = Field(False)
    
    # Server
    host: str = Field(..., pattern="^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$|^0\\.0\\.0\\.0$")
    port: int = Field(..., ge=1, le=65535)
    workers: int = Field(1, ge=1, le=16)
    
    # Security
    secret_key: str = Field(..., min_length=32)
    allowed_hosts: List[str] = Field(default_factory=list)
    
    # Paths
    ledger_path: Path
    ledger_backup_path: Path
    
    @field_validator("secret_key")
    def validate_secret_key(cls, v: str, info) -> str:
        """Validate secret key is secure."""
        if info.data.get("environment") == "production":
            if v in ["development-secret-key-not-for-production", "change-this-to-a-random-secret-key-in-production"]:
                raise ValueError("Default secret key cannot be used in production")
            if len(v) < 32:
                raise ValueError("Secret key must be at least 32 characters in production")
        return v
    
    @field_validator("allowed_hosts")
    def validate_allowed_hosts(cls, v: List[str], info) -> List[str]:
        """Validate allowed hosts configuration."""
        if info.data.get("environment") == "production":
            if "*" in v:
                raise ValueError("Wildcard hosts not allowed in production")
        return v
    
    @field_validator("ledger_path", "ledger_backup_path")
    def validate_paths(cls, v: Path) -> Path:
        """Validate paths are absolute or relative."""
        if v.is_absolute() and not str(v).startswith("/app"):
            # For Docker, paths should be under /app
            pass
        return v


def validate_environment() -> Dict[str, Any]:
    """Validate current environment configuration."""
    from app.config import get_settings
    
    settings = get_settings()
    errors = []
    warnings = []
    
    # Check critical settings
    if settings.environment == "production":
        # Check secret key
        if settings.secret_key == "development-secret-key-not-for-production":
            errors.append("Secret key must be changed for production")
        
        # Check debug mode
        if settings.debug:
            warnings.append("Debug mode is enabled in production")
        
        # Check CORS origins
        if "*" in [str(origin) for origin in settings.cors_origins]:
            warnings.append("CORS wildcard origin used in production")
        
        # Check logging
        if settings.log_level == "DEBUG":
            warnings.append("Debug logging enabled in production")
    
    # Check paths exist
    if not settings.ledger_path.parent.exists():
        warnings.append(f"Ledger directory does not exist: {settings.ledger_path.parent}")
    
    if not settings.ledger_backup_path.exists():
        try:
            settings.ledger_backup_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            errors.append(f"Cannot create backup directory: {e}")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "environment": settings.environment,
    }


def generate_secret_key() -> str:
    """Generate a secure secret key."""
    return secrets.token_urlsafe(32)


def check_required_env_vars(required_vars: List[str]) -> Dict[str, bool]:
    """Check if required environment variables are set."""
    results = {}
    for var in required_vars:
        results[var] = os.environ.get(var) is not None
    return results
```

### Step 5: Create Environment Loader Utility
Create `api/app/utils/env_loader.py`:

```python
"""Environment file loader utilities."""

import os
from pathlib import Path
from typing import Dict, Optional

from dotenv import dotenv_values, load_dotenv


def load_environment_file(env_name: Optional[str] = None) -> bool:
    """
    Load environment file based on environment name.
    
    Args:
        env_name: Environment name (development, staging, production)
    
    Returns:
        True if file was loaded successfully
    """
    # Determine environment
    if env_name is None:
        env_name = os.environ.get("ENVIRONMENT", "development")
    
    # Find environment file
    env_files = [
        f".env.{env_name}",
        f".env.{env_name}.local",
        ".env.local",
        ".env",
    ]
    
    # Load first available file
    for env_file in env_files:
        env_path = Path(env_file)
        if env_path.exists():
            load_dotenv(env_path, override=True)
            print(f"Loaded environment from: {env_path}")
            return True
    
    # No environment file found
    print(f"No environment file found for: {env_name}")
    return False


def get_environment_info() -> Dict[str, str]:
    """Get current environment information."""
    return {
        "environment": os.environ.get("ENVIRONMENT", "unknown"),
        "debug": os.environ.get("DEBUG", "false"),
        "host": os.environ.get("HOST", "0.0.0.0"),
        "port": os.environ.get("PORT", "8000"),
        "log_level": os.environ.get("LOG_LEVEL", "INFO"),
        "python_version": os.environ.get("PYTHON_VERSION", "unknown"),
    }


def mask_sensitive_value(value: str, show_chars: int = 4) -> str:
    """Mask sensitive values for display."""
    if len(value) <= show_chars:
        return "***"
    return value[:show_chars] + "***"


def get_safe_config_display() -> Dict[str, str]:
    """Get configuration for display with sensitive values masked."""
    sensitive_keys = [
        "SECRET_KEY",
        "DATABASE_URL",
        "SENTRY_DSN",
        "API_KEY",
        "PASSWORD",
        "TOKEN",
    ]
    
    config = {}
    for key, value in os.environ.items():
        if any(sensitive in key.upper() for sensitive in sensitive_keys):
            config[key] = mask_sensitive_value(value)
        else:
            config[key] = value
    
    return config
```

### Step 6: Update Configuration Module
Update `api/app/config.py` to add validation:

```python
# Add to imports
from app.core.validators import validate_environment

# Add method to Settings class
def validate(self) -> Dict[str, Any]:
    """Validate configuration settings."""
    return validate_environment()

# Add at the end of the file
def check_configuration():
    """Check configuration on startup."""
    settings = get_settings()
    validation = settings.validate()
    
    if not validation["valid"]:
        import sys
        print("Configuration errors:", validation["errors"])
        if settings.is_production:
            sys.exit(1)
    
    if validation["warnings"]:
        print("Configuration warnings:", validation["warnings"])
```

### Step 7: Create Configuration Tests
Create `api/tests/unit/test_env_config.py`:

```python
"""Tests for environment configuration."""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import Settings
from app.core.validators import (
    ConfigValidator,
    check_required_env_vars,
    generate_secret_key,
    validate_environment,
)
from app.utils.env_loader import (
    get_environment_info,
    load_environment_file,
    mask_sensitive_value,
)


@pytest.mark.unit
class TestEnvironmentConfiguration:
    """Test environment configuration."""
    
    def test_load_development_config(self):
        """Test loading development configuration."""
        with patch.dict(os.environ, {"ENVIRONMENT": "development"}):
            settings = Settings()
            assert settings.environment == "development"
            assert settings.debug is False  # Default value
    
    def test_load_production_config(self):
        """Test loading production configuration."""
        with patch.dict(os.environ, {
            "ENVIRONMENT": "production",
            "DEBUG": "false",
            "SECRET_KEY": "a" * 32,
        }):
            settings = Settings()
            assert settings.environment == "production"
            assert settings.debug is False
    
    def test_secret_key_validation_production(self):
        """Test secret key validation in production."""
        with pytest.raises(ValueError):
            ConfigValidator(
                app_name="Test",
                environment="production",
                host="0.0.0.0",
                port=8000,
                secret_key="development-secret-key-not-for-production",
                ledger_path=Path("/app/ledger"),
                ledger_backup_path=Path("/app/backup"),
            )
    
    def test_allowed_hosts_validation_production(self):
        """Test allowed hosts validation in production."""
        with pytest.raises(ValueError):
            ConfigValidator(
                app_name="Test",
                environment="production",
                host="0.0.0.0",
                port=8000,
                secret_key="a" * 32,
                allowed_hosts=["*"],
                ledger_path=Path("/app/ledger"),
                ledger_backup_path=Path("/app/backup"),
            )
    
    def test_generate_secret_key(self):
        """Test secret key generation."""
        key = generate_secret_key()
        assert len(key) >= 32
        assert key != generate_secret_key()  # Should be random
    
    def test_mask_sensitive_value(self):
        """Test sensitive value masking."""
        assert mask_sensitive_value("secret123", 3) == "sec***"
        assert mask_sensitive_value("ab", 4) == "***"
    
    def test_check_required_env_vars(self):
        """Test checking required environment variables."""
        with patch.dict(os.environ, {"VAR1": "value1"}):
            result = check_required_env_vars(["VAR1", "VAR2"])
            assert result["VAR1"] is True
            assert result["VAR2"] is False
    
    def test_environment_file_loading(self, tmp_path):
        """Test loading environment files."""
        # Create temporary .env file
        env_file = tmp_path / ".env.test"
        env_file.write_text("TEST_VAR=test_value\n")
        
        with patch("pathlib.Path.exists") as mock_exists:
            mock_exists.return_value = True
            with patch("dotenv.load_dotenv") as mock_load:
                load_environment_file("test")
                mock_load.assert_called_once()
    
    @pytest.mark.parametrize("env,expected_debug", [
        ("development", True),
        ("production", False),
        ("staging", False),
    ])
    def test_environment_specific_settings(self, env, expected_debug):
        """Test environment-specific settings."""
        with patch.dict(os.environ, {"ENVIRONMENT": env}):
            settings = Settings(environment=env)
            if env == "development":
                assert settings.is_development
            elif env == "production":
                assert settings.is_production
```

### Step 8: Create Environment Documentation
Create `api/docs/CONFIGURATION.md`:

```markdown
# Budget Tool API Configuration Guide

## Environment Variables

### Required Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `SECRET_KEY` | Secret key for security | Random 32+ char string | Yes (production) |
| `ENVIRONMENT` | Environment name | production | Yes |
| `LEDGER_PATH` | Path to ledger file | /app/volumes/ledger/main.ledger | Yes |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEBUG` | Debug mode | false | true |
| `LOG_LEVEL` | Logging level | INFO | DEBUG |
| `PORT` | Server port | 8000 | 3000 |
| `CORS_ORIGINS` | Allowed origins | ["http://localhost:3000"] | ["https://app.com"] |

## Environment Files

### Development
Use `.env.development` for local development:
```bash
cp .env.example .env.development
# Edit .env.development with your settings
```

### Production
Use environment variables or `.env.production`:
```bash
cp .env.example .env.production
# Edit with production values
# Ensure SECRET_KEY is set securely
```

## Docker Configuration

Pass environment variables to Docker:
```bash
docker run -e ENVIRONMENT=production -e SECRET_KEY=$SECRET_KEY budget-tool-api
```

Or use env file:
```bash
docker run --env-file .env.production budget-tool-api
```

## Security Best Practices

1. **Never commit** `.env` files with real secrets
2. **Always change** default SECRET_KEY in production
3. **Use strong** secret keys (32+ characters)
4. **Restrict** CORS origins in production
5. **Disable** debug mode in production
6. **Rotate** secrets regularly

## Generating Secret Keys

```python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Validation

The application validates configuration on startup:
- Production requires secure secret key
- Paths must be valid
- Required variables must be set

## Troubleshooting

### Missing Environment Variables
Check required variables are set:
```bash
python -c "from app.core.validators import check_required_env_vars; print(check_required_env_vars(['SECRET_KEY', 'LEDGER_PATH']))"
```

### Invalid Configuration
Run validation:
```bash
python -c "from app.core.validators import validate_environment; print(validate_environment())"
```
```

## Success Criteria
- [ ] Environment file templates created (.env.example, .env.development, .env.production)
- [ ] Configuration validators implemented
- [ ] Environment loader utilities created
- [ ] Secret key generation utility
- [ ] Configuration validation on startup
- [ ] Sensitive value masking for logs
- [ ] Environment-specific settings working
- [ ] Tests for configuration validation
- [ ] Documentation for all configuration options
- [ ] Docker environment variable passing configured

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check environment files exist
ls -la api/.env*
cat api/.env.example

# Test configuration loading
cd api
python -c "from app.config import get_settings; s = get_settings(); print(f'Environment: {s.environment}')"

# Test secret key generation
python -c "from app.core.validators import generate_secret_key; print(generate_secret_key())"

# Test configuration validation
python -c "from app.core.validators import validate_environment; print(validate_environment())"

# Run configuration tests
pytest tests/unit/test_env_config.py -v

# Test with different environments
ENVIRONMENT=development python -c "from app.config import get_settings; print(get_settings().environment)"
ENVIRONMENT=production SECRET_KEY=$(openssl rand -base64 32) python -c "from app.config import get_settings; print(get_settings().environment)"

# Check Docker environment passing
docker run --rm -e ENVIRONMENT=production -e SECRET_KEY=test123 budget-tool-api:test env | grep ENVIRONMENT
```

## Troubleshooting
- If environment variables not loading, check file exists and format is correct
- For validation errors, ensure all required fields are set
- If Docker not receiving environment, check --env-file or -e flags
- For permission errors on paths, ensure directories exist and are writable
- If secrets are exposed in logs, check masking is applied

## Notes
- Use different .env files for each environment
- Never commit real secrets to version control
- Always validate configuration in production
- Use strong, unique secret keys
- Consider using secret management services (Vault, AWS Secrets Manager)
- Document all configuration options
- Provide sensible defaults where possible
- Validate early and fail fast for configuration errors

## Next Steps
After completing this task, proceed to:
- Task 11: Initialize SvelteKit project with TypeScript