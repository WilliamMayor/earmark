# Task 18: Create docker-compose.yml for Production

## Context
This task creates the production Docker Compose configuration for the Budget Tool MVP. The configuration orchestrates the backend API and frontend services, sets up networking, defines volumes for persistent data, and includes health checks and restart policies for production reliability. This establishes the foundation for deploying the complete application stack.

## Objectives
- Create production-ready docker-compose.yml configuration
- Set up service orchestration for backend and frontend
- Configure persistent volumes for ledger data
- Establish internal networking between services
- Implement health checks and restart policies
- Configure environment variables for production
- Set up logging and monitoring capabilities

## Prerequisites
- Task 08 completed (Backend Dockerfile created)
- Task 15 completed (Frontend Dockerfile created)
- Docker and Docker Compose installed
- Understanding of Docker networking and volumes
- Both backend and frontend containers build successfully

## Task Instructions

### Step 1: Create Main docker-compose.yml
Create `docker-compose.yml` in the project root:

```yaml
version: '3.8'

services:
  # Backend API Service
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    image: budget-tool-api:latest
    container_name: budget-tool-api
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - ENV_NAME=production
      - SECRET_KEY=${SECRET_KEY:-change-me-in-production}
      - ALLOWED_HOSTS=api,localhost,${DOMAIN:-localhost}
      - CORS_ALLOWED_ORIGINS=http://localhost:3000,https://${DOMAIN:-localhost}
      - LEDGER_PATH=/app/volumes/ledger
      - LOG_LEVEL=INFO
      - WORKERS=4
    volumes:
      - ./volumes/ledger:/app/volumes/ledger
      - api-logs:/app/logs
    networks:
      - budget-tool-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      - init-ledger

  # Frontend Service
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    image: budget-tool-frontend:latest
    container_name: budget-tool-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - VITE_API_URL=http://api:8000
    networks:
      - budget-tool-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      api:
        condition: service_healthy

  # Initialize ledger volume
  init-ledger:
    image: alpine:latest
    container_name: budget-tool-init
    volumes:
      - ./volumes/ledger:/ledger
    command: |
      sh -c "
        if [ ! -f /ledger/main.ledger ]; then
          echo '; Budget Tool Main Ledger' > /ledger/main.ledger
          echo '; Created: '`date -Iseconds` >> /ledger/main.ledger
          echo '' >> /ledger/main.ledger
          echo '; Accounts' >> /ledger/main.ledger
          echo 'account Assets:Cash' >> /ledger/main.ledger
          echo 'account Envelopes:Default' >> /ledger/main.ledger
          echo '' >> /ledger/main.ledger
          echo '; Initial balance' >> /ledger/main.ledger
          echo `date +%Y-%m-%d` 'Opening Balance' >> /ledger/main.ledger
          echo '    Assets:Cash                 \$0.00' >> /ledger/main.ledger
          echo '    Equity:Opening Balances' >> /ledger/main.ledger
          chmod 664 /ledger/main.ledger
          echo 'Ledger file initialized'
        else
          echo 'Ledger file already exists'
        fi
      "
    networks:
      - budget-tool-network

networks:
  budget-tool-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  api-logs:
    name: budget-tool-api-logs
  ledger-backup:
    name: budget-tool-ledger-backup
```

### Step 2: Create Production Environment File
Create `.env.production.example`:

```bash
# Domain Configuration
DOMAIN=budget-tool.local

# Security
SECRET_KEY=your-very-secure-secret-key-here
ALLOWED_HOSTS=api,localhost,budget-tool.local

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
WORKERS=4
LOG_LEVEL=INFO

# Frontend Configuration
VITE_API_URL=http://api:8000

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://budget-tool.local

# Database/Ledger
LEDGER_PATH=/app/volumes/ledger
BACKUP_ENABLED=true
BACKUP_RETENTION_DAYS=30

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

### Step 3: Create Nginx Reverse Proxy Configuration
Create `nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream api {
        server api:8000;
    }

    upstream frontend {
        server frontend:3000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=app_limit:10m rate=30r/s;

    # Main server block
    server {
        listen 80;
        server_name ${DOMAIN} localhost;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Rate limiting for app
            limit_req zone=app_limit burst=20 nodelay;
        }

        # API proxy
        location /api {
            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Rate limiting for API
            limit_req zone=api_limit burst=5 nodelay;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Health checks
        location /health {
            access_log off;
            proxy_pass http://api/health;
        }

        # Static file caching
        location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
            proxy_pass http://frontend;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### Step 4: Create Docker Compose with Nginx
Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: budget-tool-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx-cache:/var/cache/nginx
    networks:
      - budget-tool-network
    depends_on:
      - api
      - frontend
    environment:
      - DOMAIN=${DOMAIN:-localhost}

  api:
    extends:
      file: docker-compose.yml
      service: api
    expose:
      - "8000"
    ports: []

  frontend:
    extends:
      file: docker-compose.yml
      service: frontend
    expose:
      - "3000"
    ports: []

volumes:
  nginx-cache:
    name: budget-tool-nginx-cache
```

### Step 5: Create Backup Service
Create `docker-compose.backup.yml`:

```yaml
version: '3.8'

services:
  backup:
    image: alpine:latest
    container_name: budget-tool-backup
    environment:
      - BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
    volumes:
      - ./volumes/ledger:/source:ro
      - ./volumes/backup:/backup
      - ./scripts/backup.sh:/backup.sh:ro
    command: |
      sh -c "
        apk add --no-cache tar gzip
        while true; do
          /backup.sh
          sleep 86400
        done
      "
    networks:
      - budget-tool-network
```

### Step 6: Create Deployment Scripts
Create `scripts/deploy.sh`:

```bash
#!/bin/bash

# Production deployment script

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
command -v docker >/dev/null 2>&1 || { print_error "Docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { print_error "Docker Compose is required but not installed."; exit 1; }

# Load environment
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
    print_status "Loaded production environment"
else
    print_error ".env.production not found"
    exit 1
fi

# Pull latest changes (if using git)
if [ -d .git ]; then
    print_status "Pulling latest changes..."
    git pull origin main
fi

# Build images
print_status "Building Docker images..."
docker-compose -f docker-compose.yml build --no-cache

# Stop existing services
print_status "Stopping existing services..."
docker-compose down

# Start services
print_status "Starting services..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Check service health
for service in api frontend nginx; do
    if docker-compose ps | grep $service | grep -q "Up"; then
        print_status "$service is running"
    else
        print_error "$service failed to start"
        docker-compose logs $service
        exit 1
    fi
done

# Run database migrations (if any)
# docker-compose exec api python manage.py migrate

print_status "Deployment complete!"
print_status "Application available at: http://${DOMAIN:-localhost}"
```

### Step 7: Create Health Check Script
Create `scripts/health-check.sh`:

```bash
#!/bin/bash

# Health check script for all services

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check_service() {
    local service=$1
    local url=$2
    
    if curl -f -s "$url" > /dev/null; then
        echo -e "${GREEN}✓${NC} $service is healthy"
        return 0
    else
        echo -e "${RED}✗${NC} $service is unhealthy"
        return 1
    fi
}

# Check all services
echo "Checking service health..."

check_service "API" "http://localhost:8000/health"
check_service "Frontend" "http://localhost:3000/health"
check_service "Nginx" "http://localhost/health"

# Check disk usage
echo ""
echo "Disk usage:"
df -h | grep -E "volumes|ledger"

# Check container status
echo ""
echo "Container status:"
docker-compose ps

# Check recent logs for errors
echo ""
echo "Recent errors (last 10 lines):"
docker-compose logs --tail=10 2>&1 | grep -i error || echo "No recent errors"
```

### Step 8: Create Makefile
Create `Makefile` in the project root:

```makefile
.PHONY: help build up down restart logs health backup clean

# Variables
COMPOSE_FILE := docker-compose.yml
PROD_COMPOSE := docker-compose.prod.yml
ENV_FILE := .env.production

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

build: ## Build all Docker images
	docker-compose -f $(COMPOSE_FILE) build

up: ## Start all services
	docker-compose -f $(COMPOSE_FILE) up -d

up-prod: ## Start production services with nginx
	docker-compose -f $(COMPOSE_FILE) -f $(PROD_COMPOSE) up -d

down: ## Stop all services
	docker-compose down

restart: down up ## Restart all services

logs: ## View logs for all services
	docker-compose logs -f

logs-api: ## View API logs
	docker-compose logs -f api

logs-frontend: ## View frontend logs
	docker-compose logs -f frontend

health: ## Check service health
	@./scripts/health-check.sh

backup: ## Create backup of ledger data
	@./scripts/backup.sh

clean: ## Clean up containers, volumes, and images
	docker-compose down -v
	docker system prune -f

deploy: ## Deploy to production
	@./scripts/deploy.sh
```

## Expected File Structure
After completing this task:

```
budget-tool/
├── docker-compose.yml
├── docker-compose.prod.yml
├── docker-compose.backup.yml
├── .env.production.example
├── Makefile
├── nginx/
│   └── nginx.conf
├── scripts/
│   ├── deploy.sh
│   ├── health-check.sh
│   └── backup.sh
└── volumes/
    ├── ledger/
    └── backup/
```

## Success Criteria
- [ ] Main docker-compose.yml created with all services
- [ ] Services can communicate on internal network
- [ ] Persistent volumes configured for ledger data
- [ ] Health checks working for all services
- [ ] Nginx reverse proxy configured
- [ ] Environment variables properly configured
- [ ] Deployment scripts executable
- [ ] All services start successfully
- [ ] Services restart on failure
- [ ] Makefile commands work correctly

## Validation Commands
```bash
# Build all images
docker-compose build

# Start services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs

# Test API health
curl http://localhost:8000/health

# Test frontend
curl http://localhost:3000/health

# Test internal networking
docker-compose exec frontend ping api

# Check volumes
docker volume ls | grep budget-tool

# Stop services
docker-compose down
```

## Troubleshooting
- If services fail to start, check logs with `docker-compose logs [service]`
- For networking issues, verify the network exists: `docker network ls`
- If volumes have permission issues, check uid/gid in containers
- For port conflicts, ensure ports 3000 and 8000 are free
- If health checks fail, increase start_period in healthcheck config
- For memory issues, add deploy.resources.limits to services

## Notes
- Production configuration uses restart policies for resilience
- Health checks ensure services are ready before marking as healthy
- Nginx provides reverse proxy and load balancing capabilities
- Volumes ensure data persistence across container restarts
- Network isolation improves security between services
- Environment variables allow configuration without rebuilding

## Next Steps
After completing this task, proceed to:
- Task 19: Create docker-compose.dev.yml for development
- Task 20: Create volume structure and networking