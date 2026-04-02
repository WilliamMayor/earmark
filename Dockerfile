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

# Stage 4: web-dev — SvelteKit Vite dev server with HMR
FROM node:22-bookworm-slim AS web-dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# Stage 5: sync-runtime — long-running FastAPI sync service
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS sync-runtime
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen
COPY sync/ ./sync/
CMD ["uv", "run", "python", "-m", "sync"]
