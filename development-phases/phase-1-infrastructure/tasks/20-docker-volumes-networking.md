# Task 20: Create Volume Structure and Networking

## Context
This task establishes the volume management and network configuration for the Budget Tool MVP. Proper volume structure ensures data persistence across container restarts, while network configuration enables secure communication between services. This infrastructure is critical for maintaining ledger data integrity and providing isolation between development and production environments.

## Objectives
- Create organized volume structure for persistent data
- Configure backup volumes for data safety
- Set up Docker networks for service communication
- Establish proper volume permissions and ownership
- Implement volume backup and restore procedures
- Configure network isolation and security
- Document volume management procedures

## Prerequisites
- Task 18 completed (Production docker-compose.yml exists)
- Task 19 completed (Development docker-compose.yml exists)
- Docker and Docker Compose installed
- Understanding of Docker volumes and networking
- Sufficient disk space for volumes
- Basic understanding of file permissions

## Task Instructions

### Step 1: Create Volume Directory Structure
Create the volume directories in the project root:

```bash
#!/bin/bash

# Create volume structure
mkdir -p volumes/{ledger,backup,logs,temp,exports,imports}

# Create log subdirectories
mkdir -p volumes/logs/{api,frontend,nginx}

# Create backup subdirectories
mkdir -p volumes/backup/{daily,weekly,monthly}

# Set permissions
chmod 755 volumes/
chmod 755 volumes/ledger
chmod 755 volumes/backup
chmod 777 volumes/temp  # Temporary files need write access from containers
chmod 755 volumes/exports
chmod 755 volumes/imports
chmod 755 volumes/logs

# Create .gitkeep files to preserve directory structure
touch volumes/ledger/.gitkeep
touch volumes/backup/.gitkeep
touch volumes/logs/.gitkeep
touch volumes/temp/.gitkeep
touch volumes/exports/.gitkeep
touch volumes/imports/.gitkeep

# Create README for volume structure
cat > volumes/README.md << 'EOF'
# Volume Structure

This directory contains all persistent data for the Budget Tool.

## Directories

- `ledger/` - Main ledger files (hledger/ledger format)
- `backup/` - Automated backups of ledger data
  - `daily/` - Daily backups (retained for 7 days)
  - `weekly/` - Weekly backups (retained for 4 weeks)
  - `monthly/` - Monthly backups (retained for 12 months)
- `logs/` - Application logs
  - `api/` - Backend API logs
  - `frontend/` - Frontend application logs
  - `nginx/` - Reverse proxy logs
- `temp/` - Temporary files (cleared on restart)
- `exports/` - Exported data files
- `imports/` - Files to be imported

## Backup Policy

- Daily backups at 2 AM
- Weekly backups on Sundays
- Monthly backups on the 1st

## Important Notes

- DO NOT manually edit files in `ledger/` while the application is running
- Backups are automatically rotated based on retention policy
- Temporary files are not preserved across container restarts
EOF
```

### Step 2: Create Docker Volumes
Create `scripts/setup-volumes.sh`:

```bash
#!/bin/bash

# Docker volume setup script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[VOLUME]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create named volumes
print_status "Creating Docker named volumes..."

# Main data volume
docker volume create budget-tool-ledger \
    --label app=budget-tool \
    --label type=data \
    --label backup=required

# Backup volume
docker volume create budget-tool-backup \
    --label app=budget-tool \
    --label type=backup \
    --label retention=30d

# Log volume
docker volume create budget-tool-logs \
    --label app=budget-tool \
    --label type=logs \
    --label retention=7d

# Temp volume (can be tmpfs for performance)
docker volume create budget-tool-temp \
    --label app=budget-tool \
    --label type=temp \
    --label retention=session

print_status "Volumes created successfully"

# List volumes
print_status "Current volumes:"
docker volume ls --filter label=app=budget-tool

# Show volume details
print_status "Volume details:"
for vol in budget-tool-ledger budget-tool-backup budget-tool-logs budget-tool-temp; do
    echo "Volume: $vol"
    docker volume inspect $vol | grep -E "Mountpoint|Labels" | head -5
    echo ""
done
```

### Step 3: Create Network Configuration
Create `scripts/setup-networks.sh`:

```bash
#!/bin/bash

# Docker network setup script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[NETWORK]${NC} $1"
}

# Create production network
print_status "Creating production network..."
docker network create budget-tool-network \
    --driver bridge \
    --subnet=172.20.0.0/16 \
    --ip-range=172.20.1.0/24 \
    --gateway=172.20.0.1 \
    --label app=budget-tool \
    --label env=production \
    || print_status "Production network already exists"

# Create development network
print_status "Creating development network..."
docker network create budget-tool-dev-network \
    --driver bridge \
    --subnet=172.21.0.0/16 \
    --ip-range=172.21.1.0/24 \
    --gateway=172.21.0.1 \
    --label app=budget-tool \
    --label env=development \
    || print_status "Development network already exists"

# Create isolated test network
print_status "Creating test network..."
docker network create budget-tool-test-network \
    --driver bridge \
    --subnet=172.22.0.0/16 \
    --ip-range=172.22.1.0/24 \
    --gateway=172.22.0.1 \
    --internal \
    --label app=budget-tool \
    --label env=test \
    || print_status "Test network already exists"

print_status "Networks created successfully"

# List networks
print_status "Current networks:"
docker network ls --filter label=app=budget-tool

# Show network details
print_status "Network details:"
for net in budget-tool-network budget-tool-dev-network budget-tool-test-network; do
    echo "Network: $net"
    docker network inspect $net | grep -E "Subnet|Gateway|Internal" | head -5
    echo ""
done
```

### Step 4: Create Volume Mount Configuration
Create `docker-compose.volumes.yml`:

```yaml
version: '3.8'

# Volume mount configurations for different environments
x-volume-configs:
  # Ledger volume configuration
  &ledger-volume
  type: bind
  source: ./volumes/ledger
  target: /app/volumes/ledger
  read_only: false
  bind:
    create_host_path: true

  # Backup volume configuration
  &backup-volume
  type: bind
  source: ./volumes/backup
  target: /app/volumes/backup
  read_only: false
  bind:
    create_host_path: true

  # Log volume configuration
  &log-volume
  type: bind
  source: ./volumes/logs
  target: /app/volumes/logs
  read_only: false
  bind:
    create_host_path: true

  # Temp volume configuration
  &temp-volume
  type: tmpfs
  target: /app/volumes/temp
  tmpfs:
    size: 100M
    mode: 1777

services:
  api:
    volumes:
      - <<: *ledger-volume
      - <<: *backup-volume
      - <<: *log-volume
        source: ./volumes/logs/api
        target: /app/logs
      - <<: *temp-volume

  frontend:
    volumes:
      - <<: *log-volume
        source: ./volumes/logs/frontend
        target: /app/logs
      - <<: *temp-volume

  nginx:
    volumes:
      - <<: *log-volume
        source: ./volumes/logs/nginx
        target: /var/log/nginx

# Named volume definitions
volumes:
  # Persistent data volumes
  ledger-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${PWD}/volumes/ledger
    labels:
      app: budget-tool
      type: data

  backup-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${PWD}/volumes/backup
    labels:
      app: budget-tool
      type: backup

  # Log volumes with rotation
  log-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${PWD}/volumes/logs
    labels:
      app: budget-tool
      type: logs
```

### Step 5: Create Volume Backup Script
Create `scripts/backup-volumes.sh`:

```bash
#!/bin/bash

# Volume backup script

set -e

# Configuration
BACKUP_DIR="./volumes/backup"
LEDGER_DIR="./volumes/ledger"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y-%m-%d)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[BACKUP]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Determine backup type based on date
if [ "$(date +%d)" = "01" ]; then
    BACKUP_TYPE="monthly"
    RETENTION_DAYS=365
elif [ "$(date +%u)" = "7" ]; then
    BACKUP_TYPE="weekly"
    RETENTION_DAYS=28
else
    BACKUP_TYPE="daily"
    RETENTION_DAYS=7
fi

print_status "Starting $BACKUP_TYPE backup..."

# Create backup
BACKUP_FILE="$BACKUP_DIR/$BACKUP_TYPE/ledger_${BACKUP_TYPE}_${TIMESTAMP}.tar.gz"
print_status "Creating backup: $BACKUP_FILE"

# Stop writes to ledger (optional - implement application pause)
# docker-compose exec api python manage.py pause_writes

# Create compressed backup
tar -czf "$BACKUP_FILE" -C "$LEDGER_DIR" .

# Resume writes (optional)
# docker-compose exec api python manage.py resume_writes

# Verify backup
if tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
    print_status "Backup verified successfully"
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    print_status "Backup size: $SIZE"
else
    print_error "Backup verification failed!"
    exit 1
fi

# Rotate old backups
print_status "Rotating old backups..."
find "$BACKUP_DIR/$BACKUP_TYPE" -name "ledger_${BACKUP_TYPE}_*.tar.gz" \
    -mtime +$RETENTION_DAYS -delete

# Count remaining backups
COUNT=$(find "$BACKUP_DIR/$BACKUP_TYPE" -name "ledger_${BACKUP_TYPE}_*.tar.gz" | wc -l)
print_status "Current $BACKUP_TYPE backups: $COUNT"

# Create backup metadata
cat > "$BACKUP_FILE.meta" << EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$DATE",
  "type": "$BACKUP_TYPE",
  "size": "$SIZE",
  "retention_days": $RETENTION_DAYS,
  "files_count": $(tar -tzf "$BACKUP_FILE" | wc -l)
}
EOF

print_status "Backup completed successfully!"
```

### Step 6: Create Volume Restore Script
Create `scripts/restore-volumes.sh`:

```bash
#!/bin/bash

# Volume restore script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[RESTORE]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if backup file provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <backup-file>"
    echo ""
    echo "Available backups:"
    find ./volumes/backup -name "*.tar.gz" -type f | sort -r | head -20
    exit 1
fi

BACKUP_FILE="$1"
LEDGER_DIR="./volumes/ledger"
RESTORE_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    print_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Verify backup integrity
print_status "Verifying backup integrity..."
if ! tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
    print_error "Backup file is corrupted!"
    exit 1
fi

print_warning "This will replace all current ledger data!"
read -p "Are you sure you want to restore from $BACKUP_FILE? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_status "Restore cancelled"
    exit 0
fi

# Stop services
print_status "Stopping services..."
docker-compose down

# Create backup of current data
print_status "Backing up current data..."
if [ -d "$LEDGER_DIR" ] && [ "$(ls -A $LEDGER_DIR)" ]; then
    tar -czf "./volumes/backup/pre-restore_${RESTORE_TIMESTAMP}.tar.gz" \
        -C "$LEDGER_DIR" .
    print_status "Current data backed up to pre-restore_${RESTORE_TIMESTAMP}.tar.gz"
fi

# Clear ledger directory
print_status "Clearing ledger directory..."
rm -rf "$LEDGER_DIR"/*

# Restore from backup
print_status "Restoring from backup..."
tar -xzf "$BACKUP_FILE" -C "$LEDGER_DIR"

# Set permissions
print_status "Setting permissions..."
chmod -R 755 "$LEDGER_DIR"

# Verify restoration
if [ -f "$LEDGER_DIR/main.ledger" ]; then
    print_status "Restore completed successfully!"
    print_status "Restored files:"
    ls -la "$LEDGER_DIR"
else
    print_error "Restore verification failed!"
    exit 1
fi

# Start services
print_status "Starting services..."
docker-compose up -d

print_status "Restore process completed!"
```

### Step 7: Create Volume Monitoring Script
Create `scripts/monitor-volumes.sh`:

```bash
#!/bin/bash

# Volume monitoring script

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

# Disk usage
print_header "Volume Disk Usage"
df -h | grep -E "Filesystem|volumes" || df -h .

echo ""

# Directory sizes
print_header "Directory Sizes"
du -sh volumes/* 2>/dev/null | sort -h

echo ""

# Docker volumes
print_header "Docker Volumes"
docker volume ls --filter label=app=budget-tool

echo ""

# Volume details
print_header "Volume Mount Points"
for vol in $(docker volume ls --filter label=app=budget-tool -q); do
    echo -e "${GREEN}Volume:${NC} $vol"
    docker volume inspect $vol | grep Mountpoint
    echo ""
done

# File counts
print_header "File Counts"
echo "Ledger files: $(find volumes/ledger -type f 2>/dev/null | wc -l)"
echo "Backup files: $(find volumes/backup -type f -name "*.tar.gz" 2>/dev/null | wc -l)"
echo "Log files: $(find volumes/logs -type f 2>/dev/null | wc -l)"

echo ""

# Recent backups
print_header "Recent Backups"
find volumes/backup -name "*.tar.gz" -type f 2>/dev/null | sort -r | head -5

echo ""

# Check permissions
print_header "Permission Check"
ls -ld volumes/*/
```

## Expected File Structure
After completing this task:

```
budget-tool/
├── docker-compose.volumes.yml
├── volumes/
│   ├── README.md
│   ├── ledger/
│   │   └── .gitkeep
│   ├── backup/
│   │   ├── daily/
│   │   ├── weekly/
│   │   ├── monthly/
│   │   └── .gitkeep
│   ├── logs/
│   │   ├── api/
│   │   ├── frontend/
│   │   ├── nginx/
│   │   └── .gitkeep
│   ├── temp/
│   │   └── .gitkeep
│   ├── exports/
│   │   └── .gitkeep
│   └── imports/
│       └── .gitkeep
└── scripts/
    ├── setup-volumes.sh
    ├── setup-networks.sh
    ├── backup-volumes.sh
    ├── restore-volumes.sh
    └── monitor-volumes.sh
```

## Success Criteria
- [ ] Volume directories created with correct structure
- [ ] Docker named volumes created successfully
- [ ] Networks configured with proper subnets
- [ ] Volume permissions set correctly
- [ ] Backup script creates valid backups
- [ ] Restore script successfully restores data
- [ ] Services can access their volumes
- [ ] Data persists across container restarts
- [ ] Network isolation works between environments
- [ ] Monitoring script provides accurate information

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Set up volumes and networks
./scripts/setup-volumes.sh
./scripts/setup-networks.sh

# Check volume structure
ls -la volumes/

# List Docker volumes
docker volume ls --filter label=app=budget-tool

# List Docker networks
docker network ls --filter label=app=budget-tool

# Test volume persistence
docker-compose up -d
echo "test data" > volumes/ledger/test.txt
docker-compose down
docker-compose up -d
cat volumes/ledger/test.txt  # Should show "test data"

# Test backup
./scripts/backup-volumes.sh

# Check backup was created
ls -la volumes/backup/daily/

# Monitor volumes
./scripts/monitor-volumes.sh

# Test network connectivity
docker-compose exec frontend ping -c 1 api
```

## Troubleshooting
- If permission denied errors, check uid/gid of container user vs host user
- For volume mount issues, ensure paths are absolute or relative to docker-compose file
- If networks conflict, check existing networks with `docker network ls`
- For backup failures, ensure sufficient disk space
- If restore fails, check backup file integrity with `tar -tzf`
- For slow volume performance on Mac/Windows, use named volumes instead of bind mounts

## Notes
- Volume structure separates concerns (data, backups, logs, temp)
- Network isolation prevents accidental cross-environment communication
- Backup strategy includes daily, weekly, and monthly retention
- Temp volumes use tmpfs for better performance
- All volumes are labeled for easy management
- Consider using volume drivers for cloud storage in production

## Next Steps
After completing this task, proceed to:
- Task 21: Verify frontend-backend communication
- Task 22: Create integration test suite