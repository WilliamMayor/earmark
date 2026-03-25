# Agents

## Web

The frontend web project uses sveltekit.

Follow all HTML/JS/CSS best practise, especially accessibility issues.

We use tailwindCSS for styling. Don't use any custom CSS, only use tailwind classes.

Refactor complex UI elements into independent components to keep files short and focused.

## Running Tests

### Web (SvelteKit / Vitest)

Dependencies must be installed before running tests. Always run from the `web/` directory:

```bash
cd web && npm install
npm test           # unit tests (vitest run)
npm run test:e2e   # end-to-end tests (playwright)
npm run test:all   # unit + e2e
```

The correct unit test command is `npm test`, not `npm run test:unit`.

### Python (sync / backend)

```bash
uv run pytest
```
