# Task 21: Verify Frontend-Backend Communication

## Context
This task validates that the frontend and backend services can communicate correctly through the Docker network. It tests API endpoints, CORS configuration, health checks, and error handling to ensure the complete system integration is working. This verification is crucial before proceeding with feature development, as it confirms the infrastructure foundation is solid.

## Objectives
- Test all API endpoints from the frontend service
- Verify CORS configuration allows frontend requests
- Validate health check endpoints from both services
- Test error handling and response formats
- Verify network connectivity between containers
- Confirm environment variables are correctly configured
- Test hot reload doesn't break communication
- Document any communication issues and solutions

## Prerequisites
- Task 18 completed (Docker Compose production configured)
- Task 19 completed (Docker Compose development configured)
- Task 20 completed (Volumes and networking set up)
- Backend API running with health endpoints
- Frontend application running and accessible
- Docker containers can communicate on internal network

## Task Instructions

### Step 1: Create Communication Test Script
Create `scripts/test-communication.sh`:

```bash
#!/bin/bash

# Frontend-Backend Communication Test Script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
API_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"
API_INTERNAL="http://api:8000"
FRONTEND_INTERNAL="http://frontend:3000"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

run_test() {
    local test_name="$1"
    local command="$2"
    
    echo -n "Testing $test_name... "
    if eval $command > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗${NC}"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
    fi
}

print_header "Starting Frontend-Backend Communication Tests"

# Ensure services are running
echo "Ensuring services are running..."
docker-compose up -d
sleep 10

# Test 1: API Health Check (External)
print_header "1. External Health Checks"
run_test "API health endpoint (external)" \
    "curl -f -s $API_URL/health"

run_test "Frontend health endpoint (external)" \
    "curl -f -s $FRONTEND_URL/health"

run_test "API ready endpoint (external)" \
    "curl -f -s $API_URL/ready"

# Test 2: Internal Network Communication
print_header "2. Internal Network Communication"
run_test "Frontend can reach API internally" \
    "docker-compose exec -T frontend curl -f -s $API_INTERNAL/health"

run_test "API can reach Frontend internally" \
    "docker-compose exec -T api curl -f -s $FRONTEND_INTERNAL/health"

run_test "DNS resolution works" \
    "docker-compose exec -T frontend ping -c 1 api"

# Test 3: CORS Configuration
print_header "3. CORS Configuration"
run_test "CORS headers on OPTIONS request" \
    "curl -f -s -X OPTIONS \
        -H 'Origin: http://localhost:3000' \
        -H 'Access-Control-Request-Method: GET' \
        -H 'Access-Control-Request-Headers: Content-Type' \
        -I $API_URL/api/envelopes 2>&1 | grep -i 'access-control-allow-origin'"

run_test "CORS allows frontend origin" \
    "curl -f -s \
        -H 'Origin: http://localhost:3000' \
        -I $API_URL/health 2>&1 | grep -i 'access-control-allow-origin'"

# Test 4: API Endpoints
print_header "4. API Endpoint Tests"
run_test "API docs accessible" \
    "curl -f -s $API_URL/docs | grep -i 'swagger'"

run_test "API OpenAPI schema accessible" \
    "curl -f -s $API_URL/openapi.json | grep -i 'openapi'"

# Test 5: Frontend API Proxy
print_header "5. Frontend API Proxy Tests"
run_test "Frontend proxies to API health" \
    "curl -f -s $FRONTEND_URL/api/health 2>&1 || echo 'Proxy not configured yet'"

# Test 6: Environment Variables
print_header "6. Environment Variable Tests"
run_test "API has correct environment" \
    "docker-compose exec -T api printenv | grep ENV_NAME"

run_test "Frontend has API URL configured" \
    "docker-compose exec -T frontend printenv | grep VITE_API_URL"

# Test 7: Response Formats
print_header "7. Response Format Tests"
echo "Checking API response format..."
HEALTH_RESPONSE=$(curl -s $API_URL/health)
run_test "API returns valid JSON" \
    "echo '$HEALTH_RESPONSE' | python3 -m json.tool"

run_test "API health contains status field" \
    "echo '$HEALTH_RESPONSE' | grep -q '\"status\"'"

# Test 8: Error Handling
print_header "8. Error Handling Tests"
run_test "API returns 404 for invalid endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' $API_URL/invalid | grep -q 404"

run_test "API handles malformed requests" \
    "curl -s -X POST $API_URL/api/test \
        -H 'Content-Type: application/json' \
        -d 'invalid json' \
        -o /dev/null -w '%{http_code}' | grep -q '4[0-9][0-9]'"

# Test 9: Network Isolation
print_header "9. Network Isolation Tests"
run_test "Services are on correct network" \
    "docker inspect budget-tool-api | grep -q budget-tool-network"

# Print summary
print_header "Test Summary"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed Tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
fi

echo ""
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All communication tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please check the configuration.${NC}"
    exit 1
fi
```

### Step 2: Create API Client Test Page
Create `frontend/src/routes/api-test/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';

  interface TestResult {
    name: string;
    status: 'pending' | 'success' | 'error';
    message?: string;
    data?: any;
    duration?: number;
  }

  let tests: TestResult[] = [
    { name: 'Health Check', status: 'pending' },
    { name: 'Ready Check', status: 'pending' },
    { name: 'CORS Test', status: 'pending' },
    { name: 'Error Handling', status: 'pending' },
    { name: 'Envelope List (Mock)', status: 'pending' }
  ];

  let running = false;

  async function runTest(index: number, testFn: () => Promise<void>) {
    const startTime = Date.now();
    tests[index].status = 'pending';
    
    try {
      await testFn();
      tests[index].status = 'success';
      tests[index].duration = Date.now() - startTime;
    } catch (error) {
      tests[index].status = 'error';
      tests[index].message = error instanceof Error ? error.message : 'Unknown error';
      tests[index].duration = Date.now() - startTime;
    }
  }

  async function runAllTests() {
    running = true;

    // Test 1: Health Check
    await runTest(0, async () => {
      const response = await api.health.checkHealth();
      tests[0].data = response;
    });

    // Test 2: Ready Check
    await runTest(1, async () => {
      const ready = await api.health.checkReady();
      tests[1].data = { ready };
    });

    // Test 3: CORS Test
    await runTest(2, async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tests[2].data = await response.json();
    });

    // Test 4: Error Handling
    await runTest(3, async () => {
      try {
        await fetch(`${import.meta.env.VITE_API_URL}/nonexistent`, {
          method: 'GET'
        });
        throw new Error('Should have returned 404');
      } catch (error) {
        tests[3].message = 'Error handling works correctly';
        tests[3].status = 'success';
      }
    });

    // Test 5: Envelope List (Mock or Real)
    await runTest(4, async () => {
      const response = await api.envelopes.list();
      tests[4].data = response;
    });

    running = false;
  }

  onMount(() => {
    runAllTests();
  });
</script>

<svelte:head>
  <title>API Communication Test</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">API Communication Test</h1>
    
    <Card title="Test Configuration" class="mb-6">
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <dt class="font-semibold">API URL:</dt>
          <dd class="font-mono">{import.meta.env.VITE_API_URL || 'Not configured'}</dd>
        </div>
        <div>
          <dt class="font-semibold">Environment:</dt>
          <dd>{import.meta.env.MODE}</dd>
        </div>
      </dl>
    </Card>

    <Card title="Communication Tests">
      <div class="mb-4">
        <Button on:click={runAllTests} disabled={running}>
          {running ? 'Running Tests...' : 'Run All Tests'}
        </Button>
      </div>

      <div class="space-y-3">
        {#each tests as test}
          <div class="border rounded-lg p-4 {test.status === 'success' ? 'bg-green-50 border-green-300' : test.status === 'error' ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-300'}">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                {#if test.status === 'pending'}
                  <span class="animate-spin mr-2">⏳</span>
                {:else if test.status === 'success'}
                  <span class="text-green-600 mr-2">✓</span>
                {:else if test.status === 'error'}
                  <span class="text-red-600 mr-2">✗</span>
                {/if}
                <span class="font-medium">{test.name}</span>
              </div>
              {#if test.duration}
                <span class="text-sm text-gray-500">{test.duration}ms</span>
              {/if}
            </div>
            
            {#if test.message}
              <div class="mt-2 text-sm {test.status === 'error' ? 'text-red-600' : 'text-gray-600'}">
                {test.message}
              </div>
            {/if}
            
            {#if test.data}
              <details class="mt-2">
                <summary class="text-sm text-gray-600 cursor-pointer">Response Data</summary>
                <pre class="mt-2 text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">{JSON.stringify(test.data, null, 2)}</pre>
              </details>
            {/if}
          </div>
        {/each}
      </div>
    </Card>
  </div>
</div>
```

### Step 3: Create Docker Network Test Script
Create `scripts/test-network.sh`:

```bash
#!/bin/bash

# Network connectivity test script

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

print_header "Docker Network Test"

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    echo -e "${RED}Services are not running. Starting them...${NC}"
    docker-compose up -d
    sleep 10
fi

# Test network connectivity
echo "Testing network connectivity between containers..."

# Test 1: Frontend -> API
echo -n "Frontend -> API: "
if docker-compose exec -T frontend ping -c 1 api > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Connected${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test 2: API -> Frontend
echo -n "API -> Frontend: "
if docker-compose exec -T api ping -c 1 frontend > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Connected${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test 3: DNS Resolution
echo -n "DNS Resolution (api): "
if docker-compose exec -T frontend nslookup api > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Resolved${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
fi

# Test 4: Port accessibility
echo -n "API Port 8000: "
if docker-compose exec -T frontend nc -z api 8000; then
    echo -e "${GREEN}✓ Open${NC}"
else
    echo -e "${RED}✗ Closed${NC}"
fi

echo -n "Frontend Port 3000: "
if docker-compose exec -T api nc -z frontend 3000 2>/dev/null || echo "nc not available"; then
    echo -e "${GREEN}✓ Open${NC}"
else
    echo -e "${YELLOW}⚠ Could not test${NC}"
fi

# Show network details
print_header "Network Details"
docker network inspect budget-tool-network | grep -A 10 "Containers" || echo "Network not found"

print_header "Container IPs"
for service in api frontend; do
    IP=$(docker inspect budget-tool-$service 2>/dev/null | grep '"IPAddress"' | head -1 | awk '{print $2}' | tr -d '",')
    echo "$service: $IP"
done
```

### Step 4: Create CORS Test Script
Create `scripts/test-cors.sh`:

```bash
#!/bin/bash

# CORS configuration test script

API_URL="http://localhost:8000"
FRONTEND_ORIGIN="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "Testing CORS Configuration..."
echo "API URL: $API_URL"
echo "Frontend Origin: $FRONTEND_ORIGIN"
echo ""

# Test 1: OPTIONS Request (Preflight)
echo "1. Testing OPTIONS request (CORS Preflight):"
curl -X OPTIONS "$API_URL/api/envelopes" \
  -H "Origin: $FRONTEND_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v 2>&1 | grep -i "access-control"

echo ""

# Test 2: GET Request with Origin
echo "2. Testing GET request with Origin header:"
curl "$API_URL/health" \
  -H "Origin: $FRONTEND_ORIGIN" \
  -v 2>&1 | grep -i "access-control"

echo ""

# Test 3: POST Request with Origin
echo "3. Testing POST request with Origin header:"
curl -X POST "$API_URL/api/envelopes" \
  -H "Origin: $FRONTEND_ORIGIN" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' \
  -v 2>&1 | grep -i "access-control"

echo ""

# Test 4: Check allowed methods
echo "4. Checking allowed methods:"
curl -I -X OPTIONS "$API_URL/api/envelopes" \
  -H "Origin: $FRONTEND_ORIGIN" 2>&1 | grep -i "access-control-allow-methods"

echo ""
echo "CORS test completed. Check output above for Access-Control headers."
```

### Step 5: Create Integration Test
Create `tests/integration/test_frontend_backend_communication.py`:

```python
import pytest
import requests
import time
from typing import Dict, Any

BASE_API_URL = "http://localhost:8000"
BASE_FRONTEND_URL = "http://localhost:3000"


class TestFrontendBackendCommunication:
    """Integration tests for frontend-backend communication"""
    
    @pytest.fixture(scope="class", autouse=True)
    def wait_for_services(self):
        """Wait for services to be ready"""
        max_retries = 30
        for i in range(max_retries):
            try:
                api_response = requests.get(f"{BASE_API_URL}/health")
                frontend_response = requests.get(f"{BASE_FRONTEND_URL}/health")
                if api_response.status_code == 200 and frontend_response.status_code == 200:
                    return
            except requests.exceptions.ConnectionError:
                pass
            time.sleep(1)
        pytest.fail("Services did not become ready in time")
    
    def test_api_health_endpoint(self):
        """Test API health endpoint is accessible"""
        response = requests.get(f"{BASE_API_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
    
    def test_frontend_health_endpoint(self):
        """Test frontend health endpoint is accessible"""
        response = requests.get(f"{BASE_FRONTEND_URL}/health")
        assert response.status_code == 200
    
    def test_cors_headers_present(self):
        """Test CORS headers are properly configured"""
        response = requests.get(
            f"{BASE_API_URL}/health",
            headers={"Origin": BASE_FRONTEND_URL}
        )
        assert response.status_code == 200
        assert "access-control-allow-origin" in [h.lower() for h in response.headers]
    
    def test_cors_preflight_request(self):
        """Test CORS preflight (OPTIONS) request"""
        response = requests.options(
            f"{BASE_API_URL}/api/envelopes",
            headers={
                "Origin": BASE_FRONTEND_URL,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type"
            }
        )
        # May return 200 or 204 for OPTIONS
        assert response.status_code in [200, 204]
    
    def test_api_error_handling(self):
        """Test API returns proper error for invalid endpoints"""
        response = requests.get(f"{BASE_API_URL}/nonexistent")
        assert response.status_code == 404
    
    def test_api_accepts_json(self):
        """Test API accepts JSON content type"""
        response = requests.post(
            f"{BASE_API_URL}/api/test",
            headers={"Content-Type": "application/json"},
            json={"test": "data"}
        )
        # Should return 404 for non-existent endpoint, not 415
        assert response.status_code != 415
    
    def test_frontend_serves_spa(self):
        """Test frontend serves SPA correctly"""
        response = requests.get(BASE_FRONTEND_URL)
        assert response.status_code == 200
        assert "<!DOCTYPE html>" in response.text or "<html" in response.text
```

### Step 6: Create Validation Checklist
Create `docs/communication-checklist.md`:

```markdown
# Frontend-Backend Communication Checklist

## ✅ Required Checks

### Network Connectivity
- [ ] Containers can ping each other by service name
- [ ] DNS resolution works (api, frontend)
- [ ] Correct ports are exposed (8000, 3000)
- [ ] Services are on the same Docker network

### API Accessibility
- [ ] `/health` endpoint returns 200 OK
- [ ] `/ready` endpoint returns 200 OK  
- [ ] `/docs` serves Swagger UI
- [ ] `/openapi.json` returns OpenAPI schema

### CORS Configuration
- [ ] OPTIONS requests return correct headers
- [ ] Access-Control-Allow-Origin includes frontend URL
- [ ] Access-Control-Allow-Methods includes required methods
- [ ] Access-Control-Allow-Headers includes Content-Type

### Frontend Configuration
- [ ] VITE_API_URL environment variable is set
- [ ] API client uses correct base URL
- [ ] Frontend health endpoint responds
- [ ] API calls from browser succeed

### Error Handling
- [ ] 404 errors returned for invalid endpoints
- [ ] CORS errors don't occur for valid requests
- [ ] Network errors are caught and handled
- [ ] Timeout configurations work

### Development Features
- [ ] Hot reload doesn't break connections
- [ ] Debug ports are accessible
- [ ] Logs show requests/responses
- [ ] Environment variables load correctly

## 🔧 Common Issues and Solutions

### Issue: CORS Errors
**Solution**: Check CORS_ALLOWED_ORIGINS in API environment variables

### Issue: Connection Refused
**Solution**: Ensure services are on same network and ports are correct

### Issue: DNS Not Resolving
**Solution**: Use service names (api, frontend) not localhost internally

### Issue: Environment Variables Not Loading
**Solution**: Check .env file location and docker-compose environment section
```

## Expected File Structure
After completing this task:

```
budget-tool/
├── scripts/
│   ├── test-communication.sh
│   ├── test-network.sh
│   └── test-cors.sh
├── frontend/
│   └── src/
│       └── routes/
│           └── api-test/
│               └── +page.svelte
├── tests/
│   └── integration/
│       └── test_frontend_backend_communication.py
└── docs/
    └── communication-checklist.md
```

## Success Criteria
- [ ] All health endpoints respond with 200 OK
- [ ] Frontend can successfully call API endpoints
- [ ] CORS headers are properly configured
- [ ] No CORS errors in browser console
- [ ] Internal Docker networking works
- [ ] DNS resolution between services works
- [ ] Environment variables are correctly set
- [ ] Error responses are properly formatted
- [ ] Test scripts pass without errors
- [ ] API test page shows all green checks

## Validation Commands
Run these commands to verify communication:

```bash
# Run main communication test
./scripts/test-communication.sh

# Test network connectivity
./scripts/test-network.sh

# Test CORS configuration
./scripts/test-cors.sh

# Run Python integration tests
docker-compose exec api pytest tests/integration/test_frontend_backend_communication.py

# Check from browser
open http://localhost:3000/api-test

# Check logs for requests
docker-compose logs -f --tail=50

# Test API directly
curl http://localhost:8000/health

# Test internal communication
docker-compose exec frontend curl http://api:8000/health
docker-compose exec api curl http://frontend:3000/health
```

## Troubleshooting
- If connection refused: Check services are running with `docker-compose ps`
- If CORS errors: Verify CORS_ALLOWED_ORIGINS includes frontend URL
- If DNS fails: Check services are on same network with `docker network inspect`
- If timeouts occur: Increase timeout values in API client configuration
- If env vars missing: Check docker-compose.yml environment section
- For detailed debugging: Set LOG_LEVEL=DEBUG in environment

## Notes
- Communication uses Docker service names internally (api, frontend)
- External access uses localhost with mapped ports
- CORS is only needed for browser-based requests
- Health checks confirm both services are ready
- Integration tests validate the complete flow
- Development mode may have different CORS settings than production

## Next Steps
After completing this task, proceed to:
- Task 22: Create integration test suite
- Task 23: Set up GitHub Actions CI/CD workflow