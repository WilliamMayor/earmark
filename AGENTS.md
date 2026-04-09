# Agents

## Web

The frontend web project uses sveltekit.

Follow all HTML/JS/CSS best practise, especially accessibility issues.

We use tailwindCSS for styling. Don't use any custom CSS, only use tailwind classes.

Refactor complex UI elements into independent components to keep files short and focused.

## Test-Driven Development

This project follows a test-driven development (TDD) process. **All test suites must pass before any code is pushed to GitHub.** The CI pipeline will reject PRs with failing tests.

### Running Tests

All tests should be run using Docker to ensure consistent dependencies. Build the images first, then run the test containers.

#### Web Unit Tests

Test pure functions, utilities, and type logic

```bash
docker compose run --file docker-compose.dev.yml --rm test-web
```

#### Web E2E Tests

Test full user flows in a real browser (Playwright)

```bash
docker compose run --file docker-compose.dev.yml --rm test-e2e
```

#### Sync Tests

Test sync service, API client, database, and migrations

```bash
docker compose run --file docker-compose.dev.yml --rm test-sync
```

#### Run All Tests

```bash
./scripts/test.sh
```

## Docker Safety Rules

This server runs **two separate Docker environments** on the same Docker daemon:

- **`earmark-dev`** (project name): devuser's development environment — managed by `docker-compose.dev.yml`
- **`earmark-prod`** (project name): deploybot's production environment — hands-off

**Rules:**
- `docker compose down` is safe when run from this directory — project isolation prevents it from affecting production
- NEVER run `docker stop`, `docker rm`, or `docker kill` by container ID/name — these bypass project isolation and can hit production containers
- NEVER run `docker system prune` or any bulk cleanup commands
- Use `docker compose --file docker-compose.dev.yml ps` to inspect dev containers
- If you see containers from the `earmark-prod` project via `docker ps`, leave them alone
- Deploying means building and pushing images to `localhost:5000`, NOT restarting containers

## Clean builds

Run `scripts/clean-build.sh` whenever:
- Changing the base Node.js image version in the Dockerfile (e.g. `node:24-bookworm-slim`)
- Adding, removing, or upgrading npm dependencies (`package.json` / `package-lock.json`)

This removes the `web_node_modules` Docker volume, which caches native binaries (e.g. `better-sqlite3`) compiled against a specific Node version. Skipping it after the above changes will cause module version mismatch errors at runtime.
