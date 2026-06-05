# Campaigns

A **campaign** sends a templated message to many recipients, with personalization, scheduling, throttling, and live progress tracking. Campaigns can send via the **Outreach.pk API** (`sendVia: "API"`) or via a **connected Android device** (`sendVia: "DEVICE"`).

## The workflow

```
Template  ──►  Recipients  ──►  Campaign  ──►  Send/Schedule  ──►  Track  ──►  Retry
(message)      (list/CSV/       (API or          (queued via         (live)     (failed)
               Sheets/inline)    DEVICE)          BullMQ)
```

## 1. Create a template

Templates support `{{variable}}` placeholders that get filled per recipient.

```bash
curl -X POST http://localhost:3000/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"Order shipped","body":"Hi {{name}}, your order {{orderId}} is on the way."}'
```

## 2. Get your recipients

Three ways to supply recipients:

- **Inline** — pass a `recipients` array when creating the campaign.
- **Recipient list** — create a reusable list and import contacts into it:
  - CSV: `POST /recipient-lists/:id/import/upload` → `/map` → `/confirm`
  - Google Sheets: `POST /recipient-lists/:id/import/sheets` (requires Google OAuth)
  - PostEx orders: `POST /recipient-lists/:id/import/postex`
  - Then reference it with `recipientListId` + a `variableMapping` (list column → template variable).

## 3. Create the campaign

**Via Outreach.pk API:**

```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name":"March blast",
    "templateId":"tmpl_123",
    "sendVia":"API",
    "recipients":[
      {"phoneNumber":"923001234567","variables":{"name":"Ali","orderId":"A-100"}},
      {"phoneNumber":"923009876543","variables":{"name":"Sara","orderId":"A-101"}}
    ]
  }'
```

**Via an Android device** (note the required `deviceId`):

```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name":"March blast",
    "templateId":"tmpl_123",
    "sendVia":"DEVICE",
    "deviceId":"dev_789",
    "recipientListId":"list_42",
    "variableMapping":{"customer_name":"name","order_no":"orderId"}
  }'
```

**Test before you blast** with `POST /campaigns/test-send`:

```bash
curl -X POST http://localhost:3000/campaigns/test-send \
  -H "Content-Type: application/json" \
  -d '{"recipient":"923001234567","templateBody":"Hi {{name}}","variables":{"name":"Ali"}}'
```

## 4. Send or schedule

```bash
# Send now
curl -X POST http://localhost:3000/campaigns/camp_456/send

# Schedule (ISO 8601 UTC + IANA timezone for display)
curl -X POST http://localhost:3000/campaigns/camp_456/schedule \
  -H "Content-Type: application/json" \
  -d '{"scheduledAt":"2026-06-10T09:00:00Z","timezone":"Asia/Karachi"}'
```

Sending is processed through a **BullMQ queue**. A configurable delay between messages (see `/settings`) prevents the Android bulk-SMS confirmation dialog when sending via device.

## 5. Track & control

```bash
curl http://localhost:3000/campaigns/camp_456/progress      # progress snapshot
curl http://localhost:3000/campaigns/camp_456/queue-stats   # queue depth/status

curl -X POST http://localhost:3000/campaigns/camp_456/pause
curl -X POST http://localhost:3000/campaigns/camp_456/resume
curl -X POST http://localhost:3000/campaigns/camp_456/abort
```

The dashboard streams progress live over WebSockets — no polling needed.

## 6. Retry failures

```bash
curl -X POST http://localhost:3000/campaigns/camp_456/retry
```

- **API campaigns** re-send failed recipients directly through Outreach.
- **DEVICE campaigns** re-queue each failed recipient to the device.

## Campaign statuses

`DRAFT` → `SCHEDULED` / `SENDING` → `PAUSED` / `COMPLETED` / `ABORTED`. Per-message statuses include `QUEUED`, `SENT_TO_DEVICE`, `SENT`, `DELIVERED`, and `FAILED`.
