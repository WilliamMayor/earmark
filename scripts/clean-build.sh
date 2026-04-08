#!/bin/sh
set -eu

# Remove stale node_modules volume (may hold native binaries compiled against old Node version)
# and rebuild all images from scratch. Run this when:
#   - changing the base Node.js image version in the Dockerfile
#   - adding/removing npm dependencies (package.json / package-lock.json changes)

docker compose --file docker-compose.dev.yml --profile test down --remove-orphans

# Remove stopped containers that may still hold the volume
docker rm -f budget-tool-web-unit-1 2>/dev/null || true

docker volume rm budget-tool_web_node_modules 2>/dev/null || true

docker compose --file docker-compose.dev.yml --profile test build --no-cache
