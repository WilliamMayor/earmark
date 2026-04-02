# Stage 1: install dependencies (including native better-sqlite3 build)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Stage 2: build the SvelteKit app
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
RUN npm run build

# Stage 3: minimal runtime image
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN mkdir -p /data
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY web/package.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "build/index.js"]

# Stage 4: sync-cron — runs uv run python -m sync on a 15-minute schedule
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS sync-cron
RUN apt-get update && apt-get install -y --no-install-recommends cron && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN echo '0 * * * * root cd /app && uv run python -m sync >> /var/log/sync.log 2>&1' \
    > /etc/cron.d/sync-transactions \
    && chmod 0644 /etc/cron.d/sync-transactions
# Dump container env vars at startup so cron can access them (cron doesn't inherit env)
ENTRYPOINT ["sh", "-c", "printenv > /etc/environment && cron -f"]
