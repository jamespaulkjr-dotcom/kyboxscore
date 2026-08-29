# syntax=docker/dockerfile:1

# ---------- dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
# Copy only manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
COPY apps/web/package.json      apps/web/package.json
COPY packages/db/package.json   packages/db/package.json
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# npm workspaces hoist everything to the root node_modules; there is no
# per-workspace node_modules to copy. The @kyboxscore/* symlinks inside it
# resolve once COPY . . brings the workspace sources in.
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 nextjs

# `output: standalone` with outputFileTracingRoot at the repo root emits
# .next/standalone/{node_modules,apps/web/server.js}. It does NOT copy public
# or .next/static, so those are copied explicitly below.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Migrations run from this image via `docker compose exec web`. Next inlines
# postgres.js into the server bundle, so it is not present as a resolvable
# package - the scripts need their own copy. postgres.js has no dependencies.
COPY --from=builder --chown=nextjs:nodejs /app/packages/db ./packages/db
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
