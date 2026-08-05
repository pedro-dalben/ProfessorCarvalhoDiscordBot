FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN addgroup --system --gid 1001 professor && adduser --system --uid 1001 --gid 1001 professor

FROM base AS builder
ENV CI=true
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

FROM base AS runner
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps /app/apps
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY data/ /app/data/
COPY drizzle/ /app/drizzle/

USER professor
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
CMD ["node", "apps/bot-api/dist/main.js"]
ENTRYPOINT ["dumb-init", "--"]
