# Task 05: Implement FastAPI Application with Health Endpoints

## Context
This task enhances the FastAPI application with comprehensive health check endpoints that provide detailed system status information. These endpoints are crucial for monitoring, deployment validation, and container orchestration (Docker health checks). The implementation follows best practices for production-ready health monitoring.

## Objectives
- Implement multiple health check endpoints (liveness, readiness, detailed)
- Add system resource monitoring
- Create health check models with Pydantic
- Implement ledger file connectivity check
- Add startup and shutdown event handlers
- Create health check middleware for metrics

## Prerequisites
- Task 04 completed (FastAPI initialized)
- Virtual environment activated
- FastAPI application running
- Basic endpoints working

## Task Instructions

### Step 1: Create Health Check Models
Create `api/app/models/health.py`:

```python
"""Health check models for Budget Tool API."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class HealthStatus(str, Enum):
    """Health status enumeration."""
    
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class ServiceStatus(str, Enum):
    """Service status enumeration."""
    
    UP = "up"
    DOWN = "down"
    STARTING = "starting"
    STOPPING = "stopping"


class HealthCheck(BaseModel):
    """Basic health check response."""
    
    status: HealthStatus = Field(..., description="Overall health status")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")


class LivenessCheck(BaseModel):
    """Liveness probe response."""
    
    alive: bool = Field(..., description="Whether the service is alive")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ReadinessCheck(BaseModel):
    """Readiness probe response."""
    
    ready: bool = Field(..., description="Whether the service is ready")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    checks: Dict[str, bool] = Field(
        default_factory=dict,
        description="Individual readiness checks"
    )


class DetailedHealth(BaseModel):
    """Detailed health check response."""
    
    status: HealthStatus
    service_status: ServiceStatus
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    uptime_seconds: float = Field(..., description="Service uptime in seconds")
    version: str
    environment: str
    checks: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Detailed check results"
    )
    metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="System metrics"
    )
```

### Step 2: Create Health Service
Create `api/app/services/health.py`:

```python
"""Health check service for Budget Tool API."""

import asyncio
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

import psutil

from app.config import get_settings
from app.models.health import (
    DetailedHealth,
    HealthCheck,
    HealthStatus,
    LivenessCheck,
    ReadinessCheck,
    ServiceStatus,
)
from app.version import __version__

# Track application start time
START_TIME = time.time()


class HealthService:
    """Service for health checks and monitoring."""
    
    def __init__(self):
        """Initialize health service."""
        self.settings = get_settings()
        self._ready = False
        self._shutting_down = False
    
    def set_ready(self, ready: bool) -> None:
        """Set readiness status."""
        self._ready = ready
    
    def set_shutting_down(self, shutting_down: bool) -> None:
        """Set shutdown status."""
        self._shutting_down = shutting_down
    
    async def liveness_check(self) -> LivenessCheck:
        """
        Perform liveness check.
        
        This should return True if the application is alive,
        even if it's not ready to serve requests.
        """
        return LivenessCheck(alive=not self._shutting_down)
    
    async def readiness_check(self) -> ReadinessCheck:
        """
        Perform readiness check.
        
        This should return True only if the application
        is ready to serve requests.
        """
        checks = {}
        
        # Check if application is initialized
        checks["app_initialized"] = self._ready
        
        # Check if not shutting down
        checks["not_shutting_down"] = not self._shutting_down
        
        # Check ledger directory accessibility
        checks["ledger_accessible"] = await self._check_ledger_access()
        
        # Check disk space
        checks["disk_space_ok"] = self._check_disk_space()
        
        # Overall readiness
        ready = all(checks.values())
        
        return ReadinessCheck(ready=ready, checks=checks)
    
    async def basic_health_check(self) -> HealthCheck:
        """Perform basic health check."""
        readiness = await self.readiness_check()
        
        if readiness.ready:
            status = HealthStatus.HEALTHY
        elif readiness.checks.get("app_initialized", False):
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.UNHEALTHY
        
        return HealthCheck(
            status=status,
            service="Budget Tool API",
            version=__version__,
        )
    
    async def detailed_health_check(self) -> DetailedHealth:
        """Perform detailed health check with metrics."""
        # Basic checks
        liveness = await self.liveness_check()
        readiness = await self.readiness_check()
        
        # Determine overall status
        if readiness.ready:
            status = HealthStatus.HEALTHY
            service_status = ServiceStatus.UP
        elif self._shutting_down:
            status = HealthStatus.UNHEALTHY
            service_status = ServiceStatus.STOPPING
        elif not self._ready:
            status = HealthStatus.UNHEALTHY
            service_status = ServiceStatus.STARTING
        else:
            status = HealthStatus.DEGRADED
            service_status = ServiceStatus.UP
        
        # Gather detailed checks
        checks = {
            "liveness": {
                "status": "pass" if liveness.alive else "fail",
                "alive": liveness.alive,
            },
            "readiness": {
                "status": "pass" if readiness.ready else "fail",
                "ready": readiness.ready,
                "details": readiness.checks,
            },
            "ledger": await self._get_ledger_check(),
            "system": self._get_system_check(),
        }
        
        # Gather metrics
        metrics = self._get_system_metrics()
        
        return DetailedHealth(
            status=status,
            service_status=service_status,
            uptime_seconds=time.time() - START_TIME,
            version=__version__,
            environment=self.settings.environment,
            checks=checks,
            metrics=metrics,
        )
    
    async def _check_ledger_access(self) -> bool:
        """Check if ledger directory is accessible."""
        try:
            ledger_dir = self.settings.ledger_path.parent
            if not ledger_dir.exists():
                # Try to create it
                ledger_dir.mkdir(parents=True, exist_ok=True)
            
            # Check if we can write to the directory
            test_file = ledger_dir / ".health_check"
            test_file.touch()
            test_file.unlink()
            
            return True
        except Exception:
            return False
    
    def _check_disk_space(self, min_gb: float = 0.1) -> bool:
        """Check if sufficient disk space is available."""
        try:
            disk_usage = psutil.disk_usage("/")
            available_gb = disk_usage.free / (1024 ** 3)
            return available_gb >= min_gb
        except Exception:
            return False
    
    async def _get_ledger_check(self) -> Dict[str, Any]:
        """Get detailed ledger check information."""
        try:
            ledger_path = self.settings.ledger_path
            ledger_dir = ledger_path.parent
            
            return {
                "status": "pass" if await self._check_ledger_access() else "fail",
                "path": str(ledger_path),
                "directory_exists": ledger_dir.exists(),
                "directory_writable": os.access(ledger_dir, os.W_OK) if ledger_dir.exists() else False,
                "file_exists": ledger_path.exists(),
            }
        except Exception as e:
            return {
                "status": "fail",
                "error": str(e),
            }
    
    def _get_system_check(self) -> Dict[str, Any]:
        """Get system health information."""
        try:
            return {
                "status": "pass",
                "cpu_percent": psutil.cpu_percent(interval=0.1),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_percent": psutil.disk_usage("/").percent,
            }
        except Exception as e:
            return {
                "status": "fail",
                "error": str(e),
            }
    
    def _get_system_metrics(self) -> Dict[str, Any]:
        """Get system metrics."""
        try:
            cpu_info = psutil.cpu_percent(interval=0.1, percpu=True)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            
            return {
                "cpu": {
                    "percent": psutil.cpu_percent(interval=0.1),
                    "count": psutil.cpu_count(),
                    "per_cpu": cpu_info,
                },
                "memory": {
                    "total_mb": memory.total / (1024 * 1024),
                    "available_mb": memory.available / (1024 * 1024),
                    "used_mb": memory.used / (1024 * 1024),
                    "percent": memory.percent,
                },
                "disk": {
                    "total_gb": disk.total / (1024 ** 3),
                    "used_gb": disk.used / (1024 ** 3),
                    "free_gb": disk.free / (1024 ** 3),
                    "percent": disk.percent,
                },
                "process": {
                    "pid": os.getpid(),
                    "threads": psutil.Process().num_threads(),
                    "memory_mb": psutil.Process().memory_info().rss / (1024 * 1024),
                },
            }
        except Exception as e:
            return {"error": str(e)}


# Global health service instance
health_service = HealthService()
```

### Step 3: Create Health Routes
Create `api/app/routes/health.py`:

```python
"""Health check routes for Budget Tool API."""

from fastapi import APIRouter, Response, status

from app.models.health import (
    DetailedHealth,
    HealthCheck,
    LivenessCheck,
    ReadinessCheck,
)
from app.services.health import health_service

router = APIRouter(
    prefix="/health",
    tags=["Health"],
    responses={
        200: {"description": "Service is healthy"},
        503: {"description": "Service is unhealthy"},
    },
)


@router.get("/", response_model=HealthCheck)
async def health_check() -> HealthCheck:
    """
    Basic health check endpoint.
    
    Returns overall health status of the service.
    """
    return await health_service.basic_health_check()


@router.get("/live", response_model=LivenessCheck)
async def liveness_probe(response: Response) -> LivenessCheck:
    """
    Kubernetes liveness probe endpoint.
    
    Returns whether the service is alive.
    Used by orchestrators to determine if the container should be restarted.
    """
    result = await health_service.liveness_check()
    
    if not result.alive:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return result


@router.get("/ready", response_model=ReadinessCheck)
async def readiness_probe(response: Response) -> ReadinessCheck:
    """
    Kubernetes readiness probe endpoint.
    
    Returns whether the service is ready to receive traffic.
    Used by orchestrators to determine if the container should receive requests.
    """
    result = await health_service.readiness_check()
    
    if not result.ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return result


@router.get("/detailed", response_model=DetailedHealth)
async def detailed_health() -> DetailedHealth:
    """
    Detailed health check endpoint.
    
    Returns comprehensive health information including system metrics.
    This endpoint should be protected in production.
    """
    return await health_service.detailed_health_check()
```

### Step 4: Update Main Application
Update `api/app/main.py` to include health routes and lifecycle events:

Add these imports at the top:
```python
from app.routes import health
from app.services.health import health_service
```

Update the lifespan context manager:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info(f"Starting {__app_name__} v{__version__}")
    logger.info(f"Environment: {get_settings().environment}")
    logger.info(f"Debug mode: {get_settings().debug}")
    
    # Initialize health service
    health_service.set_ready(False)
    
    # Initialize resources here
    await asyncio.sleep(0.5)  # Simulate initialization
    
    # Mark application as ready
    health_service.set_ready(True)
    logger.info("Application is ready to serve requests")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application")
    health_service.set_shutting_down(True)
    
    # Clean up resources here
    await asyncio.sleep(0.5)  # Simulate cleanup
```

Update the setup_routes function:
```python
def setup_routes(app: FastAPI) -> None:
    """Configure application routes."""
    settings = get_settings()
    
    # Include health routes
    app.include_router(health.router)
    
    # Existing root endpoints...
    @app.get("/", tags=["Root"])
    async def read_root() -> Dict[str, Any]:
        # ... existing code ...
```

### Step 5: Add psutil to requirements.txt
Update `api/requirements.txt` to add psutil:

Add this line after the utilities section:
```txt
# System Monitoring
psutil==5.9.8
```

### Step 6: Create Health Check Tests
Create `api/tests/test_health.py`:

```python
"""Tests for health check endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_basic_health_check():
    """Test basic health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "timestamp" in data
    assert "service" in data
    assert "version" in data


def test_liveness_probe():
    """Test liveness probe endpoint."""
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert "alive" in data
    assert data["alive"] is True


def test_readiness_probe():
    """Test readiness probe endpoint."""
    response = client.get("/health/ready")
    # May be 200 or 503 depending on initialization
    assert response.status_code in [200, 503]
    data = response.json()
    assert "ready" in data
    assert "checks" in data


def test_detailed_health():
    """Test detailed health endpoint."""
    response = client.get("/health/detailed")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "service_status" in data
    assert "uptime_seconds" in data
    assert "checks" in data
    assert "metrics" in data
```

### Step 7: Test the Health Endpoints
Run the application and test the endpoints:

```bash
# Install new dependency
pip install psutil

# Run the application
uvicorn app.main:app --reload

# In another terminal, test the endpoints
curl http://localhost:8000/health
curl http://localhost:8000/health/live
curl http://localhost:8000/health/ready
curl http://localhost:8000/health/detailed
```

## Success Criteria
- [ ] Health models created with Pydantic
- [ ] Health service implemented with comprehensive checks
- [ ] Health routes created with proper responses
- [ ] Main application updated with lifecycle management
- [ ] Liveness probe returns appropriate status
- [ ] Readiness probe checks all dependencies
- [ ] Detailed health provides system metrics
- [ ] Tests created and passing
- [ ] psutil dependency added
- [ ] All endpoints return correct HTTP status codes

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check new files exist
ls -la api/app/models/health.py
ls -la api/app/services/health.py
ls -la api/app/routes/health.py
ls -la api/tests/test_health.py

# Run the application
cd api
uvicorn app.main:app --reload &
sleep 5

# Test all health endpoints
echo "Testing basic health..."
curl -s http://localhost:8000/health | python -m json.tool

echo "Testing liveness..."
curl -s http://localhost:8000/health/live | python -m json.tool

echo "Testing readiness..."
curl -s http://localhost:8000/health/ready | python -m json.tool

echo "Testing detailed health..."
curl -s http://localhost:8000/health/detailed | python -m json.tool

# Run tests
pytest tests/test_health.py -v

# Kill the server
pkill -f uvicorn
```

## Troubleshooting
- If psutil installation fails, ensure build tools are installed
- If ledger checks fail, ensure the volumes directory exists
- If readiness is false, check the detailed endpoint for specifics
- On Windows, psutil may require Visual C++ redistributables
- If metrics are missing, verify psutil is properly installed

## Notes
- Liveness probe should be lightweight and fast
- Readiness probe can be more comprehensive
- Detailed health should be protected in production
- Health checks are crucial for container orchestration
- Consider adding authentication to detailed health endpoint
- Metrics can be extended for Prometheus integration

## Next Steps
After completing this task, proceed to:
- Task 06: Add CORS middleware and error handling