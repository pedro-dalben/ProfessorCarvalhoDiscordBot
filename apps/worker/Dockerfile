FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN addgroup --system --gid 1001 professor && adduser --system --uid 1001 --gid 1001 professor

FROM base AS builder
ENV CI=true
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/
COPY packages/observability/package.json packages/observability/
COPY packages/pokemon-data/package.json packages/pokemon-data/
COPY packages/cobblemon-data/package.json packages/cobblemon-data/
COPY packages/csa-integration/package.json packages/csa-integration/
COPY packages/discord-ui/package.json packages/discord-ui/
COPY packages/database/package.json packages/database/
COPY packages/queue/package.json packages/queue/
COPY packages/testing/package.json packages/testing/
COPY apps/worker/package.json apps/worker/
RUN corepack enable && pnpm install --frozen-lockfile
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm --filter @bigbangcraft/professor-carvalho-worker run build

FROM base AS runner
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps /app/apps
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY data/ /app/data/

USER professor
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
CMD ["node", "apps/worker/dist/main.js"]
ENTRYPOINT ["dumb-init", "--"]
