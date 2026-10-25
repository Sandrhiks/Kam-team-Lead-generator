# Kam Team Lead Generator

A real estate lead generator for finding and working sellers, buyers, probate, inherited, pre-foreclosure, expired, FSBO and absentee-owner leads on a live satellite map. Leads are scored, tracked through a pipeline with a full contact history, and synced to GoHighLevel (GHL). Team members sign in before they can use it, their leads are saved to their account, and an AI support assistant answers questions inside the app.

## What's in the repo

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole app (single page: map, lead table, prospecting, settings) |
| `public/login.html` | Sign-in and create-account page |
| `public/kam-team-logo.png` | Logo |
| `server.js` | Node server: sign-in, hosts the app, lead sync, chat support, GHL relay |
| `lib/users.js` | Accounts: password hashing and storage (Postgres or a JSON file) |
| `lib/leads.js` | Each user's leads and contact history (Postgres or JSON files) |
| `lib/chat.js` | AI chat support (Claude): support instructions and streaming replies |
| `lib/db.js` | Shared Postgres connection |
| `test/` | Tests (`npm test`) |
| `.env.example` | Environment variable template |
| `bible-study/` | Kam Team Bible Study Guide: a separate app (`npm run bible`). See [bible-study/README.md](bible-study/README.md) |
| `Dockerfile`, `render.yaml` | Deployment configs |

The server needs Node 18.17 or newer. Its npm dependencies are `pg` (Postgres driver) and `@anthropic-ai/sdk` (chat support).

```
browser (public/index.html) ──▶ server.js ──▶ Postgres: kam_users, kam_leads
         │  /auth/*  /api/leads  /api/chat  /api/ghl      ├──▶ Claude API (chat support)
         └─ keeps an offline copy of the user's leads     └──▶ GoHighLevel webhook
```

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

Each user's leads are saved in the same place, in `kam_leads` or `DATA_DIR/leads/` (see [Leads and contact history](#leads-and-contact-history)).

## Leads and contact history

- **Saved to your account.** Leads belong to the signed-in user and sync to every device they sign in on. Each user only sees their own leads. The browser keeps a copy, so the app opens instantly and keeps working offline; changes upload in the background. The top bar shows **Saved**, **Saving…** or **Offline · saved on this device**.
- **Conflicts:** each lead carries an `updated` time and the newer copy wins. Deleted leads leave a marker so a stale copy on another device can't bring them back.
- **First sign-in:** leads saved in that browser before accounts existed are moved into the first account that signs in there.
- **Log contact:** in a lead's panel, record a call, text, email, meeting or note with an outcome (Connected, Left voicemail, No answer, Wrong number, Not interested, Appointment set) and a note. Logging a contact moves a New lead to Contacted, and "Appointment set" moves it to Appointment. The Call, Text and Email buttons log automatically.
- **History:** the **History** button opens every contact and change across all leads, newest first, with today/7-day counts, filters (contacts, calls, texts, emails, meetings, notes, status changes, GHL), date ranges, search, and **Export CSV**. Click an entry to open the lead. Each entry records who logged it.
- Each lead keeps its latest 200 history entries.

## Chat support

A **Support** button in the bottom-right corner opens Kam, an AI assistant built on Claude. It knows how the app works (setup, GHL troubleshooting, lead scoring, imports, history) and can help with prospecting and follow-up, with Do Not Call / TCPA reminders. It sees a summary of the user's pipeline (counts by status and type), not their contacts' details.

- Turn it on by setting `ANTHROPIC_API_KEY`. Without it the button is hidden (or, if `SUPPORT_EMAIL` is set, shows a "contact our team" link).
- `SUPPORT_EMAIL` adds an "Email support" link and tells the assistant where to send people who need a human.
- The default model is `claude-opus-5-5` (set `CHAT_MODEL` to change it). Requests use low effort for quick replies, and server-side refusal fallback (`fallbacks: "default"`) so a safety decline is retried on a fallback model.
- Each user can send 30 messages per 10 minutes (`CHAT_MESSAGES_PER_10_MIN`). Conversations stay in the browser tab and are not stored on the server.

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
| `ANTHROPIC_API_KEY` | for chat | Turns on AI chat support |
| `SUPPORT_EMAIL` | no | Human support address shown in the chat |
| `CHAT_MODEL` | no | Claude model for chat (default `claude-opus-5-5`) |
| `CHAT_MESSAGES_PER_10_MIN` | no | Chat messages per user per 10 minutes (default `30`) |
| `RATE_LIMIT_PER_MIN` | no | Relay requests per IP per minute (default `60`) |
| `AUTH_ATTEMPTS_PER_15_MIN` | no | Sign-in and sign-up attempts per IP per 15 minutes (default `20`) |
| `NODE_ENV` | no | Set to `production` to send the HSTS header |

## Where data is stored

- Accounts and leads (with contact history): on the server, as above.
- App settings (signature, map keys, GHL options) and an offline copy of the user's leads: the browser's `localStorage`.
- When `public/index.html` is opened as a plain file with no server, leads live only in that browser (`kamteam.leads.v2`).

Use **Backup** in the sidebar to export JSON or CSV for your own records.

Optional integrations, all set up in **Settings**:
- Google Maps API key: Google satellite tiles, Street View, and Google address and business search
- MapTiler satellite tiles
- Instagram Graph API token: hashtag and business lookups

## Production deployment

### Render

1. Create a new **Blueprint** from this repo. Render picks up `render.yaml`.
2. Fill in `GHL_WEBHOOK_URL`, `ALLOWED_EMAILS`, `DATABASE_URL` and, for chat support, `ANTHROPIC_API_KEY` (plus `SUPPORT_EMAIL` if you like). Render generates `SESSION_SECRET` for you. `ALLOWED_ORIGINS` and `API_KEY` are optional.
3. Deploy. Render checks `/api/health` to confirm the app is up.

### Supabase as the database

Supabase's free plan works well for `DATABASE_URL`. The app still runs on Render; Supabase only holds the data. Use a separate Supabase project from the Bible Study app, so the two keep separate accounts.

1. In [Supabase](https://supabase.com/dashboard), click **New project**. Pick the **Southeast Asia (Singapore)** region and a database password made of letters and numbers.
2. Open **SQL Editor → New query**, paste the contents of `supabase/setup.sql` and click **Run**. It creates the tables and turns on Row Level Security, so the project's public API keys can't read accounts or leads.
3. Click **Connect** at the top of the project. Under **Session pooler**, copy the URI and replace `[YOUR-PASSWORD]` with your password. Use the session pooler, not the "Direct connection": the direct one is IPv6-only and Render can't reach it.
4. Paste that URI as `DATABASE_URL` in step 2 of the Render steps above.
5. After the first deploy, sign up in the app. The account shows up in Supabase's **Table Editor → kam_users**.

The Starter plan keeps the app awake. The Free web plan also works, since this app has no scheduled jobs, but it sleeps when idle, so the first visit after a quiet spell takes about a minute.

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
