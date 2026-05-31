# syntax=docker/dockerfile:1

# ---- Dependencies ----------------------------------------------------------
# Install node_modules with the toolchain better-sqlite3 needs to compile its
# native addon (python3, make, g++).
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ---- Build -----------------------------------------------------------------
# Build the Next.js standalone output.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Skip Next.js telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime ---------------------------------------------------------------
# Minimal image that runs the standalone server.
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # Database location inside the container; mount a volume here.
    DB_FILE_NAME=/data/prod.db

# Standalone server. Its pruned node_modules already include the traced
# better-sqlite3 native module (kept external via serverExternalPackages).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Drizzle migrations are applied at startup (see src/instrumentation.ts), so
# the SQL files must be present in the runtime image.
COPY --from=builder /app/drizzle ./drizzle

# Default data directory for the SQLite database.
RUN mkdir -p /data

# Runs as root by default so a bind-mounted ./data (owned by an arbitrary host
# UID) is always writable. To drop privileges, set `user: "<uid>:<gid>"` in
# docker-compose.yml and ensure that user owns the mounted data directory.
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
