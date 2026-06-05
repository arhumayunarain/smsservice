# Getting Started

This guide gets SMSService running locally for development and with Docker for production.

## What you get

- A **NestJS** backend (REST API + WebSocket + queue)
- A **Next.js** dashboard
- **PostgreSQL** (data) and **Redis** (BullMQ queue)
- Two ways to send SMS:
  1. **Connected Android phones** (your own SIM cards) — see [Android Gateway](./android-gateway.md)
  2. **The Outreach.pk SMS API** — see [Bulk SMS with Outreach.pk](./outreach-sms.md)

You can run with **either** sending method, or both. The Outreach.pk path needs no hardware — just an account.

## Prerequisites

- **Node.js 20+**
- **Docker & Docker Compose** (easiest way to run Postgres + Redis, or the whole stack)
- (Optional) An **Android 8+ phone** if you want to send via your own SIM
- (Optional) An **[Outreach.pk](https://outreach.pk) account** if you want API-based bulk SMS

## 1. Clone & configure

```bash
git clone https://github.com/<your-username>/smsservice.git
cd smsservice
cp .env.example .env
```

Open `.env` and fill it in. At minimum set `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ENCRYPTION_KEY`. To enable Outreach.pk bulk SMS, also set `OUTREACH_API_ID`, `OUTREACH_API_PASS`, and `OUTREACH_MASK`. See [Configuration](./configuration.md) for every variable.

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

## 2a. Run with Docker Compose (recommended)

```bash
docker compose up -d --build
```

This starts Postgres, Redis, the backend (running migrations automatically), the dashboard, and an Nginx reverse proxy on ports 80/443. Point the `server_name` and SSL certs in `nginx/nginx.conf` at your own domain — see [Deployment](./deployment.md).

## 2b. Run locally for development

Start Postgres and Redis (via Docker is simplest):

```bash
docker compose up -d postgres redis
```

**Backend** (terminal 1):

```bash
cd apps/backend
npm install
# In .env (or your shell) set DATABASE_URL, REDIS_URL, and PORT=3000
npx prisma migrate dev      # create the schema
npx prisma generate
PORT=3000 npm run start:dev
```

The API is now at `http://localhost:3000`.

**Dashboard** (terminal 2):

```bash
cd apps/dashboard
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev -- -p 3001
```

The dashboard is now at `http://localhost:3001`. Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`.

> **Port note:** the backend defaults to `3001` if `PORT` is unset. These docs run it on `3000` and the dashboard on `3001` to match `.env.example`. Behind Nginx in production the dashboard calls the API at the relative path `/api`, so explicit ports don't matter there.

## 3. Choose how you'll send

- **Bulk SMS via Outreach.pk (no hardware):** [Bulk SMS with Outreach.pk →](./outreach-sms.md)
- **Send via your own phones:** [Android Gateway →](./android-gateway.md)

## 4. Send your first message

Once Outreach.pk is configured, you can send immediately:

```bash
curl -X POST http://localhost:3000/sms/send \
  -H "Content-Type: application/json" \
  -d '{"recipient":"923001234567","body":"Hello from SMSService"}'
```

For bulk and templated sends, use [Campaigns](./campaigns.md).
