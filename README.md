# SMSService

A self-hosted bulk SMS platform that sends through your own Android phones **or** the [Outreach.pk](https://outreach.pk) SMS API. Create campaigns, import recipients from CSV or Google Sheets, send via connected devices or the Outreach.pk gateway, and track delivery in real time from a web dashboard.

> Built for businesses that want to send bulk SMS over their own SIM cards instead of paying per-message gateway fees — with full control over data and delivery.

## Features

- 📱 **Device gateway** — connect one or more Android phones; messages send through their SIM cards
- 🚀 **Campaigns** — build, schedule, and run bulk campaigns with templates and personalization
- 📊 **Live tracking** — real-time delivery status and campaign progress over WebSockets
- 📥 **Recipient import** — bring contacts in from CSV files or Google Sheets
- 🔀 **Two send methods** — send via connected Android devices **or** the [Outreach.pk](https://outreach.pk) SMS API (bulk SMS, no hardware needed)
- 🔁 **Reliable queue** — BullMQ-backed sending with configurable throttling to avoid bulk-SMS limits
- 🔐 **Auth** — JWT-based admin login and API-key access for devices
- 🐳 **Self-hostable** — ships with Docker Compose and an Nginx reverse-proxy config

## Architecture

```
┌──────────────┐      ┌─────────────────┐      ┌──────────────────┐
│  Next.js     │◄────►│  NestJS API     │◄────►│  PostgreSQL      │
│  Dashboard   │  WS  │  + BullMQ queue │      │  (Prisma)        │
└──────────────┘      └────────┬────────┘      └──────────────────┘
                               │ Redis (queue)
                               ▼
                      ┌──────────────────┐
                      │  Android app     │  ← sends SMS via SIM
                      │  (device gateway)│
                      └──────────────────┘
```

| Part | Stack |
|------|-------|
| **Backend** (`apps/backend`) | NestJS 11, Prisma 6, PostgreSQL, BullMQ/Redis, Socket.io, Passport (JWT + Google OAuth) |
| **Dashboard** (`apps/dashboard`) | Next.js 15, React 19, Tailwind CSS, Radix UI, Recharts, socket.io-client |
| **Android** (`android`) | Native Android app (`com.smsservice.app`) that connects to the backend and sends SMS |
| **Infra** | Docker Compose, Nginx (SSL termination) |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for Postgres + Redis, or full stack)
- An Android device (Android 8+) to act as the SMS gateway

### 1. Configure environment

```bash
cp .env.example .env
```

Then fill in `.env`:

- `DB_USER` / `DB_PASSWORD` / `DB_NAME` — Postgres credentials
- `JWT_SECRET` — a long random string
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — your dashboard login
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — only if you want Google Sheets import
- `OUTREACH_API_ID` / `OUTREACH_API_PASS` / `OUTREACH_MASK` — to send bulk SMS via the [Outreach.pk](https://outreach.pk) API (instead of / alongside devices)

> ⚠️ Never commit your real `.env`. It is gitignored by default.

### 2. Run with Docker Compose

```bash
docker compose up -d
```

This starts the backend, dashboard, Postgres, and Redis. Nginx config for SSL lives in `nginx/` — point `server_name` and the certs at your own domain.

### 3. Run locally (dev)

```bash
# Backend
cd apps/backend
npm install
npx prisma migrate dev
npm run start:dev

# Dashboard (in another terminal)
cd apps/dashboard
npm install
npm run dev
```

Dashboard runs at `http://localhost:3001`, API at `http://localhost:3000`.

### 4. Connect a device

Build/install the Android app from `android/`, open it, and pair it to your backend using an API key generated from the dashboard.

## Sending bulk SMS via Outreach.pk

No Android phone? Send bulk SMS through the [Outreach.pk](https://outreach.pk) gateway. Set the `OUTREACH_*` env vars, then:

```bash
curl -X POST http://localhost:3000/sms/send \
  -H "Content-Type: application/json" \
  -d '{"recipient":"923001234567,923009876543","body":"Hello from SMSService"}'
```

For templated, scheduled, trackable bulk sends, create a campaign with `sendVia: "API"`. Full guide: **[docs/outreach-sms.md](./docs/outreach-sms.md)**.

## Documentation

Full documentation lives in [`docs/`](./docs/README.md):

- [Getting Started](./docs/getting-started.md) — install & run (local + Docker)
- [Configuration](./docs/configuration.md) — every env var + security checklist
- [Sending SMS](./docs/sending-sms.md) — the two send methods
- [Bulk SMS with Outreach.pk](./docs/outreach-sms.md) — step-by-step bulk sending
- [Campaigns](./docs/campaigns.md) — templates, lists, scheduling, tracking
- [Android Gateway](./docs/android-gateway.md) — pair a phone as a gateway
- [API Reference](./docs/api-reference.md) — all REST endpoints
- [Architecture](./docs/architecture.md) — how it fits together
- [Deployment](./docs/deployment.md) — production with Docker + Nginx + SSL

> ⚠️ **Before going public:** override the dev defaults (`ADMIN_PASSWORD`, `ENCRYPTION_KEY`, `JWT_SECRET`) and restrict CORS. See the [security checklist](./docs/configuration.md#-security-checklist-before-goingpublicproduction).

## License

[MIT](./LICENSE)

---

Built and open-sourced by [@humayun.codes](https://instagram.com/humayun.codes).
