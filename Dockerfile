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

# Run as the unprivileged `node` user shipped with the base image.
# Create the data directory and hand ownership to that user.
RUN mkdir -p /data && chown -R node:node /data

# Standalone server. Its pruned node_modules already include the traced
# better-sqlite3 native module (kept external via serverExternalPackages).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Drizzle migrations are applied at startup (see src/instrumentation.ts), so
# the SQL files must be present in the runtime image.
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
