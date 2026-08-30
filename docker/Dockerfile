# syntax=docker/dockerfile:1

# ---------- dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
# Copy only manifests first so the install layer caches independently of source.
COPY package.json package-lock.json ./
# Every workspace manifest, not just the ones currently imported. npm ci needs
# them all to create the @kyboxscore/* symlinks; a missing one fails the build
# at `next build` with an unresolved import, which does not point back here.
COPY apps/web/package.json          apps/web/package.json
COPY packages/db/package.json       packages/db/package.json
COPY packages/parsers/package.json  packages/parsers/package.json
COPY packages/rpi/package.json      packages/rpi/package.json
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

# Maintenance scripts run from this image via `docker compose exec web`:
# migrations, seeding, account provisioning and the RPI recompute. Next inlines
# postgres.js into the server bundle, so it is not present as a resolvable
# package - the scripts need their own copy. postgres.js has no dependencies.
#
# All workspace packages, not just db: the RPI script imports @kyboxscore/rpi
# through the db package, and a missing one fails at runtime with a bare
# ERR_MODULE_NOT_FOUND that does not point back here. The @kyboxscore symlinks
# npm created resolve because ./packages sits where they expect it.
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@kyboxscore ./node_modules/@kyboxscore

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
