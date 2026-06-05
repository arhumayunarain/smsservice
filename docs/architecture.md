# Architecture

## Overview

```
                         ┌───────────────────────────┐
                         │     Next.js Dashboard      │
                         │  (campaigns, logs, stats)  │
                         └─────────────┬──────────────┘
                          REST /api    │   Socket.io (live progress)
                                       ▼
┌──────────────┐   queue   ┌───────────────────────────┐   ┌──────────────┐
│    Redis     │◄─────────►│       NestJS Backend       │◄─►│  PostgreSQL  │
│   (BullMQ)   │           │  auth · sms · campaigns ·  │   │   (Prisma)   │
└──────────────┘           │  templates · import · …    │   └──────────────┘
                           └───────┬───────────┬────────┘
                                   │           │
                  sendVia="API"    │           │   sendVia="DEVICE"
                                   ▼           ▼
                       ┌─────────────────┐  ┌────────────────────┐
                       │  Outreach.pk    │  │  Android app(s)    │
                       │  SMS gateway    │  │  (Socket.io + SIM) │
                       └─────────────────┘  └────────────────────┘
```

## Components

### Backend — `apps/backend` (NestJS 11)

Feature modules:

- **auth** — admin JWT login + API-key auth (global guard, `@Public()` opt-out).
- **sms** — direct send, message log, CSV export, dashboard stats.
- **campaigns** — campaign CRUD, scheduling, send/pause/resume/abort/retry, BullMQ processor.
- **templates** — message templates with `{{variable}}` rendering.
- **devices** + **gateway** — device registry and the Socket.io server that talks to Android phones.
- **outreach** — Outreach.pk API client (send, balance, delivery status).
- **recipient-lists** + **import** — reusable contact lists and CSV/Sheets/PostEx imports (queued jobs).
- **google-sheets** — Google OAuth + Sheets read for imports.
- **leopards** / **postex** — courier order import.
- **settings** — runtime settings (e.g. send delay, integration config).
- **prisma** — database access.

### Dashboard — `apps/dashboard` (Next.js 15 / React 19)

Talks to the backend at `NEXT_PUBLIC_API_URL` (default `/api`) and subscribes to Socket.io for live device status and campaign progress. UI built with Tailwind + Radix UI + Recharts.

### Android app — `android` (Kotlin / Jetpack Compose)

A paired device that connects over Socket.io and sends SMS via `SmsManager`. Runs as a foreground service with boot auto-start. See [Android Gateway](./android-gateway.md).

### Data stores

- **PostgreSQL** via Prisma — devices, API keys, admins, messages, templates, campaigns, recipients, recipient lists, import jobs, settings.
- **Redis** via BullMQ — the send queue and import jobs, enabling throttling, retries, pause/resume.

## Send pipeline

1. A campaign is created (`API` or `DEVICE`) and its recipients are expanded into messages.
2. On send, messages are enqueued in BullMQ with a throttle delay.
3. The processor renders each template and dispatches it:
   - **API** → `OutreachService.sendSms()` → Outreach.pk; stores the returned transaction ID.
   - **DEVICE** → emitted over Socket.io to the target phone, which sends via SIM and reports back.
4. Status updates persist to Postgres and stream to the dashboard over Socket.io.
5. Failed recipients can be retried.

## Request flow in production

Nginx terminates SSL and routes:

- `/api/` → backend
- `/socket.io/` → backend (WebSocket upgrade)
- `/` → dashboard

See [Deployment](./deployment.md).
