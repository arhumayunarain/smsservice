# Bulk SMS with Outreach.pk

SMSService can send bulk SMS through the **[Outreach.pk](https://outreach.pk)** SMS gateway API. This is the easiest way to send at scale — **no phones or SIM cards required**. You just need an Outreach.pk account with credit and an approved sender mask.

This is the `sendVia="API"` path. (The alternative, `sendVia="DEVICE"`, sends through connected Android phones — see [Android Gateway](./android-gateway.md).)

---

## 1. Get Outreach.pk credentials

1. Sign up at **https://outreach.pk** and top up SMS credit.
2. Get your **API ID** and **API password** from your account.
3. Get an **approved sender mask** (sender ID), e.g. your brand name. This becomes `OUTREACH_MASK`.

## 2. Configure SMSService

Add these to your `.env`:

```bash
OUTREACH_API_ID=your_outreach_id
OUTREACH_API_PASS=your_outreach_password
OUTREACH_MASK=YourBrand        # your approved sender mask
```

Restart the backend. Confirm it's wired up:

```bash
curl http://localhost:3000/outreach/status
# → {"configured": true}
```

Check your remaining credit any time:

```bash
curl http://localhost:3000/outreach/balance
# → {"success": true, "balance": 5913, "message": "Success"}
```

## 3. Phone number format

Outreach expects numbers **without** a `+` prefix, in international format:

```
923001234567      ✅   (Pakistan example: 92 + 3001234567)
+923001234567     ✅   (the app strips the +)
03001234567       ❌   (no country code)
```

SMSService normalizes numbers before sending, but provide them in `92XXXXXXXXXX` form to be safe.

---

## 4. Sending

### Option A — Quick send (one or a few recipients)

`POST /sms/send`. The `recipient` field accepts a single number or a **comma-separated list**:

```bash
# Single
curl -X POST http://localhost:3000/sms/send \
  -H "Content-Type: application/json" \
  -d '{"recipient":"923001234567","body":"Your order has shipped!"}'

# Multiple in one request
curl -X POST http://localhost:3000/sms/send \
  -H "Content-Type: application/json" \
  -d '{"recipient":"923001234567,923009876543","body":"Flash sale today only"}'
```

Each recipient is sent individually through Outreach, logged to the database, and the delivery result is returned. Use this for tests and small sends.

### Option B — Bulk campaign (recommended for large sends)

For real bulk sending with templates, personalization, scheduling, and live progress, use a **campaign** with `sendVia: "API"`. Full walkthrough in [Campaigns](./campaigns.md). The short version:

**1. Create a template** with `{{variables}}`:

```bash
curl -X POST http://localhost:3000/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"Order shipped","body":"Hi {{name}}, order {{orderId}} has shipped."}'
# → { "id": "tmpl_123", ... }
```

**2. Create the campaign** (send via the Outreach API):

```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "March shipping blast",
    "templateId": "tmpl_123",
    "sendVia": "API",
    "recipients": [
      {"phoneNumber":"923001234567","variables":{"name":"Ali","orderId":"A-100"}},
      {"phoneNumber":"923009876543","variables":{"name":"Sara","orderId":"A-101"}}
    ]
  }'
# → { "id": "camp_456", "status": "DRAFT", ... }
```

> Instead of inline `recipients`, you can pass a `recipientListId` (from an imported CSV / Google Sheet) plus a `variableMapping`. See [Campaigns](./campaigns.md).

**3. Send now** (or schedule it):

```bash
# Send immediately
curl -X POST http://localhost:3000/campaigns/camp_456/send

# …or schedule for later
curl -X POST http://localhost:3000/campaigns/camp_456/schedule \
  -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-06-10T09:00:00Z","timezone":"Asia/Karachi"}'
```

The campaign is queued (BullMQ) and each message is rendered from the template and sent via Outreach. Watch progress live:

```bash
curl http://localhost:3000/campaigns/camp_456/progress
```

…or in the dashboard, which streams progress over WebSockets. You can `pause`, `resume`, `abort`, and `retry` failed recipients (see [API Reference](./api-reference.md)).

---

## 5. Delivery status

Outreach returns a **transaction ID** per send, which SMSService stores against each message. Check delivery status:

```bash
curl "http://localhost:3000/outreach/delivery-status?transactionId=THE_TXN_ID"
```

You can also view per-message status and export logs to CSV via `GET /sms/logs` and `GET /sms/export`.

---

## Outreach API endpoints (built in)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/outreach/status` | Whether Outreach credentials are configured |
| `GET` | `/outreach/balance` | Remaining SMS credit |
| `GET` | `/outreach/delivery-status?transactionId=…` | Delivery status for a transaction |
| `POST` | `/sms/send` | Send to one or more numbers via Outreach |
| `POST` | `/campaigns` + `/campaigns/:id/send` | Bulk templated campaign via Outreach (`sendVia:"API"`) |

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `Outreach API is not configured` | `OUTREACH_API_ID` / `OUTREACH_API_PASS` missing — set them and restart. |
| `Outreach error 0: Unexpected response …` | Gateway returned a non-JSON/XML body; usually a bad mask or auth. Verify credentials and that `OUTREACH_MASK` is approved. |
| Messages `FAILED` with a non-300 code | Outreach rejected the send (e.g. insufficient balance, blocked content, unapproved mask). Check `/outreach/balance` and your Outreach account. |
| Numbers not delivering | Confirm `92XXXXXXXXXX` format and that recipients aren't on DND/blocked lists. |

> **Note:** Outreach delivery, masks, pricing, and number rules are governed by Outreach.pk and local telecom regulations. SMSService is just the client — comply with anti-spam laws and obtain recipient consent.
