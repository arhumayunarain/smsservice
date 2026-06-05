# Android Gateway

The Android app (`com.smsservice.app`, in `android/`) turns a phone into an SMS gateway. It connects to your backend over a WebSocket, receives queued messages, and sends them through the phone's SIM. Use this when you want messages to originate from your own number(s) instead of the Outreach.pk API.

> Prefer no hardware? Use [Bulk SMS with Outreach.pk](./outreach-sms.md) instead.

## How it works

```
Backend ──(Socket.io: "send this SMS")──► Android app ──► SmsManager ──► SIM ──► recipient
        ◄──(delivery/sent callbacks)──────
```

- A **foreground service** (`SmsGatewayService`) keeps the connection alive.
- A **boot receiver** restarts it after reboot.
- Messages are sent with a configurable delay (set per device / in `/settings`) to avoid Android's bulk-SMS confirmation dialog.

## Permissions the app requests

`SEND_SMS`, `READ_PHONE_STATE` (SIM slot info), `FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED` (auto-start), `POST_NOTIFICATIONS`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (stay alive), `CAMERA` (QR pairing), `INTERNET`.

## Pairing a device

### 1. Register the device on the backend

```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Office Phone 1"}'
# → { "deviceId": "<cuid>", "registrationToken": "<token>", ... }
```

(You can also do this from the dashboard's Devices page, which can show a QR code.)

### 2. Connect the phone

Install and open the app, then either:

- **Scan the QR code** shown in the dashboard (encodes `{ serverUrl, registrationToken, deviceId }`), or
- **Enter manually:**
  - **Server URL** — e.g. `http://192.168.1.100:3000` (dev) or `https://your-domain` (prod)
  - **Device ID** — the `deviceId` from step 1
  - **Registration Token** — the `registrationToken` from step 1

Grant the SMS and notification permissions when prompted, and allow it to ignore battery optimization so the service isn't killed.

### 3. Verify

```bash
curl http://localhost:3000/devices
# the device should show online: true
```

## Per-device settings

```bash
# Send rate (throttle)
curl -X PATCH http://localhost:3000/devices/<id>/rate-limit \
  -H "Content-Type: application/json" -d '{"...":"..."}'

# Choose SIM slot (dual-SIM phones)
curl -X PATCH http://localhost:3000/devices/<id>/sim-slot \
  -H "Content-Type: application/json" -d '{"...":"..."}'
```

## Building the app

Open the `android/` folder in Android Studio (or use Gradle):

```bash
cd android
cp local.properties.example local.properties   # set sdk.dir to your Android SDK path
./gradlew assembleRelease                        # build an APK
```

Install the resulting APK on your phone(s).

## Tips for reliability

- Keep the phone plugged in and on Wi‑Fi.
- Disable battery optimization for the app.
- Watch your carrier's daily SMS limits and anti-spam rules.
- For high volume, use multiple devices or the Outreach.pk API.
