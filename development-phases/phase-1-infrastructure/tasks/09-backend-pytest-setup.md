# Task 09: Set Up Pytest and Create First Backend Tests

## Context
This task establishes the testing infrastructure for the Budget Tool API using pytest. Proper testing is essential for maintaining code quality, preventing regressions, and ensuring the API behaves correctly. This includes unit tests, integration tests, test fixtures, and coverage reporting to establish a solid foundation for Test-Driven Development (TDD).

## Objectives
- Configure pytest with appropriate plugins
- Create test directory structure
- Write initial test suite for existing endpoints
- Set up test fixtures and utilities
- Configure code coverage reporting
- Establish testing best practices
- Create test database/file handling

## Prerequisites
- Task 08 completed (Docker configuration done)
- FastAPI application with health endpoints
- Virtual environment activated
- API modules (main, config, health) exist

## Task Instructions

### Step 1: Create Test Configuration
Create `api/pytest.ini`:

```ini
[tool:pytest]
testpaths = tests
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
addopts = 
    -v
    --strict-markers
    --tb=short
    --cov=app
    --cov-branch
    --cov-report=term-missing:skip-covered
    --cov-report=html:htmlcov
    --cov-report=xml
    --cov-fail-under=80
    --maxfail=1
    --ff
    -p no:warnings

markers =
    unit: Unit tests
    integration: Integration tests
    slow: Slow running tests
    e2e: End-to-end tests
    smoke: Smoke tests

# Async settings
asyncio_mode = auto

# Coverage settings
[coverage:run]
source = app
omit = 
    */tests/*
    */test_*.py
    */__pycache__/*
    */venv/*

[coverage:report]
exclude_lines =
    pragma: no cover
    def __repr__
    def __str__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
    @abstractmethod
```

### Step 2: Create Test Structure
Create the following test structure:

```
api/tests/
├── __init__.py
├── conftest.py
├── unit/
│   ├── __init__.py
│   ├── test_config.py
│   ├── test_health.py
│   └── test_models.py
├── integration/
│   ├── __init__.py
│   ├── test_api.py
│   └── test_endpoints.py
├── fixtures/
│   ├── __init__.py
│   └── data.py
└── utils/
    ├── __init__.py
    └── helpers.py
```

### Step 3: Create Main Test Configuration (conftest.py)
Create `api/tests/conftest.py`:

```python
"""Pytest configuration and shared fixtures."""

import asyncio
import os
import tempfile
from pathlib import Path
from typing import AsyncGenerator, Generator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.config import Settings, get_settings
from app.main import create_application


# Override settings for testing
@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """Create test settings."""
    return Settings(
        environment="testing",
        debug=True,
        log_level="DEBUG",
        log_format="text",
        cors_origins=["http://testserver"],
        ledger_path=Path("/tmp/test_ledger.dat"),
        ledger_backup_path=Path("/tmp/test_backups"),
    )


@pytest.fixture(scope="session")
def app(test_settings):
    """Create application for testing."""
    # Override the settings dependency
    app = create_application()
    app.dependency_overrides[get_settings] = lambda: test_settings
    return app


@pytest.fixture(scope="session")
def client(app) -> Generator[TestClient, None, None]:
    """Create test client."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_client(app) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def temp_ledger_file():
    """Create temporary ledger file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.ledger', delete=False) as f:
        f.write("; Test ledger file\n")
        f.write("2024-01-01 * Opening Balance\n")
        f.write("    Assets:Bank     $1000.00\n")
        f.write("    Equity:Opening\n")
        temp_path = f.name
    
    yield Path(temp_path)
    
    # Cleanup
    try:
        os.unlink(temp_path)
    except:
        pass


@pytest.fixture
def mock_ledger_service():
    """Mock ledger service for testing."""
    with patch('app.services.ledger') as mock:
        mock.read_file.return_value = "; Mock ledger content"
        mock.write_file.return_value = None
        mock.get_account_balance.return_value = 1000.00
        yield mock


@pytest.fixture
def sample_envelope_data():
    """Sample envelope data for testing."""
    return {
        "id": "test-envelope-1",
        "name": "Groceries",
        "notes": "Monthly grocery budget",
        "balance": 250.00,
    }


@pytest.fixture
def sample_transaction_data():
    """Sample transaction data for testing."""
    return {
        "id": "test-transaction-1",
        "date": "2024-01-15",
        "description": "Test Store Purchase",
        "amount": -45.23,
        "envelope_id": "test-envelope-1",
    }


@pytest.fixture(autouse=True)
def reset_singletons():
    """Reset singleton instances between tests."""
    # Reset any singleton instances or caches
    from app.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def auth_headers():
    """Mock authentication headers for protected endpoints."""
    return {"Authorization": "Bearer test-token"}


# Markers for test organization
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "slow: Slow running tests")
    config.addinivalue_line("markers", "e2e: End-to-end tests")
    config.addinivalue_line("markers", "smoke: Smoke tests")
```

### Step 4: Create Unit Tests for Configuration
Create `api/tests/unit/test_config.py`:

```python
"""Unit tests for configuration module."""

import os
from pathlib import Path

import pytest

from app.config import Settings, get_settings


@pytest.mark.unit
class TestConfiguration:
    """Test configuration settings."""
    
    def test_default_settings(self):
        """Test default settings initialization."""
        settings = Settings()
        assert settings.app_name == "Budget Tool API"
        assert settings.api_prefix == "/api/v1"
        assert settings.host == "0.0.0.0"
        assert settings.port == 8000
    
    def test_environment_override(self):
        """Test environment variable override."""
        os.environ["PORT"] = "3000"
        settings = Settings()
        assert settings.port == 3000
        del os.environ["PORT"]
    
    def test_is_development(self):
        """Test development environment check."""
        settings = Settings(environment="development")
        assert settings.is_development is True
        assert settings.is_production is False
    
    def test_is_production(self):
        """Test production environment check."""
        settings = Settings(environment="production")
        assert settings.is_production is True
        assert settings.is_development is False
    
    def test_cors_origins(self):
        """Test CORS origins configuration."""
        settings = Settings()
        assert "http://localhost:3000" in settings.cors_origins
        assert isinstance(settings.cors_origins, list)
    
    def test_ledger_paths(self):
        """Test ledger path configuration."""
        settings = Settings()
        assert isinstance(settings.ledger_path, Path)
        assert isinstance(settings.ledger_backup_path, Path)
    
    def test_settings_singleton(self):
        """Test settings singleton pattern."""
        settings1 = get_settings()
        settings2 = get_settings()
        assert settings1 is settings2
    
    @pytest.mark.parametrize("log_level", ["DEBUG", "INFO", "WARNING", "ERROR"])
    def test_log_levels(self, log_level):
        """Test different log level configurations."""
        settings = Settings(log_level=log_level)
        assert settings.log_level == log_level
```

### Step 5: Create Unit Tests for Health Endpoints
Create `api/tests/unit/test_health.py`:

```python
"""Unit tests for health check endpoints."""

import pytest
from unittest.mock import Mock, patch

from app.models.health import (
    HealthCheck,
    HealthStatus,
    LivenessCheck,
    ReadinessCheck,
    ServiceStatus,
)
from app.services.health import HealthService


@pytest.mark.unit
class TestHealthModels:
    """Test health check models."""
    
    def test_health_check_model(self):
        """Test HealthCheck model creation."""
        health = HealthCheck(
            status=HealthStatus.HEALTHY,
            service="Test Service",
            version="1.0.0"
        )
        assert health.status == HealthStatus.HEALTHY
        assert health.service == "Test Service"
        assert health.version == "1.0.0"
        assert health.timestamp is not None
    
    def test_liveness_check_model(self):
        """Test LivenessCheck model."""
        liveness = LivenessCheck(alive=True)
        assert liveness.alive is True
        assert liveness.timestamp is not None
    
    def test_readiness_check_model(self):
        """Test ReadinessCheck model."""
        readiness = ReadinessCheck(
            ready=True,
            checks={"database": True, "cache": True}
        )
        assert readiness.ready is True
        assert readiness.checks["database"] is True
        assert readiness.checks["cache"] is True


@pytest.mark.unit
class TestHealthService:
    """Test health service functionality."""
    
    @pytest.fixture
    def health_service(self):
        """Create health service instance."""
        return HealthService()
    
    @pytest.mark.asyncio
    async def test_liveness_check(self, health_service):
        """Test liveness check returns correct status."""
        result = await health_service.liveness_check()
        assert result.alive is True
    
    @pytest.mark.asyncio
    async def test_liveness_when_shutting_down(self, health_service):
        """Test liveness returns false when shutting down."""
        health_service.set_shutting_down(True)
        result = await health_service.liveness_check()
        assert result.alive is False
    
    @pytest.mark.asyncio
    async def test_readiness_check(self, health_service):
        """Test readiness check."""
        health_service.set_ready(True)
        result = await health_service.readiness_check()
        assert "app_initialized" in result.checks
        assert result.checks["app_initialized"] is True
    
    @pytest.mark.asyncio
    async def test_readiness_not_ready(self, health_service):
        """Test readiness when not ready."""
        health_service.set_ready(False)
        result = await health_service.readiness_check()
        assert result.checks["app_initialized"] is False
        assert result.ready is False
    
    @pytest.mark.asyncio
    async def test_basic_health_check(self, health_service):
        """Test basic health check aggregates status."""
        health_service.set_ready(True)
        result = await health_service.basic_health_check()
        assert result.status == HealthStatus.HEALTHY
        assert result.service == "Budget Tool API"
```

### Step 6: Create Integration Tests
Create `api/tests/integration/test_api.py`:

```python
"""Integration tests for API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestAPIIntegration:
    """Test API integration."""
    
    def test_root_endpoint(self, client: TestClient):
        """Test root endpoint returns API information."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "status" in data
        assert data["status"] == "running"
    
    def test_health_endpoint(self, client: TestClient):
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "service" in data
        assert "version" in data
    
    def test_liveness_probe(self, client: TestClient):
        """Test liveness probe endpoint."""
        response = client.get("/health/live")
        assert response.status_code == 200
        data = response.json()
        assert "alive" in data
        assert data["alive"] is True
    
    def test_readiness_probe(self, client: TestClient):
        """Test readiness probe endpoint."""
        response = client.get("/health/ready")
        # May be 200 or 503 depending on initialization
        assert response.status_code in [200, 503]
        data = response.json()
        assert "ready" in data
        assert "checks" in data
    
    def test_detailed_health(self, client: TestClient):
        """Test detailed health endpoint."""
        response = client.get("/health/detailed")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "checks" in data
        assert "metrics" in data
        assert "uptime_seconds" in data
    
    def test_api_status_endpoint(self, client: TestClient):
        """Test API status endpoint."""
        response = client.get("/api/v1/status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "operational"
        assert "version" in data
        assert "environment" in data
    
    def test_404_error(self, client: TestClient):
        """Test 404 error handling."""
        response = client.get("/nonexistent")
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
    
    def test_cors_headers(self, client: TestClient):
        """Test CORS headers are present."""
        response = client.options(
            "/health",
            headers={
                "Origin": "http://testserver",
                "Access-Control-Request-Method": "GET",
            }
        )
        assert "access-control-allow-origin" in response.headers
    
    def test_request_id_header(self, client: TestClient):
        """Test request ID is added to responses."""
        response = client.get("/health")
        assert "x-request-id" in response.headers
    
    @pytest.mark.parametrize("method", ["GET", "POST", "PUT", "DELETE"])
    def test_method_not_allowed(self, client: TestClient, method):
        """Test method not allowed errors."""
        if method != "GET":
            response = client.request(method, "/health")
            assert response.status_code == 405
```

### Step 7: Create Test Utilities
Create `api/tests/utils/helpers.py`:

```python
"""Test helper utilities."""

import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from pathlib import Path


def load_json_fixture(filename: str) -> Dict[str, Any]:
    """Load JSON fixture file."""
    fixture_path = Path(__file__).parent.parent / "fixtures" / filename
    with open(fixture_path, 'r') as f:
        return json.load(f)


def create_test_date(days_offset: int = 0) -> str:
    """Create test date string."""
    date = datetime.now() + timedelta(days=days_offset)
    return date.strftime("%Y-%m-%d")


def assert_datetime_recent(
    datetime_str: str,
    max_seconds_ago: int = 60
) -> None:
    """Assert datetime string is recent."""
    dt = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
    now = datetime.utcnow()
    diff = now - dt.replace(tzinfo=None)
    assert diff.total_seconds() < max_seconds_ago


def assert_valid_uuid(value: str) -> None:
    """Assert value is a valid UUID."""
    import uuid
    try:
        uuid.UUID(value)
    except ValueError:
        pytest.fail(f"Invalid UUID: {value}")


def create_test_ledger_content() -> str:
    """Create test ledger file content."""
    return """; Test ledger file
; Created for testing

2024-01-01 * Opening Balances
    Envelopes:Cash         $1000.00
    Envelopes:Groceries     $200.00
    Envelopes:Transport      $150.00
    Equity:Opening

2024-01-15 * "Grocery Store"
    Envelopes:Groceries     -$45.23
    Assets:Bank
"""


class APITestCase:
    """Base class for API test cases."""
    
    def assert_success_response(self, response, expected_status: int = 200):
        """Assert response is successful."""
        assert response.status_code == expected_status
        if response.content:
            data = response.json()
            if "error" in data:
                pytest.fail(f"Unexpected error in response: {data['error']}")
        return response.json() if response.content else None
    
    def assert_error_response(self, response, expected_status: int):
        """Assert response is an error."""
        assert response.status_code == expected_status
        data = response.json()
        assert "error" in data
        return data
```

### Step 8: Create Coverage Configuration
Update `.coveragerc` (or add to pyproject.toml):

```ini
[run]
source = app
omit = 
    */tests/*
    */test_*.py
    */__init__.py
    */venv/*
    */migrations/*

[report]
precision = 2
skip_covered = True
show_missing = True
exclude_lines =
    pragma: no cover
    def __repr__
    def __str__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
    @abstractmethod
    @abc.abstractmethod

[html]
directory = htmlcov
```

### Step 9: Run Tests
Install test dependencies and run tests:

```bash
cd api

# Install test dependencies (if not already installed)
pip install pytest pytest-cov pytest-asyncio pytest-mock httpx

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test categories
pytest -m unit
pytest -m integration
pytest -m "not slow"

# Run with verbose output
pytest -v

# Run and stop on first failure
pytest -x

# Run previously failed tests first
pytest --ff
```

## Success Criteria
- [ ] pytest.ini configuration file created
- [ ] Test directory structure established
- [ ] conftest.py with fixtures created
- [ ] Unit tests for configuration module
- [ ] Unit tests for health service
- [ ] Integration tests for API endpoints
- [ ] Test utilities and helpers created
- [ ] Coverage configuration set up
- [ ] All tests passing
- [ ] Code coverage > 80%

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check test files exist
ls -la api/tests/
ls -la api/pytest.ini
find api/tests -name "*.py" | wc -l

# Run tests
cd api
pytest --co  # Collect tests without running

# Run all tests with coverage
pytest --cov=app --cov-report=term

# Check coverage meets threshold
pytest --cov=app --cov-fail-under=80

# Generate HTML coverage report
pytest --cov=app --cov-report=html
ls -la htmlcov/index.html

# Run specific test markers
pytest -m unit -v
pytest -m integration -v

# Check for any test warnings
pytest -W error

# Run tests in parallel (if pytest-xdist installed)
pytest -n auto
```

## Troubleshooting
- If import errors occur, ensure PYTHONPATH includes the app directory
- For async test failures, check event loop fixture is properly configured
- If coverage is low, ensure all code paths are tested
- For fixture issues, check scope and dependencies
- If tests are slow, use markers to separate unit and integration tests

## Notes
- Use fixtures for common test data and setup
- Mark tests appropriately (unit, integration, slow)
- Keep unit tests fast and isolated
- Integration tests can use the test client
- Mock external dependencies in unit tests
- Use parametrize for testing multiple scenarios
- Coverage should focus on business logic
- Don't test third-party libraries

## Next Steps
After completing this task, proceed to:
- Task 10: Add backend environment configuration