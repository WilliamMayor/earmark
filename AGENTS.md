# Agents

## Web

The frontend web project uses sveltekit.

Follow all HTML/JS/CSS best practise, especially accessibility issues.

We use tailwindCSS for styling. Don't use any custom CSS, only use tailwind classes.

Refactor complex UI elements into independent components to keep files short and focused.

## Test-Driven Development

This project follows a test-driven development (TDD) process. **All test suites must pass before any code is pushed to GitHub.** The CI pipeline will reject PRs with failing tests.

### Workflow

1. **Write tests first** — before implementing or changing functionality, write tests that describe the expected behavior.
2. **Run tests to see failures** — confirm the tests fail for the right reason.
3. **Implement the feature** — write the minimum code to make the tests pass.
4. **Run all tests** — verify nothing is broken.
5. **Refactor** — clean up the code while keeping tests green.
6. **Commit and push** — only after all tests pass.

### Running Tests

All tests should be run using Docker to ensure consistent dependencies. Build the images first, then run the test containers.

#### Web Unit Tests

```bash
docker compose run --rm web-unit
```

#### Web E2E Tests

```bash
docker compose run --rm web-e2e
```

#### Python Tests

```bash
docker compose run --rm python-tests
```

#### Run All Tests

```bash
docker compose run --rm web-unit
docker compose run --rm web-e2e
docker compose run --rm python-tests
```

### Test Suites Overview

| Suite | Docker Service | Purpose |
|-------|---------------|---------|
| **Web Unit Tests** | `web-unit` | Test pure functions, utilities, and type logic |
| **Web E2E Tests** | `web-e2e` | Test full user flows in a real browser (Playwright) |
| **Python Tests** | `python-tests` | Test sync service, API client, database, and migrations |

### Pre-Push Checklist

Before pushing any changes, run all test suites:

```bash
docker compose run --rm web-unit
docker compose run --rm web-e2e
docker compose run --rm python-tests
```

All tests must pass before pushing. The GitHub Actions CI workflow will run all three suites on every PR and block merges if any fail.
