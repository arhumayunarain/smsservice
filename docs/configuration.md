# Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in the values. The backend validates required variables on startup (see `apps/backend/src/config/env.validation.ts`).

## Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ (local) | — | Postgres connection string. With Docker Compose it is composed from `DB_USER`/`DB_PASSWORD`/`DB_NAME`. |
| `REDIS_URL` | ✅ | — | Redis connection string for the BullMQ queue. |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | ✅ (Docker) | — | Used by Docker Compose to provision Postgres and build `DATABASE_URL`. |
| `PORT` | ❌ | `3001` | Backend HTTP port. Docs use `3000` for local dev. |
| `JWT_SECRET` | ✅ | — | Secret for signing admin JWTs. Use a long random string. |
| `ADMIN_USERNAME` | ❌ | `admin` | Dashboard login username. |
| `ADMIN_PASSWORD` | ❌ | `admin123` ⚠️ | Dashboard login password. **Always set this in production.** |
| `ENCRYPTION_KEY` | ✅ (prod) | a built-in dev default ⚠️ | 32-byte hex key for data at rest. **Always set your own in production.** |
| `OUTREACH_API_ID` | ❌ | — | Outreach.pk API id. Enables API-based bulk SMS. |
| `OUTREACH_API_PASS` | ❌ | — | Outreach.pk API password. |
| `OUTREACH_MASK` | ❌ | `Outreach` | Approved sender mask / sender ID on your Outreach account. |
| `GOOGLE_CLIENT_ID` | ❌ | — | Google OAuth client id (Google Sheets import). |
| `GOOGLE_CLIENT_SECRET` | ❌ | — | Google OAuth client secret. |
| `LEOPARDS_KEY` / `LEOPARDS_KEY_PASSWORD` | ❌ | — | Leopards Courier API credentials (order import). A second pair (`_2`) is supported. |
| `API_BASE_URL` | ❌ | `http://localhost:3000` | Public API base, used for OAuth callbacks. |
| `DASHBOARD_URL` | ❌ | `http://localhost:3001` | Public dashboard URL, used for OAuth redirect. |
| `NEXT_PUBLIC_API_URL` | ❌ | `/api` | Dashboard → backend API base. Set to the backend URL for local dev. |

## Feature toggles

Optional integrations switch on only when their credentials are present:

- **Outreach.pk bulk SMS** → set `OUTREACH_API_ID` + `OUTREACH_API_PASS`. Without them, `sendVia="API"` is unavailable and `GET /outreach/status` reports `configured: false`.
- **Google Sheets import** → set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
- **Leopards Courier import** → set `LEOPARDS_KEY` + `LEOPARDS_KEY_PASSWORD`.

## ⚠️ Security checklist before going public/production

These ship with permissive **development defaults** so the app runs out of the box. Override every one of them before exposing the app:

1. **`ADMIN_PASSWORD`** — if unset, the backend falls back to `admin123`. Set a strong password.
2. **`ENCRYPTION_KEY`** — if unset, a built-in default key is used; data "encrypted at rest" with the default key is not actually protected. Generate your own:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **`JWT_SECRET`** — never reuse the example value.
4. **CORS** — the backend currently allows all origins (`origin: '*'` in `apps/backend/src/main.ts`). Restrict it to your dashboard domain in production.
5. **Never commit `.env`** — it is gitignored; keep it that way. Real credentials belong only in your deployment environment.
