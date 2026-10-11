# Kam Team Lead Generator

A real estate lead generator for finding and working sellers, buyers, probate, inherited, pre-foreclosure, expired, FSBO and absentee-owner leads on a live satellite map. Leads are scored, tracked through a pipeline, and synced to GoHighLevel (GHL).

## What's in the repo

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole app (single page: map, lead table, prospecting, settings) |
| `public/kam-team-logo.png` | Logo |
| `server.js` | Small Node server: hosts the app and relays leads to GHL at `/api/ghl` |
| `test/` | Tests for the relay (`npm test`) |
| `.env.example` | Environment variable template |
| `Dockerfile`, `render.yaml` | Deployment configs |

The server has no npm dependencies and needs Node 18.17 or newer.

## Quick start

```bash
cp .env.example .env      # then set GHL_WEBHOOK_URL (and optionally API_KEY)
npm install
npm start
```

Open http://localhost:3000. When the server has `GHL_WEBHOOK_URL` set, the app switches GHL sync to the relay (`/api/ghl`) automatically. You can check this under **Settings → GoHighLevel sync**.

You can also open `public/index.html` directly with no server. In that case the GHL webhook URL has to go into Settings, where anyone using that browser can see it.

## How the relay keeps the webhook private

```
browser ──POST /api/ghl──▶ server.js ──POST──▶ GHL inbound webhook
                           (GHL_WEBHOOK_URL lives only here)
```

- The real GHL URL is only read from the server environment and is never sent to the browser. `/api/health` reports only whether a relay is set up.
- The app's own origin can always call the relay. Other origins need to be listed in `ALLOWED_ORIGINS`.
- If `API_KEY` is set, every relay request must send a matching `X-API-Key` header. Enter the same value under **Settings → Relay API key**. Note that this key is stored in the browser, so it controls who can use the relay but stays visible to anyone using the app in that browser.
- Requests are rate-limited per IP address (60 per minute by default). JSON bodies are limited to 64 KB, and calls to GHL time out after 10 seconds.
- If GHL returns an error, the relay replies `502`, and the lead's activity log shows the error.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `GHL_WEBHOOK_URL` | yes, for sync | Your GHL inbound webhook URL (must be `https://`) |
| `PORT` | no | Server port (default `3000`) |
| `ALLOWED_ORIGINS` | no | Comma-separated extra origins allowed to call `/api/ghl` |
| `API_KEY` | no | Shared secret required in the `X-API-Key` header |
| `RATE_LIMIT_PER_MIN` | no | Relay requests per IP per minute (default `60`) |
| `NODE_ENV` | no | Set to `production` to send the HSTS header |

## Where data is stored

Leads and settings are stored in the browser's `localStorage` (`kamteam.leads.v2`, `kamteam.settings.v1`). They don't move between browsers or devices, and clearing site data deletes them. Use **Backup** in the sidebar to export JSON or CSV regularly.

Optional integrations, all set up in **Settings**:
- Google Maps API key: Google satellite tiles, Street View, and Google address and business search
- MapTiler satellite tiles
- Instagram Graph API token: hashtag and business lookups

## Production deployment

### Render

1. Create a new **Blueprint** from this repo. Render picks up `render.yaml`.
2. Fill in `GHL_WEBHOOK_URL`. `ALLOWED_ORIGINS` and `API_KEY` are optional.
3. Deploy. Render checks `/api/health` to confirm the app is up.

### Docker

```bash
docker build -t kam-team-lead-generator .
docker run -p 3000:3000 --env-file .env kam-team-lead-generator
```

### VPS / Linux

```bash
NODE_ENV=production PORT=3000 GHL_WEBHOOK_URL=https://services.leadconnectorhq.com/hooks/... npm start
```

Put Nginx or Cloudflare in front of the app and enable HTTPS. The server reads `X-Forwarded-For` and `X-Forwarded-Proto` from the proxy for rate limiting and same-origin checks.
