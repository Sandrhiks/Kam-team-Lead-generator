# Kam Team Lead Generator

A real estate lead generator for finding and working sellers, buyers, probate, inherited, pre-foreclosure, expired, FSBO and absentee-owner leads on a live satellite map. Leads are scored, tracked through a pipeline, and synced to GoHighLevel (GHL). Team members sign in before they can use it.

## What's in the repo

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole app (single page: map, lead table, prospecting, settings) |
| `public/login.html` | Sign-in and create-account page |
| `public/kam-team-logo.png` | Logo |
| `server.js` | Node server: sign-in, hosts the app, relays leads to GHL at `/api/ghl` |
| `lib/users.js` | Accounts: password hashing and storage (Postgres or a JSON file) |
| `test/` | Tests (`npm test`) |
| `.env.example` | Environment variable template |
| `Dockerfile`, `render.yaml` | Deployment configs |

The server needs Node 18.17 or newer. Its only npm dependency is `pg`, the Postgres driver.

## Quick start

```bash
cp .env.example .env      # then set GHL_WEBHOOK_URL, ALLOWED_EMAILS and SESSION_SECRET
npm install
npm start
```

Open http://localhost:3000. You'll land on the sign-in page: click **Create account**, enter an approved email and choose a password. When the server has `GHL_WEBHOOK_URL` set, the app switches GHL sync to the relay (`/api/ghl`) automatically. You can check this under **Settings → GoHighLevel sync**.

You can also open `public/index.html` directly with no server. In that case the GHL webhook URL has to go into Settings, where anyone using that browser can see it.

## Sign-in

- Every page and API call needs a signed-in user. The only exceptions are the sign-in page, the logo and `/api/health`.
- **Who can create an account:** list approved emails or whole domains in `ALLOWED_EMAILS`, for example `sandy@kam-team.com,@kam-team.com`, or `*` to let anyone sign up. People who aren't on the list can't sign up. If the list is empty, only the very first account can be created, so set the list before sharing the link.
- **Passwords** must be at least 8 characters. They're stored hashed with scrypt, never in plain text.
- **Sessions** last `SESSION_DAYS` (default 7) in an HttpOnly cookie signed with `SESSION_SECRET`. Keep that secret the same: changing it signs everyone out.
- Sign-in and sign-up attempts are limited to 20 per IP address per 15 minutes.
- Use the **Sign out** button (your name, in the top bar) to sign out.

### Where accounts are stored

| Setting | Storage | Use when |
| --- | --- | --- |
| `DATABASE_URL` set | Postgres table `kam_users` (created automatically) | Hosts without a persistent disk, including Render's free plan |
| `DATABASE_URL` empty | `DATA_DIR/users.json` (default `./data`) | Your own PC, a VPS, or Render with a persistent disk |

**On Render's free plan you need `DATABASE_URL`.** Free services have no persistent disk, so a `users.json` file is wiped on every deploy or restart and everyone would have to sign up again. Any Postgres works: for example, create a Render Postgres database or a free one at another provider, and paste its connection string into `DATABASE_URL`.

Leads themselves are still saved in each person's browser (see below). Signing in controls who can open the app; it doesn't move leads to the server.

## How the relay keeps the webhook private

```
browser ──POST /api/ghl──▶ server.js ──POST──▶ GHL inbound webhook
                           (GHL_WEBHOOK_URL lives only here)
```

- The real GHL URL is only read from the server environment and is never sent to the browser. `/api/health` reports only whether a relay is set up.
- The app's own origin can always call the relay. Other origins need to be listed in `ALLOWED_ORIGINS`.
- Only signed-in users can send leads. Outside tools (not the app) can call `/api/ghl` with an `X-API-Key` header matching `API_KEY`. Signed-in users don't need the key.
- Requests are rate-limited per IP address (60 per minute by default). JSON bodies are limited to 64 KB, and calls to GHL time out after 10 seconds.
- If GHL returns an error, the relay replies `502`, and the lead's activity log shows the error.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `GHL_WEBHOOK_URL` | yes, for sync | Your GHL inbound webhook URL (must be `https://`) |
| `ALLOWED_EMAILS` | yes | Emails and `@domains` allowed to create an account, or `*` for anyone |
| `SESSION_SECRET` | yes, in production | Long random string that signs sign-in cookies |
| `DATABASE_URL` | yes, on Render free | Postgres connection string for accounts |
| `DATA_DIR` | no | Folder for `users.json` when there's no database (default `./data`) |
| `SESSION_DAYS` | no | How long a sign-in lasts (default `7`) |
| `PORT` | no | Server port (default `3000`) |
| `ALLOWED_ORIGINS` | no | Comma-separated extra origins allowed to call `/api/ghl` |
| `API_KEY` | no | Lets outside tools call `/api/ghl` with an `X-API-Key` header |
| `RATE_LIMIT_PER_MIN` | no | Relay requests per IP per minute (default `60`) |
| `AUTH_ATTEMPTS_PER_15_MIN` | no | Sign-in and sign-up attempts per IP per 15 minutes (default `20`) |
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
2. Fill in `GHL_WEBHOOK_URL`, `ALLOWED_EMAILS` and `DATABASE_URL`. Render generates `SESSION_SECRET` for you. `ALLOWED_ORIGINS` and `API_KEY` are optional.
3. Deploy. Render checks `/api/health` to confirm the app is up.

### Docker

```bash
docker build -t kam-team-lead-generator .
docker run -p 3000:3000 --env-file .env -v kam-data:/app/data kam-team-lead-generator
```

The `-v kam-data:/app/data` volume keeps `users.json` when the container is replaced. You don't need it if you set `DATABASE_URL`.

### VPS / Linux

```bash
npm install --omit=dev
NODE_ENV=production PORT=3000 GHL_WEBHOOK_URL=https://services.leadconnectorhq.com/hooks/... \
  ALLOWED_EMAILS=@kam-team.com SESSION_SECRET=<long-random-string> npm start
```

Put Nginx or Cloudflare in front of the app and enable HTTPS. The server reads `X-Forwarded-For` and `X-Forwarded-Proto` from the proxy for rate limiting and same-origin checks.
