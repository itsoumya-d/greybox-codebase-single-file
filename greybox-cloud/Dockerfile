# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
#
# Multi-stage production build.
# Stage 1 (builder): compile TypeScript to dist/
# Stage 2 (runtime): minimal Alpine image with only compiled output + prod deps

# ---- builder ---------------------------------------------------------------
FROM node:24-alpine AS builder

# pnpm is the project's package manager
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

# Install dependencies first (layer-cached unless lockfile changes)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and compile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runtime

# Install only production optional deps (pg, @sentry/node)
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Non-root user for hardened runtime
RUN addgroup -S greybox && adduser -S greybox -G greybox
USER greybox

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000

# Lightweight liveness check used by container orchestrators.
# /healthz is exempt from auth, rate limiting, and request timeout.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
