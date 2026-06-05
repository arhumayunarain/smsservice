# Sending SMS

SMSService supports **two sending methods**. You can use either or both, and choose per campaign.

| Method | `sendVia` | Needs | Best for |
|--------|-----------|-------|----------|
| **Outreach.pk API** | `API` | An [Outreach.pk](https://outreach.pk) account | Bulk sending at scale with no hardware |
| **Android device** | `DEVICE` | A paired Android phone + SIM | Sending from your own number / low volume |

## Method 1 — Outreach.pk API (no hardware)

Send bulk SMS through the Outreach.pk gateway. Configure `OUTREACH_*` env vars and you're ready.

→ **Full guide: [Bulk SMS with Outreach.pk](./outreach-sms.md)**

Quick send:

```bash
curl -X POST http://localhost:3000/sms/send \
  -H "Content-Type: application/json" \
  -d '{"recipient":"923001234567","body":"Hello"}'
```

## Method 2 — Android device gateway

Pair an Android phone running the companion app. The backend dispatches messages to the device over a WebSocket and the phone sends them through its SIM. A configurable delay between messages avoids the Android bulk-SMS confirmation dialog.

→ **Full guide: [Android Gateway](./android-gateway.md)**

A `DEVICE` campaign requires a `deviceId`:

```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Device blast",
    "templateId":"tmpl_123",
    "sendVia":"DEVICE",
    "deviceId":"dev_789",
    "recipients":[{"phoneNumber":"923001234567","variables":{"name":"Ali"}}]
  }'
```

## Which should I use?

- **High volume, no phones, predictable cost per SMS** → Outreach.pk API.
- **Want messages to come from your own SIM/number, or you already have devices** → Android gateway.
- **Resilience** → run both; if an API campaign has failures you can retry, and device campaigns can fall back to per-recipient re-queueing.

## Message logs & export

Regardless of method, every message is recorded. Query and export:

```bash
# Filterable, paginated log
curl "http://localhost:3000/sms/logs?status=DELIVERED&limit=50"

# CSV export of filtered messages
curl "http://localhost:3000/sms/export?status=FAILED" -o failed.csv

# Today's dashboard stats
curl http://localhost:3000/sms/stats
```

See the [API Reference](./api-reference.md) for all filters and fields.
