# Task 08: Create Backend Dockerfile

## Context
This task creates a production-ready Dockerfile for the Budget Tool API backend. The Dockerfile uses multi-stage builds to optimize image size, implements security best practices with non-root users, and includes health checks for container orchestration. The configuration ensures efficient layer caching and minimal attack surface.

## Objectives
- Create multi-stage Dockerfile for optimal image size
- Configure non-root user for security
- Implement Docker health checks
- Optimize layer caching for faster builds
- Set up production-ready Python environment
- Configure proper signal handling for graceful shutdown
- Minimize security vulnerabilities

## Prerequisites
- Task 07 completed (logging configured)
- FastAPI application structure complete
- requirements.txt file exists
- Understanding of Docker concepts

## Task Instructions

### Step 1: Create Backend Dockerfile
Create `api/Dockerfile`:

```dockerfile
# Multi-stage build for Budget Tool API

# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install system dependencies for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install dependencies
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create necessary directories with correct permissions
RUN mkdir -p /app/logs /app/volumes/ledger /app/volumes/ledger/backups && \
    chown -R appuser:appuser /app

# Copy application code
COPY --chown=appuser:appuser ./app ./app
COPY --chown=appuser:appuser ./setup.py ./setup.py
COPY --chown=appuser:appuser ./pyproject.toml ./pyproject.toml

# Set environment variables
ENV PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Step 2: Create .dockerignore File
Create `api/.dockerignore`:

```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
ENV/
.venv
pip-log.txt
pip-delete-this-directory.txt
.pytest_cache/
.coverage
htmlcov/
.tox/
.hypothesis/
*.egg-info/
*.egg

# Development
.env
.env.*
!.env.example
*.log
logs/
*.sqlite
*.db

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Git
.git/
.gitignore

# Docker
Dockerfile
docker-compose*.yml
.dockerignore

# Documentation
docs/
*.md
!README.md

# Tests
tests/
test_*.py
*_test.py
conftest.py

# Build artifacts
build/
dist/
*.whl

# Temporary files
*.tmp
*.temp
.temp/
.tmp/
```

### Step 3: Create Production Dockerfile
Create `api/Dockerfile.prod` for production optimizations:

```dockerfile
# Production Dockerfile with additional optimizations

# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies with production optimizations
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt && \
    find /opt/venv -type f -name "*.pyc" -delete && \
    find /opt/venv -type d -name "__pycache__" -delete

# Stage 2: Security scanner (optional)
FROM builder AS security

# Install safety for vulnerability scanning
RUN pip install safety

# Check for known security vulnerabilities
RUN safety check --json || true

# Stage 3: Runtime
FROM python:3.11-slim AS runtime

# Install runtime dependencies and security updates
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with specific UID/GID
RUN groupadd -r -g 1001 appuser && \
    useradd -r -u 1001 -g appuser appuser

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create necessary directories
RUN mkdir -p /app/logs /app/volumes/ledger /app/volumes/ledger/backups && \
    chown -R appuser:appuser /app

# Copy application code
COPY --chown=appuser:appuser ./app ./app

# Set production environment variables
ENV PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    HOST=0.0.0.0 \
    PORT=8000 \
    ENVIRONMENT=production \
    LOG_LEVEL=INFO \
    LOG_FORMAT=json

# Security: Set filesystem to read-only for app code
RUN chmod -R 555 /app/app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check with tighter timings for production
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

# Use exec form to ensure proper signal handling
ENTRYPOINT ["uvicorn"]
CMD ["app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

### Step 4: Create Development Dockerfile
Create `api/Dockerfile.dev` for development with hot reload:

```dockerfile
# Development Dockerfile with hot reload support

FROM python:3.11-slim

# Install development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3-dev \
    libpq-dev \
    curl \
    vim \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements files
COPY requirements.txt requirements-dev.txt ./

# Install dependencies (including dev dependencies)
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements-dev.txt

# Create directories
RUN mkdir -p /app/logs /app/volumes/ledger /app/volumes/ledger/backups

# Set environment variables for development
ENV PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    ENVIRONMENT=development \
    LOG_LEVEL=DEBUG \
    LOG_FORMAT=text

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with hot reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app"]
```

### Step 5: Create Build Script
Create `api/scripts/build.sh`:

```bash
#!/bin/bash
# Build script for Budget Tool API Docker images

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="budget-tool-api"
VERSION=${VERSION:-"latest"}
DOCKERFILE=${DOCKERFILE:-"Dockerfile"}

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --prod|--production)
            DOCKERFILE="Dockerfile.prod"
            shift
            ;;
        --dev|--development)
            DOCKERFILE="Dockerfile.dev"
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --help)
            echo "Usage: ./build.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --prod, --production  Use production Dockerfile"
            echo "  --dev, --development  Use development Dockerfile"
            echo "  --version VERSION     Set image version tag"
            echo "  --no-cache           Build without cache"
            echo "  --help               Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Build the image
print_info "Building Docker image: ${IMAGE_NAME}:${VERSION}"
print_info "Using Dockerfile: ${DOCKERFILE}"

docker build \
    ${NO_CACHE} \
    -f ${DOCKERFILE} \
    -t ${IMAGE_NAME}:${VERSION} \
    .

if [ $? -eq 0 ]; then
    print_info "Successfully built ${IMAGE_NAME}:${VERSION}"
    
    # Show image size
    SIZE=$(docker images ${IMAGE_NAME}:${VERSION} --format "{{.Size}}")
    print_info "Image size: ${SIZE}"
    
    # Run security scan if production build
    if [[ "${DOCKERFILE}" == "Dockerfile.prod" ]]; then
        print_info "Running security scan..."
        docker run --rm ${IMAGE_NAME}:${VERSION} safety check || true
    fi
else
    print_error "Failed to build Docker image"
    exit 1
fi
```

Make the script executable:
```bash
chmod +x api/scripts/build.sh
```

### Step 6: Create Docker Compose Override for Development
Create `api/docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    volumes:
      - ./api/app:/app/app:ro
      - ./api/tests:/app/tests:ro
      - ./volumes/ledger:/app/volumes/ledger
      - ./logs:/app/logs
    environment:
      - ENVIRONMENT=development
      - LOG_LEVEL=DEBUG
      - LOG_FORMAT=text
      - RELOAD=true
    ports:
      - "8000:8000"
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### Step 7: Test Docker Build
Build and test the Docker image:

```bash
cd api

# Build standard image
docker build -t budget-tool-api:test .

# Test the image
docker run --rm -p 8000:8000 budget-tool-api:test &
sleep 10

# Test health check
curl http://localhost:8000/health

# Stop the container
docker stop $(docker ps -q --filter ancestor=budget-tool-api:test)

# Check image size
docker images budget-tool-api:test
```

## Success Criteria
- [ ] Standard Dockerfile created with multi-stage build
- [ ] Production Dockerfile with additional optimizations
- [ ] Development Dockerfile with hot reload support
- [ ] .dockerignore file prevents unnecessary files from being included
- [ ] Non-root user configured for security
- [ ] Health check implemented in Dockerfile
- [ ] Build script created for convenience
- [ ] Docker Compose override for development
- [ ] Image builds successfully
- [ ] Container runs and passes health check
- [ ] Image size is optimized (< 200MB for production)

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check files exist
ls -la api/Dockerfile*
ls -la api/.dockerignore
ls -la api/scripts/build.sh

# Build the image
cd api
docker build -t budget-tool-api:test .

# Check image details
docker images budget-tool-api:test
docker history budget-tool-api:test

# Run container and test
docker run -d --name test-api -p 8000:8000 budget-tool-api:test
sleep 5

# Test health check
docker inspect test-api --format='{{.State.Health.Status}}'
curl http://localhost:8000/health

# Check running as non-root user
docker exec test-api whoami  # Should output: appuser

# Check logs
docker logs test-api

# Clean up
docker stop test-api
docker rm test-api
docker rmi budget-tool-api:test
```

## Troubleshooting
- If build fails on dependencies, check system packages in builder stage
- For permission errors, ensure COPY uses --chown flag
- If health check fails, verify curl is installed in runtime image
- For large image sizes, check for unnecessary files in .dockerignore
- If app doesn't start, check PYTHONPATH and working directory

## Notes
- Multi-stage builds significantly reduce final image size
- Non-root user is essential for production security
- Health checks enable proper container orchestration
- Layer caching speeds up subsequent builds
- Production image should be as minimal as possible
- Development image can include debugging tools
- Consider using distroless images for even better security

## Next Steps
After completing this task, proceed to:
- Task 09: Set up pytest and create first backend tests