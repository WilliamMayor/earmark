#!/bin/sh
set -eu

docker compose --file docker-compose.dev.yml --profile dev up
