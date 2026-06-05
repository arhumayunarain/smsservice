# Deployment

Production deployment uses Docker Compose: Postgres, Redis, the backend, the dashboard, and an Nginx reverse proxy with SSL.

## Prerequisites

- A server with Docker & Docker Compose
- A domain pointed at the server
- TLS certificates (e.g. Cloudflare Origin Certificate or Let's Encrypt)

## 1. Configure environment

On the server:

```bash
git clone https://github.com/<your-username>/smsservice.git
cd smsservice
cp .env.example .env
```

Fill in `.env` for production:

- Strong `JWT_SECRET`, `ADMIN_PASSWORD`, and a freshly generated `ENCRYPTION_KEY` (**do not** keep defaults — see [Configuration](./configuration.md#-security-checklist-before-goingpublicproduction)).
- `DB_USER` / `DB_PASSWORD` / `DB_NAME`.
- `OUTREACH_*` if using Outreach.pk bulk SMS.
- `API_BASE_URL=https://your-domain/api` and `DASHBOARD_URL=https://your-domain`.

## 2. Configure Nginx + SSL

Edit `nginx/nginx.conf`:

- Set `server_name` to your domain (it currently uses the placeholder `sms.example.com`).
- Place your certs where the config expects them. By default it mounts `./ssl` into the container and reads:
  - `ssl_certificate     /etc/nginx/ssl/cert.pem;`
  - `ssl_certificate_key /etc/nginx/ssl/key.pem;`

```bash
mkdir -p ssl
cp /path/to/your/fullchain.pem ssl/cert.pem
cp /path/to/your/privkey.pem   ssl/key.pem
```

Nginx routes:

| Path | Upstream |
|------|----------|
| `/api/` | backend |
| `/socket.io/` | backend (WebSocket) |
| `/` | dashboard |

## 3. Launch

```bash
docker compose up -d --build
```

This will:

- Start Postgres and Redis (with health checks).
- Start the backend, which runs `prisma migrate deploy` automatically before booting.
- Start the dashboard.
- Start Nginx on ports 80 and 443.

## 4. Verify

```bash
docker compose ps
docker compose logs -f backend

# From your machine:
curl https://your-domain/api/outreach/status
```

Open `https://your-domain` and log in with your admin credentials.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on backend start.

## Backups

Postgres data lives in the `postgres_data` Docker volume. Back it up regularly:

```bash
docker compose exec postgres pg_dump -U "$DB_USER" "$DB_NAME" > backup_$(date +%F).sql
```

## Hardening reminders

- Restrict CORS in `apps/backend/src/main.ts` to your dashboard origin (it defaults to `*`).
- Put the dashboard/login behind your firewall or VPN if it's internal-only.
- Rotate `ADMIN_PASSWORD` and API keys periodically.
- Keep `.env` and `ssl/` out of version control (already gitignored).
