# API Reference

Base URL: `http://localhost:3000` in local dev, or `https://your-domain/api` behind Nginx in production.

## Authentication

Most routes require authentication. Two mechanisms:

- **Admin JWT** — `POST /auth/login` returns a token; send it as `Authorization: Bearer <token>`.
- **API key** — for device/programmatic access; send it as the `X-Api-Key` header. Manage keys under `/auth/api-keys`.

`POST /auth/login` is public. (`/auth/login` is the only public route by default.)

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Log in with `{ username, password }`; returns a JWT. |
| `GET` | `/auth/me` | Current user from the JWT. |
| `POST` | `/auth/api-keys` | Create an API key `{ name }`. |
| `GET` | `/auth/api-keys` | List API keys. |
| `DELETE` | `/auth/api-keys/:id` | Revoke an API key. |

## SMS

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sms/send` | Send to one or more numbers (comma-separated) via Outreach. Body: `{ recipient, body }`. |
| `GET` | `/sms/logs` | Filterable, paginated message log. |
| `GET` | `/sms/export` | CSV export (streaming) of filtered messages. |
| `GET` | `/sms/stats` | Today's summary stats. |
| `GET` | `/sms/stats/daily?days=7\|30` | Daily send counts for trend charts. |
| `GET` | `/sms/messages?limit=` | Recent messages. |
| `GET` | `/sms/messages/:id` | One message. |

## Outreach.pk (API SMS provider)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/outreach/status` | `{ configured: boolean }`. |
| `GET` | `/outreach/balance` | Remaining SMS credit. |
| `GET` | `/outreach/delivery-status?transactionId=` | Delivery status for a transaction. |

See [Bulk SMS with Outreach.pk](./outreach-sms.md).

## Campaigns

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/campaigns` | Create a campaign (`sendVia: "API" \| "DEVICE"`). |
| `GET` | `/campaigns` | List campaigns. |
| `GET` | `/campaigns/history?limit=` | Recent campaign history. |
| `POST` | `/campaigns/test-send` | Test-render & send one message: `{ recipient, templateBody, variables }`. |
| `GET` | `/campaigns/:id` | Campaign detail. |
| `PUT` | `/campaigns/:id` | Update a draft campaign. |
| `DELETE` | `/campaigns/:id` | Delete a campaign. |
| `POST` | `/campaigns/:id/clone` | Clone a campaign. |
| `POST` | `/campaigns/:id/send` | Send now. |
| `POST` | `/campaigns/:id/schedule` | Schedule: `{ scheduledAt, timezone }`. |
| `POST` | `/campaigns/:id/pause` | Pause sending. |
| `POST` | `/campaigns/:id/resume` | Resume sending. |
| `POST` | `/campaigns/:id/abort` | Abort sending. |
| `POST` | `/campaigns/:id/retry` | Retry failed recipients. |
| `GET` | `/campaigns/:id/progress` | Progress snapshot. |
| `GET` | `/campaigns/:id/queue-stats` | Queue stats for the campaign. |

See [Campaigns](./campaigns.md).

## Templates

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/templates` | Create a template `{ name, body }` (supports `{{variables}}`). |
| `GET` | `/templates` | List templates. |
| `GET` | `/templates/:id` | One template. |
| `PUT` | `/templates/:id` | Update. |
| `DELETE` | `/templates/:id` | Delete. |

## Devices (Android gateways)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/devices` | Register / pair a device. |
| `GET` | `/devices` | List devices (online status, etc.). |
| `GET` | `/devices/:id` | Device detail. |
| `DELETE` | `/devices/:id` | Remove a device. |
| `PATCH` | `/devices/:id/rate-limit` | Update per-device send rate. |
| `PATCH` | `/devices/:id/sim-slot` | Choose SIM slot. |

See [Android Gateway](./android-gateway.md).

## Recipient lists

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/recipient-lists` | List recipient lists. |
| `POST` | `/recipient-lists` | Create a list. |
| `GET` | `/recipient-lists/:id` | List detail. |
| `PUT` / `DELETE` | `/recipient-lists/:id` | Update / delete. |
| `GET` | `/recipient-lists/:id/entries` | Entries in the list. |
| `POST` | `/recipient-lists/:id/entries` | Add an entry. |
| `PUT` / `DELETE` | `/recipient-lists/:id/entries/:entryId` | Edit / remove an entry. |
| `POST` | `/recipient-lists/:id/entries/bulk-delete` | Bulk remove entries. |
| `GET` | `/recipient-lists/:id/campaigns` | Campaigns using this list. |
| `POST` | `/recipient-lists/:id/import/upload` | Upload a CSV to import. |
| `POST` | `/recipient-lists/:id/import/map` | Map CSV columns → variables. |
| `POST` | `/recipient-lists/:id/import/confirm` | Confirm and run the import. |
| `POST` | `/recipient-lists/:id/import/postex` | Import from PostEx orders. |
| `POST` | `/recipient-lists/:id/import/sheets` | Import from a Google Sheet. |

## Generic import

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/import/upload` | Upload a CSV. |
| `POST` | `/import/map` | Map columns. |
| `POST` | `/import/confirm` | Confirm import (queued job). |
| `GET` | `/import/job/:id` | Import job status. |

## Google Sheets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/google` | Start OAuth consent. |
| `GET` | `/auth/google/callback` | OAuth callback. |
| `GET` | `/auth/google/status` | Connection status. |
| `DELETE` | `/auth/google` | Disconnect. |
| `GET` | `/sheets/:spreadsheetId/tabs` | List tabs. |
| `POST` | `/sheets/:spreadsheetId/data` | Pull rows from a tab. |

## Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | Read settings (e.g. send delay). |
| `PUT` | `/settings` | Update settings. |
| `PUT` / `DELETE` | `/settings/postex` | Configure / remove PostEx. |
| `DELETE` | `/settings/google` | Remove Google connection. |

## Courier integrations (order import)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/leopards/status` · `POST /leopards/fetch` | Leopards Courier status / fetch orders. |
| `GET` | `/postex/status` · `POST /postex/fetch` | PostEx status / fetch orders. |

## Realtime

The backend exposes a Socket.io server (proxied at `/socket.io/`) used by the dashboard for live device status and campaign progress.
