#!/bin/sh
set -eu

docker compose --profile dev run --rm "${1:-web}" bash
