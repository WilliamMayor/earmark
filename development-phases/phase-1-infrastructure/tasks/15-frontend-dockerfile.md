# Task 15: Create Frontend Dockerfile

## Context
This task creates the Dockerfile for the SvelteKit frontend of the Budget Tool MVP. The Dockerfile uses a multi-stage build process to optimize the final image size and includes configurations for both development and production environments. It ensures efficient caching of dependencies and provides a secure, minimal runtime environment.

## Objectives
- Create a multi-stage Dockerfile for the frontend
- Optimize build caching for faster rebuilds
- Configure for both development and production environments
- Minimize final image size using Alpine Linux
- Set up proper health checks and security configurations
- Ensure compatibility with Docker Compose orchestration

## Prerequisites
- Task 11 completed (SvelteKit project initialized)
- Task 12 completed (Tailwind CSS configured)
- Task 14 completed (Layout and routing implemented)
- package.json and package-lock.json exist
- Build scripts configured in package.json

## Task Instructions

### Step 1: Create Main Dockerfile
Create `frontend/Dockerfile`:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies for node-gyp if needed
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy all dependencies for build
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# Copy application source
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force && \
    chown -R nodejs:nodejs /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/build build/
COPY --from=builder --chown=nodejs:nodejs /app/.svelte-kit .svelte-kit/

# Copy static files if any
COPY --chown=nodejs:nodejs static ./static

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "build/index.js"]
```

### Step 2: Create Development Dockerfile
Create `frontend/Dockerfile.dev`:

```dockerfile
# Development stage
FROM node:18-alpine

# Install development tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies
RUN npm ci && \
    npm cache clean --force

# Copy application source
COPY . .

# Expose port for development server
EXPOSE 3000

# Expose port for HMR (Hot Module Replacement)
EXPOSE 24678

# Set environment to development
ENV NODE_ENV=development
ENV PORT=3000
ENV HOST=0.0.0.0

# Enable hot reload
ENV VITE_HMR_PORT=24678
ENV VITE_HMR_HOST=localhost

# Start development server
CMD ["npm", "run", "dev"]
```

### Step 3: Create .dockerignore
Create `frontend/.dockerignore`:

```
# Node modules
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Build outputs
build/
.svelte-kit/
dist/

# Environment files
.env
.env.*
!.env.example

# IDE and OS files
.vscode/
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db

# Git
.git/
.gitignore

# Documentation
*.md
!README.md

# Test files
coverage/
.nyc_output/
*.test.ts
*.test.js
*.spec.ts
*.spec.js

# Development files
.eslintcache
.prettierignore
*.log

# Temporary files
*.tmp
*.temp
.temp/
.tmp/
```

### Step 4: Create Health Check Endpoint
Create `frontend/src/routes/health/+server.ts`:

```typescript
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { config } from '$lib/config';

export const GET: RequestHandler = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: config.app.version,
    environment: config.app.environment,
    uptime: process.uptime(),
    memory: {
      used: process.memoryUsage().heapUsed,
      total: process.memoryUsage().heapTotal
    }
  };

  return json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
};
```

### Step 5: Create Docker Build Script
Create `frontend/scripts/docker-build.sh`:

```bash
#!/bin/bash

# Docker build script for frontend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="budget-tool-frontend"
REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"
VERSION="${VERSION:-latest}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Parse arguments
BUILD_TYPE="${1:-production}"
PUSH_IMAGE="${2:-false}"

print_status "Starting Docker build for frontend..."
print_status "Build type: $BUILD_TYPE"
print_status "Version: $VERSION"

# Choose Dockerfile based on build type
if [ "$BUILD_TYPE" = "development" ]; then
    DOCKERFILE="Dockerfile.dev"
    TAG_SUFFIX="-dev"
    print_status "Using development Dockerfile"
else
    DOCKERFILE="Dockerfile"
    TAG_SUFFIX=""
    print_status "Using production Dockerfile"
fi

# Build the image
print_status "Building Docker image..."
docker build \
    -f "$DOCKERFILE" \
    -t "${IMAGE_NAME}:${VERSION}${TAG_SUFFIX}" \
    -t "${IMAGE_NAME}:latest${TAG_SUFFIX}" \
    --build-arg VERSION="${VERSION}" \
    .

if [ $? -ne 0 ]; then
    print_error "Docker build failed"
    exit 1
fi

print_status "Docker build completed successfully"

# Tag for registry if specified
if [ "$PUSH_IMAGE" = "true" ]; then
    print_status "Tagging image for registry..."
    docker tag "${IMAGE_NAME}:${VERSION}${TAG_SUFFIX}" "${REGISTRY}/${IMAGE_NAME}:${VERSION}${TAG_SUFFIX}"
    docker tag "${IMAGE_NAME}:latest${TAG_SUFFIX}" "${REGISTRY}/${IMAGE_NAME}:latest${TAG_SUFFIX}"
    
    print_status "Pushing image to registry..."
    docker push "${REGISTRY}/${IMAGE_NAME}:${VERSION}${TAG_SUFFIX}"
    docker push "${REGISTRY}/${IMAGE_NAME}:latest${TAG_SUFFIX}"
    
    if [ $? -ne 0 ]; then
        print_error "Failed to push image to registry"
        exit 1
    fi
    
    print_status "Image pushed to registry successfully"
fi

# Display image info
print_status "Image details:"
docker images | grep "${IMAGE_NAME}"

# Display size
SIZE=$(docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep "${IMAGE_NAME}" | head -1)
print_status "Image size: $SIZE"

print_status "Build complete!"
```

### Step 6: Create Docker Compose Service Definition
Create `frontend/docker-compose.yml`:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    image: budget-tool-frontend:latest
    container_name: budget-tool-frontend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - VITE_API_URL=http://api:8000
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
    restart: unless-stopped
    networks:
      - budget-tool-network

  frontend-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    image: budget-tool-frontend:dev
    container_name: budget-tool-frontend-dev
    ports:
      - "3000:3000"
      - "24678:24678"  # HMR port
    environment:
      - NODE_ENV=development
      - VITE_API_URL=http://api:8000
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.svelte-kit
    command: npm run dev
    networks:
      - budget-tool-network

networks:
  budget-tool-network:
    driver: bridge
```

### Step 7: Create Build Configuration for Docker
Create `frontend/vite.config.docker.ts`:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    fs: {
      allow: ['..']
    },
    hmr: {
      port: 24678,
      host: 'localhost'
    }
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@sveltejs')) {
              return 'sveltekit';
            }
            if (id.includes('svelte')) {
              return 'svelte';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  optimizeDeps: {
    include: ['svelte', '@sveltejs/kit']
  }
});
```

### Step 8: Create Security Headers Middleware
Create `frontend/src/hooks.server.ts`:

```typescript
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add CSP header for production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' http://localhost:8000;"
    );
  }

  return response;
};
```

### Step 9: Create Makefile for Docker Operations
Create `frontend/Makefile`:

```makefile
# Frontend Docker Makefile

.PHONY: help build build-dev run run-dev stop clean test shell logs

# Variables
IMAGE_NAME := budget-tool-frontend
CONTAINER_NAME := budget-tool-frontend
VERSION := $(shell node -p "require('./package.json').version")
PORT := 3000

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*##"; printf "\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  %-15s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

build: ## Build production Docker image
	@echo "Building production image..."
	docker build -t $(IMAGE_NAME):$(VERSION) -t $(IMAGE_NAME):latest .

build-dev: ## Build development Docker image
	@echo "Building development image..."
	docker build -f Dockerfile.dev -t $(IMAGE_NAME):dev .

run: build ## Run production container
	@echo "Running production container..."
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(PORT):3000 \
		--env-file .env \
		$(IMAGE_NAME):latest

run-dev: build-dev ## Run development container with hot reload
	@echo "Running development container..."
	docker run -d \
		--name $(CONTAINER_NAME)-dev \
		-p $(PORT):3000 \
		-p 24678:24678 \
		-v $(PWD):/app \
		-v /app/node_modules \
		-v /app/.svelte-kit \
		--env-file .env \
		$(IMAGE_NAME):dev

stop: ## Stop running containers
	@echo "Stopping containers..."
	-docker stop $(CONTAINER_NAME)
	-docker stop $(CONTAINER_NAME)-dev

clean: stop ## Remove containers and images
	@echo "Cleaning up..."
	-docker rm $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)-dev
	-docker rmi $(IMAGE_NAME):$(VERSION)
	-docker rmi $(IMAGE_NAME):latest
	-docker rmi $(IMAGE_NAME):dev

test: ## Run tests in Docker
	@echo "Running tests in Docker..."
	docker run --rm \
		-v $(PWD):/app \
		-w /app \
		$(IMAGE_NAME):dev \
		npm test

shell: ## Open shell in running container
	docker exec -it $(CONTAINER_NAME) sh

logs: ## Show container logs
	docker logs -f $(CONTAINER_NAME)
```

### Step 10: Test Docker Build
Run the following commands to test the Docker build:

```bash
# Build production image
docker build -t budget-tool-frontend:latest .

# Build development image
docker build -f Dockerfile.dev -t budget-tool-frontend:dev .

# Run production container
docker run -d -p 3000:3000 --name frontend-test budget-tool-frontend:latest

# Check health
curl http://localhost:3000/health

# Stop and remove test container
docker stop frontend-test && docker rm frontend-test
```

## Expected File Structure
After completing this task:

```
frontend/
├── Dockerfile
├── Dockerfile.dev
├── .dockerignore
├── docker-compose.yml
├── Makefile
├── vite.config.docker.ts
├── scripts/
│   └── docker-build.sh
├── src/
│   ├── hooks.server.ts
│   └── routes/
│       └── health/
│           └── +server.ts
```

## Success Criteria
- [ ] Production Dockerfile builds successfully
- [ ] Development Dockerfile builds successfully
- [ ] Images are optimized (production < 200MB)
- [ ] Health check endpoint responds correctly
- [ ] Container starts and serves application
- [ ] Hot reload works in development container
- [ ] Security headers are set properly
- [ ] Non-root user runs the application
- [ ] Build scripts execute without errors
- [ ] Multi-stage build reduces final image size

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Navigate to frontend directory
cd frontend

# Build production image
docker build -t frontend:prod .

# Build development image
docker build -f Dockerfile.dev -t frontend:dev .

# Check image sizes
docker images | grep frontend

# Run production container
docker run -d -p 3000:3000 --name frontend-prod frontend:prod

# Test health endpoint
curl -I http://localhost:3000/health

# Check container logs
docker logs frontend-prod

# Test application
open http://localhost:3000

# Stop and clean up
docker stop frontend-prod && docker rm frontend-prod

# Test with docker-compose
docker-compose up frontend

# Test development with hot reload
docker-compose up frontend-dev
```

## Troubleshooting
- If build fails, check Node.js version matches your local environment
- If the container doesn't start, check port 3000 is not already in use
- For permission errors, ensure the nodejs user has proper permissions
- If health check fails, verify the endpoint is accessible
- For slow builds, ensure .dockerignore is properly configured
- If hot reload doesn't work, check volume mounts and HMR configuration

## Notes
- Multi-stage build reduces the final image size significantly
- Alpine Linux base image provides security and size benefits
- dumb-init ensures proper signal handling in containers
- Non-root user improves container security
- Build cache optimization speeds up subsequent builds
- Development container includes hot module replacement support

## Next Steps
After completing this task, proceed to:
- Task 16: Set up Vitest for component testing
- Task 17: Configure Playwright for E2E testing