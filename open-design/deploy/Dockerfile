ARG NODE_IMAGE=docker.io/library/node:24-alpine
ARG RUNTIME_IMAGE=docker.io/library/node:24-alpine

FROM ${NODE_IMAGE} AS build

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV no_proxy=${no_proxy}
ENV NO_PROXY=${NO_PROXY}
ENV CI=true

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
COPY packages ./packages
COPY tools ./tools
COPY apps/daemon/package.json ./apps/daemon/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY e2e/package.json ./e2e/package.json
RUN corepack enable && \
    corepack prepare pnpm@10.33.2 --activate && \
    pnpm install --frozen-lockfile

COPY apps ./apps
RUN pnpm --filter @ai-game-design-studio/daemon build && \
    pnpm --filter @ai-game-design-studio/web build && \
    pnpm --filter @ai-game-design-studio/daemon deploy --legacy --prod /app/deploy/daemon && \
    pnpm store prune && \
    rm -rf \
      /root/.cache \
      /root/.local/share/pnpm/store \
      /app/deploy/daemon/node_modules/.cache \
      /app/deploy/daemon/node_modules/@types \
      /app/deploy/daemon/node_modules/.pnpm/@types+* \
      /app/deploy/daemon/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/deps \
      /app/deploy/daemon/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/src && \
    find /app/deploy/daemon/node_modules -type d \( \
      -name test -o \
      -name tests -o \
      -name "__tests__" -o \
      -name docs -o \
      -name doc -o \
      -name example -o \
      -name examples -o \
      -name ".github" \
    \) -prune -exec rm -rf '{}' + && \
    find /app/deploy/daemon/node_modules -type f \( \
      -name "*.md" -o \
      -name "*.markdown" -o \
      -name "*.d.ts" -o \
      -name "*.d.cts" -o \
      -name "*.d.mts" -o \
      -name "*.map" -o \
      -name "*.tsbuildinfo" -o \
      -name "binding.gyp" \
    \) -delete

FROM ${RUNTIME_IMAGE}

RUN apk add --no-cache tini && \
    addgroup -S -g 1001 agds && \
    adduser -S -D -H -u 1001 -G agds agds

WORKDIR /app
COPY --from=build --chown=agds:agds /app/deploy/daemon ./apps/daemon
COPY --from=build --chown=agds:agds /app/apps/web/out ./apps/web/out
COPY --chown=agds:agds skills ./skills
COPY --chown=agds:agds game-art-bibles ./game-art-bibles
COPY --chown=agds:agds craft ./craft
COPY --chown=agds:agds prompt-templates ./prompt-templates
COPY --chown=agds:agds assets/frames ./assets/frames
COPY --chown=agds:agds assets/community-pets ./assets/community-pets
COPY --chown=agds:agds assets/prompt-templates ./assets/prompt-templates

RUN mkdir -p /app/.agds && \
    chown -R agds:agds /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=192
ENV AGDS_BIND_HOST=0.0.0.0
ENV AGDS_DATA_DIR=/app/.agds
ENV AGDS_PORT=7456

EXPOSE 7456

USER agds
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/daemon/dist/cli.js", "--no-open"]
