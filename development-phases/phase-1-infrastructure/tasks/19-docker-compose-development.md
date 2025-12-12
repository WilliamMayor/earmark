# Task 19: Create docker-compose.dev.yml for Development

## Context
This task creates a development-specific Docker Compose configuration for the Budget Tool MVP. Unlike the production configuration, this setup prioritizes developer experience with features like hot reload, volume mounts for live code updates, debugging capabilities, and faster feedback loops. The development environment allows developers to see changes immediately without rebuilding containers.

## Objectives
- Create development-specific Docker Compose configuration
- Enable hot reload for both backend and frontend services
- Configure volume mounts for live code synchronization
- Set up debugging ports and development tools
- Optimize for developer productivity
- Configure development-specific environment variables
- Enable verbose logging for debugging

## Prerequisites
- Task 08 completed (Backend Dockerfile created)
- Task 15 completed (Frontend Dockerfile created)
- Task 18 completed (Production docker-compose.yml exists)
- Docker and Docker Compose installed
- Development Dockerfiles (Dockerfile.dev) created for both services
- Understanding of Docker volume mounts and networking

## Task Instructions

### Step 1: Create Development Docker Compose File
Create `docker-compose.dev.yml` in the project root:

```yaml
version: '3.8'

services:
  # Backend API Development Service
  api-dev:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
      args:
        - DEVELOPMENT=true
    image: budget-tool-api:dev
    container_name: budget-tool-api-dev
    volumes:
      # Mount source code for hot reload
      - ./api:/app
      # Prevent overwriting virtualenv in container
      - /app/venv
      # Prevent Python cache conflicts
      - /app/__pycache__
      - /app/.pytest_cache
      # Mount ledger volume
      - ./volumes/ledger:/app/volumes/ledger
      # Development logs
      - ./volumes/logs/api:/app/logs
    ports:
      - "8000:8000"      # API port
      - "5678:5678"      # Python debugger port (debugpy)
    environment:
      - ENV_NAME=development
      - DEBUG=True
      - RELOAD=True
      - LOG_LEVEL=DEBUG
      - SECRET_KEY=development-secret-key-not-for-production
      - ALLOWED_HOSTS=*
      - CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
      - LEDGER_PATH=/app/volumes/ledger
      - PYTHONDONTWRITEBYTECODE=1
      - PYTHONUNBUFFERED=1
    command: >
      sh -c "
        echo 'Starting development server with hot reload...' &&
        uvicorn app.main:app 
          --reload 
          --host 0.0.0.0 
          --port 8000 
          --log-level debug
          --reload-dir /app
      "
    networks:
      - budget-tool-dev-network
    stdin_open: true
    tty: true

  # Frontend Development Service
  frontend-dev:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
      args:
        - DEVELOPMENT=true
    image: budget-tool-frontend:dev
    container_name: budget-tool-frontend-dev
    volumes:
      # Mount source code for hot reload
      - ./frontend:/app
      # Preserve node_modules from container
      - /app/node_modules
      # Preserve .svelte-kit build cache
      - /app/.svelte-kit
      # Development logs
      - ./volumes/logs/frontend:/app/logs
    ports:
      - "3000:3000"      # Dev server port
      - "24678:24678"    # Vite HMR port
      - "9229:9229"      # Node.js debugger port
    environment:
      - NODE_ENV=development
      - VITE_API_URL=http://api-dev:8000
      - DEBUG=*
      - FORCE_COLOR=1
      - CHOKIDAR_USEPOLLING=true  # For file watching in Docker
      - WATCHPACK_POLLING=true
    command: npm run dev
    networks:
      - budget-tool-dev-network
    depends_on:
      - api-dev
    stdin_open: true
    tty: true

  # Development database viewer (optional, for future use)
  ledger-viewer:
    image: alpine:latest
    container_name: budget-tool-ledger-viewer
    volumes:
      - ./volumes/ledger:/ledger:ro
    command: >
      sh -c "
        apk add --no-cache less &&
        echo 'Ledger viewer ready. Use docker exec to view files.' &&
        tail -f /dev/null
      "
    networks:
      - budget-tool-dev-network

  # Development mail catcher (for future email features)
  mailcatcher:
    image: schickling/mailcatcher
    container_name: budget-tool-mailcatcher
    ports:
      - "1080:1080"  # Web interface
      - "1025:1025"  # SMTP port
    networks:
      - budget-tool-dev-network

networks:
  budget-tool-dev-network:
    driver: bridge
    name: budget-tool-dev

volumes:
  node_modules:
    name: budget-tool-frontend-node-modules
  pycache:
    name: budget-tool-api-pycache
```

### Step 2: Create Development Override File
Create `docker-compose.override.yml` (automatically loaded with docker-compose):

```yaml
# This file is automatically loaded by docker-compose
# It overrides settings for local development
version: '3.8'

services:
  api:
    environment:
      - DEBUG=True
      - LOG_LEVEL=DEBUG
    volumes:
      - ./api:/app:cached

  frontend:
    environment:
      - NODE_ENV=development
    volumes:
      - ./frontend:/app:cached
```

### Step 3: Create Development Environment File
Create `.env.development`:

```bash
# Development Environment Configuration
COMPOSE_PROJECT_NAME=budget-tool-dev
COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
API_RELOAD=true
DEBUG=True
LOG_LEVEL=DEBUG
SECRET_KEY=development-secret-key-change-in-production
ALLOWED_HOSTS=*

# Frontend Configuration
NODE_ENV=development
VITE_API_URL=http://localhost:8000
VITE_HMR_HOST=localhost
VITE_HMR_PORT=24678

# Database/Ledger
LEDGER_PATH=./volumes/ledger
LEDGER_BACKUP_PATH=./volumes/backup

# Development Tools
DEBUGPY_PORT=5678
NODE_DEBUG_PORT=9229

# Feature Flags
ENABLE_DEBUG_TOOLBAR=true
ENABLE_PROFILING=false
ENABLE_SQL_LOGGING=false

# Docker Configuration
DOCKER_BUILDKIT=1
COMPOSE_DOCKER_CLI_BUILD=1
```

### Step 4: Create Development Helper Scripts
Create `scripts/dev.sh`:

```bash
#!/bin/bash

# Development environment helper script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_help() {
    echo "Budget Tool Development Environment"
    echo ""
    echo "Usage: ./scripts/dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start       Start development environment"
    echo "  stop        Stop development environment"
    echo "  restart     Restart all services"
    echo "  logs        Follow logs for all services"
    echo "  logs-api    Follow API logs only"
    echo "  logs-front  Follow frontend logs only"
    echo "  shell-api   Open shell in API container"
    echo "  shell-front Open shell in frontend container"
    echo "  test        Run all tests"
    echo "  clean       Clean up containers and volumes"
    echo "  rebuild     Rebuild all images"
    echo "  status      Show status of all services"
    echo ""
}

case "$1" in
    start)
        echo -e "${GREEN}Starting development environment...${NC}"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
        echo -e "${GREEN}Waiting for services to be ready...${NC}"
        sleep 5
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps
        echo -e "${GREEN}Development environment ready!${NC}"
        echo "  Frontend: http://localhost:3000"
        echo "  API:      http://localhost:8000"
        echo "  API Docs: http://localhost:8000/docs"
        echo "  Mail:     http://localhost:1080"
        ;;
    
    stop)
        echo -e "${YELLOW}Stopping development environment...${NC}"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
        ;;
    
    restart)
        echo -e "${YELLOW}Restarting development environment...${NC}"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart
        ;;
    
    logs)
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
        ;;
    
    logs-api)
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f api-dev
        ;;
    
    logs-front)
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f frontend-dev
        ;;
    
    shell-api)
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec api-dev /bin/bash
        ;;
    
    shell-front)
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend-dev /bin/sh
        ;;
    
    test)
        echo -e "${GREEN}Running tests...${NC}"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec -T api-dev pytest
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec -T frontend-dev npm test
        ;;
    
    clean)
        echo -e "${RED}Cleaning up development environment...${NC}"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v
        ;;
    
    rebuild)
        echo -e "${YELLOW}Rebuilding development images...${NC}"
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache
        ;;
    
    status)
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps
        ;;
    
    *)
        print_help
        ;;
esac
```

### Step 5: Create Watch Configuration for Hot Reload
Create `api/watchfiles.yml`:

```yaml
# Watchfiles configuration for better hot reload
watch:
  - app/**/*.py
  - tests/**/*.py
ignore:
  - __pycache__
  - .pytest_cache
  - *.pyc
  - .git
  - venv
  - .venv
```

Create `frontend/.watchmanconfig`:

```json
{
  "ignore_dirs": ["node_modules", ".svelte-kit", "build", "dist"],
  "fsevents_latency": 0.5,
  "fsevents_try_resync": true
}
```

### Step 6: Create VSCode Development Configuration
Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API (Docker)",
      "type": "python",
      "request": "attach",
      "connect": {
        "host": "localhost",
        "port": 5678
      },
      "pathMappings": [
        {
          "localRoot": "${workspaceFolder}/api",
          "remoteRoot": "/app"
        }
      ],
      "justMyCode": false
    },
    {
      "name": "Debug Frontend (Docker)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "localRoot": "${workspaceFolder}/frontend",
      "remoteRoot": "/app"
    }
  ]
}
```

### Step 7: Create Development Makefile Targets
Add to `Makefile`:

```makefile
# Development targets
.PHONY: dev dev-start dev-stop dev-logs dev-rebuild dev-test

dev: dev-start ## Start development environment (alias)

dev-start: ## Start development environment with hot reload
	@echo "Starting development environment..."
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo "Development environment ready!"
	@echo "  Frontend: http://localhost:3000"
	@echo "  API:      http://localhost:8000"
	@echo "  API Docs: http://localhost:8000/docs"

dev-stop: ## Stop development environment
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

dev-logs: ## Show development logs
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

dev-rebuild: ## Rebuild development images
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache

dev-test: ## Run tests in development environment
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec api-dev pytest
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend-dev npm test

dev-shell-api: ## Open shell in API container
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec api-dev /bin/bash

dev-shell-frontend: ## Open shell in frontend container
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend-dev /bin/sh
```

## Expected File Structure
After completing this task:

```
budget-tool/
├── docker-compose.dev.yml
├── docker-compose.override.yml
├── .env.development
├── Makefile (updated)
├── .vscode/
│   └── launch.json
├── api/
│   └── watchfiles.yml
├── frontend/
│   └── .watchmanconfig
└── scripts/
    └── dev.sh
```

## Success Criteria
- [ ] Development containers start successfully
- [ ] Hot reload works for Python files
- [ ] Hot reload works for Frontend files
- [ ] Volume mounts preserve local changes
- [ ] Debugging ports are accessible
- [ ] Development scripts execute correctly
- [ ] Services restart quickly after code changes
- [ ] Logs are easily accessible
- [ ] Database/ledger files persist
- [ ] No permission issues with mounted volumes

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Check services are running
docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Test API hot reload
# 1. Make a change to api/app/main.py
# 2. Check logs to see reload: docker-compose logs -f api-dev
# 3. Verify change at http://localhost:8000

# Test Frontend hot reload
# 1. Make a change to frontend/src/routes/+page.svelte
# 2. Browser should auto-refresh at http://localhost:3000

# Test debugging
# 1. Add breakpoint() in Python code
# 2. Attach debugger on port 5678

# Check volume mounts
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec api-dev ls -la /app

# Run tests
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec api-dev pytest
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend-dev npm test

# Stop environment
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Troubleshooting
- If hot reload doesn't work, check file watching settings and polling configuration
- For permission issues, ensure volumes are properly mounted with correct ownership
- If ports conflict, check nothing else is running on 3000, 8000, 5678, 24678
- For slow hot reload, adjust polling intervals in environment variables
- If node_modules issues occur, rebuild without cache: `docker-compose build --no-cache`
- Check CHOKIDAR_USEPOLLING=true is set for file watching in Docker
- Ensure Docker has enough resources allocated (CPU, Memory)

## Notes
- Development configuration prioritizes developer experience over performance
- Volume mounts may be slower on macOS/Windows; consider using cached or delegated options
- Hot reload uses file watching which can be CPU intensive
- Debug ports should never be exposed in production
- The override file is automatically loaded by docker-compose
- Mail catcher is included for future email functionality development

## Next Steps
After completing this task, proceed to:
- Task 20: Create volume structure and networking
- Task 21: Verify frontend-backend communication