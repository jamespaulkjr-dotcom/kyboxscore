# kyboxscore.com Setup and Deployment

Target: DigitalOcean droplet at 104.131.51.154. Spec: 2 vCPU / 4 GB RAM / 80 GB disk. Pattern: Docker Compose on the droplet, images built in GitHub Actions, Caddy for TLS, Postgres in a container with volume backed storage.

## Key decision: build in CI, not on the box

Do not run next build on the droplet. GitHub Actions builds the image and pushes it to GitHub Container Registry. The droplet only pulls and restarts. This is faster, safer, and keeps deploys from competing with live traffic for memory.

## 1. Prepare the droplet

Set the system hostname to match the console name so your shell prompt agrees with what you see in DigitalOcean.

```bash
hostnamectl set-hostname kyboxscore-prod
```

Then edit /etc/hosts and change the old hostname on the 127.0.1.1 line to kyboxscore-prod, otherwise sudo will warn on every command.

Now the rest, as root on first login:

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# disable password and root login
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# swap, cheap insurance even at 4GB
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# automatic security updates
apt install -y unattended-upgrades fail2ban

# cap container logs so they cannot run away
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl restart docker
```

Before you log out of the root session, open a second terminal and confirm you can SSH in as deploy. Locking yourself out is the classic way to lose an hour here.

Add a weekly prune so old image layers do not accumulate:

```bash
echo '0 4 * * 0 root docker image prune -af --filter "until=336h"' \
  > /etc/cron.d/docker-prune
```

Note this prunes images only, not volumes. Never add --volumes to a cron job on a box holding your database.

## 2. DNS

At your registrar, point kyboxscore.com at the droplet.

```text
A     @      104.131.51.154
A     www    104.131.51.154
```

If you are putting Cloudflare in front (recommended, see section 8), add the domain to Cloudflare first, change nameservers at the registrar, then create the same two A records inside Cloudflare with the proxy turned OFF initially. Turn the proxy on after Caddy has issued a certificate.

## 3. Repo structure

```bash
kyboxscore/
  .github/workflows/deploy.yml
  apps/
    web/                    Next.js app
  packages/
    db/                     schema, migrations, seed
    parsers/                MaxPreps txt, CSV, Excel importers
    rpi/                    RPI engine, official and shadow
  docker/
    Dockerfile
    Caddyfile
  compose.yml
  compose.dev.yml
  .env.example
  README.md
```

Keeping parsers and the RPI engine as separate packages matters. Both need heavy unit testing against fixture files, and neither should be tangled up in web framework code.

Create a fixtures/ directory inside packages/parsers and commit real MaxPreps .txt exports from Hudl and GameChanger as test inputs.

## 4. Local development

compose.dev.yml runs Postgres only. The app runs on your machine with hot reload.

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: kyboxscore
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: kyboxscore
    ports:
      - "5432:5432"
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
volumes:
  pgdata_dev:
```

Then:

```bash
docker compose -f compose.dev.yml up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## 5. Production compose

compose.yml on the droplet at /home/deploy/kyboxscore/:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web

  web:
    image: ghcr.io/YOURUSER/kyboxscore:latest
    restart: unless-stopped
    env_file: .env
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    env_file: .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kyboxscore"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

Note the database has no published port. It is reachable only on the internal Docker network. Do not expose 5432 to the internet.

## 6. Caddyfile

Caddy handles TLS automatically. No certbot, no renewal cron.

```
kyboxscore.com, www.kyboxscore.com {
    encode gzip zstd

    # score pages are public and identical for everyone,
    # so let them be cached hard at the edge
    @scoreboard path /scores* /football* /basketball* /teams*
    header @scoreboard Cache-Control "public, max-age=30, s-maxage=30, stale-while-revalidate=300"

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    reverse_proxy web:3000
}
```

## 7. Dockerfile

Use Next.js standalone output so the runtime image stays small.

In next.config.js: output: 'standalone'

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

## 8. GitHub Actions deploy

.github/workflows/deploy.yml:

```bash
name: deploy
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /home/deploy/kyboxscore
            docker compose pull web
            docker compose up -d web
            docker compose exec -T web node scripts/migrate.js
```

Secrets to add in the repo settings: DEPLOY_HOST (104.131.51.154) and DEPLOY_KEY (a dedicated deploy SSH private key, not your personal one).

Generate the deploy key on your machine, not on the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kyboxscore_deploy -C "gha-deploy"
```

Put the public half in /home/deploy/.ssh/authorized_keys on the droplet and the private half in the GitHub secret.

## 9. Environment

.env on the droplet, never committed:

```bash
POSTGRES_USER=kyboxscore
POSTGRES_PASSWORD=<generate a long random string>
POSTGRES_DB=kyboxscore
DATABASE_URL=postgresql://kyboxscore:<same>@db:5432/kyboxscore
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://kyboxscore.com
AUTH_SECRET=<generate a long random string>
```

Commit .env.example with the keys and empty values so the shape is documented.

## 10. Backups

Postgres in a container with no backup is a bad night waiting to happen. Add a nightly dump to DigitalOcean Spaces or anywhere off the droplet:

```bash
#!/bin/bash
# /home/deploy/backup.sh
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
cd /home/deploy/kyboxscore
docker compose exec -T db pg_dump -U kyboxscore kyboxscore \
  | gzip > /home/deploy/backups/kyboxscore-$STAMP.sql.gz
find /home/deploy/backups -name '*.sql.gz' -mtime +14 -delete
# then push to Spaces or S3 with s3cmd / rclone

0 3 * * * deploy /home/deploy/backup.sh
```

Also turn on DigitalOcean droplet backups. It is a few dollars a month and it has saved more projects than it has cost.

Test the restore before you need it.

## 11. Cloudflare

Put Cloudflare in front before your first football Friday, not after. Score pages are public, identical for every visitor, and tolerate being thirty seconds stale. That is the ideal CDN workload, and it is the difference between the droplet serving a handful of origin requests and the droplet serving the entire state.

Free tier is enough. Settings that matter:

- Proxy on for the two A records
- SSL mode Full (strict)
- Caching honors the Cache-Control headers Caddy is already sending
- A cache rule for /scores* and team pages if you want to be explicit
- Rate limiting on the import and login endpoints

## 12. Order of operations for this weekend

- Rename and reprovision the droplet, sections 1 and 2
- Point DNS, wait for propagation
- Get a hello world Next.js container deployed end to end through Actions
- Confirm HTTPS works and the deploy pipeline is green
- Only then start writing the real application

Get the boring pipeline working first. Debugging a deploy while also debugging a stat parser is how weekends disappear.
