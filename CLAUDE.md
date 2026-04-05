# Budget Tool

## Clean builds

Run `scripts/clean-build.sh` whenever:
- Changing the base Node.js image version in the Dockerfile (e.g. `node:24-bookworm-slim`)
- Adding, removing, or upgrading npm dependencies (`package.json` / `package-lock.json`)

This removes the `web_node_modules` Docker volume, which caches native binaries (e.g. `better-sqlite3`) compiled against a specific Node version. Skipping it after the above changes will cause module version mismatch errors at runtime.
