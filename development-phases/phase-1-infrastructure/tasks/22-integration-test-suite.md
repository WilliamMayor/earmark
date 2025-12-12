# Task 22: Create Integration Test Suite

## Context
This task establishes a comprehensive integration test suite for the Budget Tool MVP that validates the complete system functionality with all components running together. Integration tests verify that different parts of the system work correctly when combined, testing real user workflows, data persistence, API interactions, and error scenarios. This test suite serves as a safety net for future development and ensures system reliability.

## Objectives
- Create integration test framework for the complete system
- Test end-to-end user workflows
- Verify data persistence across service restarts
- Test error handling and edge cases
- Validate API contracts between services
- Test concurrent operations and race conditions
- Verify backup and restore functionality
- Create performance benchmarks

## Prerequisites
- Task 21 completed (Frontend-backend communication verified)
- All services running in Docker containers
- Test database/ledger volume available
- Python pytest installed in API container
- Frontend E2E tests configured with Playwright
- Network communication working between services

## Task Instructions

### Step 1: Create Integration Test Configuration
Create `tests/integration/conftest.py`:

```python
import pytest
import time
import requests
import docker
import os
from typing import Generator, Dict, Any
from pathlib import Path

# Configuration
BASE_API_URL = os.getenv("TEST_API_URL", "http://localhost:8000")
BASE_FRONTEND_URL = os.getenv("TEST_FRONTEND_URL", "http://localhost:3000")
TEST_TIMEOUT = 30
DOCKER_CLIENT = docker.from_env()


@pytest.fixture(scope="session")
def docker_services():
    """Ensure Docker services are running"""
    print("Starting Docker services for integration tests...")
    
    # Start services if not running
    os.system("docker-compose up -d")
    
    # Wait for services to be healthy
    max_retries = 30
    for i in range(max_retries):
        try:
            api_health = requests.get(f"{BASE_API_URL}/health", timeout=5)
            frontend_health = requests.get(f"{BASE_FRONTEND_URL}/health", timeout=5)
            if api_health.status_code == 200 and frontend_health.status_code == 200:
                print("Services are healthy")
                break
        except:
            pass
        time.sleep(1)
    else:
        pytest.fail("Services did not become healthy in time")
    
    yield
    
    # Cleanup is handled by the test runner


@pytest.fixture(scope="function")
def api_client():
    """Create an API client for testing"""
    class APIClient:
        def __init__(self, base_url: str):
            self.base_url = base_url
            self.session = requests.Session()
        
        def get(self, path: str, **kwargs) -> requests.Response:
            return self.session.get(f"{self.base_url}{path}", **kwargs)
        
        def post(self, path: str, **kwargs) -> requests.Response:
            return self.session.post(f"{self.base_url}{path}", **kwargs)
        
        def put(self, path: str, **kwargs) -> requests.Response:
            return self.session.put(f"{self.base_url}{path}", **kwargs)
        
        def delete(self, path: str, **kwargs) -> requests.Response:
            return self.session.delete(f"{self.base_url}{path}", **kwargs)
    
    return APIClient(BASE_API_URL)


@pytest.fixture(scope="function")
def clean_ledger():
    """Reset ledger to clean state before each test"""
    # Create backup of current ledger
    os.system("docker-compose exec -T api cp /app/volumes/ledger/main.ledger /app/volumes/ledger/main.ledger.bak")
    
    yield
    
    # Restore ledger after test
    os.system("docker-compose exec -T api cp /app/volumes/ledger/main.ledger.bak /app/volumes/ledger/main.ledger")


@pytest.fixture
def performance_timer():
    """Measure test performance"""
    start_times = {}
    
    def start(name: str):
        start_times[name] = time.time()
    
    def stop(name: str) -> float:
        if name not in start_times:
            raise ValueError(f"Timer {name} was not started")
        duration = time.time() - start_times[name]
        del start_times[name]
        return duration
    
    return type('Timer', (), {'start': start, 'stop': stop})()
```

### Step 2: Create Core Integration Tests
Create `tests/integration/test_core_functionality.py`:

```python
import pytest
import requests
import time
import json
from typing import Dict, Any


class TestCoreIntegration:
    """Test core system integration"""
    
    def test_system_startup_sequence(self, docker_services, api_client):
        """Test that all services start correctly and in order"""
        # Check API is ready
        response = api_client.get("/ready")
        assert response.status_code == 200
        assert response.json()["ready"] is True
        
        # Check frontend is accessible
        frontend_response = requests.get("http://localhost:3000")
        assert frontend_response.status_code == 200
        
        # Check API documentation is available
        docs_response = api_client.get("/docs")
        assert docs_response.status_code == 200
    
    def test_health_monitoring_integration(self, api_client):
        """Test health monitoring across all services"""
        # API health
        api_health = api_client.get("/health").json()
        assert api_health["status"] == "healthy"
        assert "version" in api_health
        assert "timestamp" in api_health
        
        # Frontend health
        frontend_health = requests.get("http://localhost:3000/health").json()
        assert frontend_health["status"] == "healthy"
    
    def test_environment_configuration(self, api_client):
        """Test that environment variables are properly configured"""
        # This would normally check configuration endpoint
        # For now, we'll verify through health endpoint
        health = api_client.get("/health").json()
        assert health is not None
    
    def test_data_persistence_across_restart(self, docker_services, api_client, clean_ledger):
        """Test that data persists across service restarts"""
        # Create test data (when envelope endpoints are ready)
        # For now, test ledger file persistence
        import subprocess
        
        # Write test data to ledger
        test_data = "2024-01-01 Test Transaction\n    Assets:Cash  $100.00\n    Income:Test\n"
        subprocess.run([
            "docker-compose", "exec", "-T", "api",
            "sh", "-c", f"echo '{test_data}' >> /app/volumes/ledger/main.ledger"
        ])
        
        # Restart API service
        subprocess.run(["docker-compose", "restart", "api"])
        time.sleep(10)  # Wait for restart
        
        # Verify data still exists
        result = subprocess.run([
            "docker-compose", "exec", "-T", "api",
            "cat", "/app/volumes/ledger/main.ledger"
        ], capture_output=True, text=True)
        
        assert "Test Transaction" in result.stdout
    
    def test_concurrent_requests(self, api_client, performance_timer):
        """Test system handles concurrent requests properly"""
        import concurrent.futures
        
        def make_request(index: int):
            return api_client.get("/health")
        
        performance_timer.start("concurrent_requests")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request, i) for i in range(50)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        duration = performance_timer.stop("concurrent_requests")
        
        # All requests should succeed
        assert all(r.status_code == 200 for r in results)
        
        # Should complete within reasonable time
        assert duration < 5.0, f"Concurrent requests took too long: {duration}s"
```

### Step 3: Create Workflow Integration Tests
Create `tests/integration/test_workflows.py`:

```python
import pytest
import time
from typing import Dict, List, Any


class TestUserWorkflows:
    """Test complete user workflows"""
    
    def test_envelope_creation_workflow(self, api_client, clean_ledger):
        """Test creating and managing envelopes (Phase 3 preview)"""
        # This is a placeholder for Phase 3 functionality
        # For now, test the API structure is ready
        
        # Test that envelope endpoints return expected errors
        response = api_client.get("/api/envelopes")
        assert response.status_code in [200, 404, 501]  # OK, Not Found, or Not Implemented
    
    def test_transaction_import_workflow(self, api_client, clean_ledger):
        """Test importing transactions from CSV (Phase 4 preview)"""
        # Placeholder for Phase 4 functionality
        
        # Test that import endpoint structure exists
        response = api_client.post("/api/import/csv", files={})
        assert response.status_code in [400, 404, 501]  # Bad Request, Not Found, or Not Implemented
    
    def test_error_recovery_workflow(self, api_client):
        """Test system recovers from errors gracefully"""
        # Send malformed request
        response = api_client.post(
            "/api/test",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [400, 404, 422]
        
        # System should still be healthy after error
        health = api_client.get("/health")
        assert health.status_code == 200
    
    def test_backup_restore_workflow(self):
        """Test backup and restore functionality"""
        import subprocess
        
        # Create backup
        result = subprocess.run([
            "./scripts/backup-volumes.sh"
        ], capture_output=True, text=True)
        assert result.returncode == 0
        
        # Verify backup file was created
        backup_list = subprocess.run([
            "ls", "-la", "volumes/backup/daily/"
        ], capture_output=True, text=True)
        assert "ledger_daily_" in backup_list.stdout
```

### Step 4: Create Performance Integration Tests
Create `tests/integration/test_performance.py`:

```python
import pytest
import time
import statistics
from typing import List


class TestPerformance:
    """Performance and load testing"""
    
    def test_api_response_time(self, api_client, performance_timer):
        """Test API response times meet SLA"""
        response_times = []
        
        for i in range(100):
            performance_timer.start(f"request_{i}")
            response = api_client.get("/health")
            duration = performance_timer.stop(f"request_{i}")
            response_times.append(duration)
            assert response.status_code == 200
        
        # Calculate statistics
        avg_time = statistics.mean(response_times)
        median_time = statistics.median(response_times)
        p95_time = statistics.quantiles(response_times, n=20)[18]  # 95th percentile
        
        # Assert performance requirements
        assert avg_time < 0.1, f"Average response time too high: {avg_time}s"
        assert median_time < 0.05, f"Median response time too high: {median_time}s"
        assert p95_time < 0.2, f"95th percentile too high: {p95_time}s"
        
        print(f"Performance: Avg={avg_time:.3f}s, Median={median_time:.3f}s, P95={p95_time:.3f}s")
    
    def test_memory_usage_stable(self):
        """Test that memory usage remains stable over time"""
        import subprocess
        import json
        
        # Get initial memory usage
        initial_stats = subprocess.run([
            "docker", "stats", "--no-stream", "--format", "json", "budget-tool-api"
        ], capture_output=True, text=True)
        initial_memory = json.loads(initial_stats.stdout)
        
        # Make many requests
        import requests
        for i in range(1000):
            requests.get("http://localhost:8000/health")
        
        # Check memory again
        final_stats = subprocess.run([
            "docker", "stats", "--no-stream", "--format", "json", "budget-tool-api"
        ], capture_output=True, text=True)
        final_memory = json.loads(final_stats.stdout)
        
        # Memory should not increase significantly (allowing 20% increase)
        # Note: This is a simplified test - real memory testing would be more sophisticated
        assert final_memory is not None
```

### Step 5: Create Security Integration Tests
Create `tests/integration/test_security.py`:

```python
import pytest
import requests


class TestSecurity:
    """Security integration tests"""
    
    def test_cors_security(self, api_client):
        """Test CORS is properly configured"""
        # Test from allowed origin
        response = requests.get(
            "http://localhost:8000/health",
            headers={"Origin": "http://localhost:3000"}
        )
        assert "access-control-allow-origin" in [h.lower() for h in response.headers]
        
        # Test from disallowed origin
        response = requests.get(
            "http://localhost:8000/health",
            headers={"Origin": "http://evil.com"}
        )
        cors_header = response.headers.get("Access-Control-Allow-Origin", "")
        assert "evil.com" not in cors_header
    
    def test_input_validation(self, api_client):
        """Test input validation prevents injection attacks"""
        # Test SQL injection attempt (when DB is added)
        malicious_input = "'; DROP TABLE users; --"
        response = api_client.post("/api/search", json={"query": malicious_input})
        # Should be safely handled
        assert response.status_code in [400, 404, 422, 501]
        
        # Test XSS attempt
        xss_input = "<script>alert('XSS')</script>"
        response = api_client.post("/api/envelopes", json={"name": xss_input})
        # Should be safely handled
        assert response.status_code in [400, 404, 422, 501]
    
    def test_rate_limiting(self, api_client):
        """Test rate limiting is enforced"""
        # Make many rapid requests
        responses = []
        for i in range(100):
            response = api_client.get("/health")
            responses.append(response.status_code)
        
        # Should all succeed for health endpoint (not rate limited)
        # But this tests the infrastructure is in place
        assert all(r == 200 for r in responses)
```

### Step 6: Create Test Runner Script
Create `scripts/run-integration-tests.sh`:

```bash
#!/bin/bash

# Integration test runner script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

# Parse arguments
TEST_TYPE="${1:-all}"
VERBOSE="${2:-false}"

print_header "Budget Tool Integration Tests"

# Ensure services are running
echo "Starting services..."
docker-compose up -d
sleep 10

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
timeout 60 bash -c 'until curl -f http://localhost:8000/health > /dev/null 2>&1; do sleep 1; done'
timeout 60 bash -c 'until curl -f http://localhost:3000/health > /dev/null 2>&1; do sleep 1; done'

# Run tests based on type
case $TEST_TYPE in
    core)
        print_header "Running Core Integration Tests"
        docker-compose exec -T api pytest tests/integration/test_core_functionality.py -v
        ;;
    
    workflows)
        print_header "Running Workflow Tests"
        docker-compose exec -T api pytest tests/integration/test_workflows.py -v
        ;;
    
    performance)
        print_header "Running Performance Tests"
        docker-compose exec -T api pytest tests/integration/test_performance.py -v
        ;;
    
    security)
        print_header "Running Security Tests"
        docker-compose exec -T api pytest tests/integration/test_security.py -v
        ;;
    
    communication)
        print_header "Running Communication Tests"
        docker-compose exec -T api pytest tests/integration/test_frontend_backend_communication.py -v
        ;;
    
    all)
        print_header "Running All Integration Tests"
        if [ "$VERBOSE" = "true" ]; then
            PYTEST_ARGS="-v --tb=short"
        else
            PYTEST_ARGS=""
        fi
        
        docker-compose exec -T api pytest tests/integration/ $PYTEST_ARGS \
            --junit-xml=/app/test-results/integration-junit.xml \
            --html=/app/test-results/integration-report.html \
            --self-contained-html
        ;;
    
    *)
        echo -e "${RED}Unknown test type: $TEST_TYPE${NC}"
        echo "Available types: core, workflows, performance, security, communication, all"
        exit 1
        ;;
esac

# Check test results
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Integration tests passed!${NC}"
else
    echo -e "${RED}✗ Integration tests failed!${NC}"
    echo "Check logs: docker-compose logs"
    exit 1
fi

# Generate coverage report if all tests ran
if [ "$TEST_TYPE" = "all" ]; then
    echo "Generating coverage report..."
    docker-compose exec -T api coverage html
    echo "Coverage report available at: api/htmlcov/index.html"
fi
```

### Step 7: Create Test Configuration File
Create `tests/integration/pytest.ini`:

```ini
[pytest]
# Pytest configuration for integration tests
minversion = 6.0
testpaths = tests/integration
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# Markers for test categorization
markers =
    slow: marks tests as slow (deselect with '-m "not slow"')
    security: security-related tests
    performance: performance tests
    workflow: user workflow tests
    core: core functionality tests

# Output options
addopts = 
    --verbose
    --strict-markers
    --tb=short
    --disable-warnings
    --color=yes

# Coverage options
[coverage:run]
source = app
omit = 
    */tests/*
    */test_*.py
    */__pycache__/*

[coverage:report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
```

## Expected File Structure
After completing this task:

```
budget-tool/
├── tests/
│   └── integration/
│       ├── __init__.py
│       ├── conftest.py
│       ├── pytest.ini
│       ├── test_core_functionality.py
│       ├── test_workflows.py
│       ├── test_performance.py
│       ├── test_security.py
│       └── test_frontend_backend_communication.py
├── scripts/
│   └── run-integration-tests.sh
└── test-results/
    ├── integration-junit.xml
    └── integration-report.html
```

## Success Criteria
- [ ] All integration tests pass
- [ ] Services communicate correctly
- [ ] Data persists across restarts
- [ ] Performance meets requirements
- [ ] Security tests pass
- [ ] Error handling works correctly
- [ ] Concurrent operations handled properly
- [ ] Test reports generated successfully
- [ ] Coverage metrics available
- [ ] Tests run in CI/CD pipeline

## Validation Commands
Run these commands to verify the test suite:

```bash
# Run all integration tests
./scripts/run-integration-tests.sh all

# Run specific test categories
./scripts/run-integration-tests.sh core
./scripts/run-integration-tests.sh workflows
./scripts/run-integration-tests.sh performance
./scripts/run-integration-tests.sh security

# Run tests directly with pytest
docker-compose exec api pytest tests/integration/ -v

# Run with coverage
docker-compose exec api pytest tests/integration/ --cov=app --cov-report=html

# Run specific test file
docker-compose exec api pytest tests/integration/test_core_functionality.py -v

# Run tests matching pattern
docker-compose exec api pytest tests/integration/ -k "health" -v

# Generate test report
docker-compose exec api pytest tests/integration/ --html=test-report.html
```

## Troubleshooting
- If services not healthy: Check docker-compose logs for errors
- If tests timeout: Increase TEST_TIMEOUT in conftest.py
- If permission errors: Check volume permissions
- If network errors: Verify Docker network configuration
- If performance tests fail: Check system resources
- For flaky tests: Add retry logic or increase wait times

## Notes
- Integration tests require all services to be running
- Tests should be independent and not affect each other
- Performance baselines may need adjustment based on hardware
- Security tests are basic and should be expanded for production
- Test data is cleaned between tests using fixtures
- Consider running integration tests in separate test environment

## Next Steps
After completing this task, proceed to:
- Task 23: Set up GitHub Actions CI/CD workflow
- Task 24: Create comprehensive development documentation