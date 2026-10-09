# Kam Team Lead Generator

This app can run as a standalone page or behind a secure relay server that forwards form data to your GoHighLevel webhook.

## Quick start

1. Copy `.env.example` to `.env` and set your values.
2. Install dependencies:
   npm install
3. Start the app:
   npm start
4. Open: http://localhost:3000

## Security pattern

The secure production pattern is:

- browser sends lead data to your own server
- your server forwards to the real GHL webhook URL
- the real GHL URL stays in server environment variables, not in the browser

Do not paste the raw GHL webhook URL directly into the front-end if you want to keep it private.

## Environment variables

- `PORT` – server port (default 3000)
- `GHL_WEBHOOK_URL` – your real GHL inbound webhook URL
- `ALLOWED_ORIGINS` – comma-separated list of allowed browser origins
- `API_KEY` – optional shared secret required by the relay API

## Default relay URL in the app

Use `/api/ghl` on the same origin, or a full URL like `https://your-app-domain.com/api/ghl`.

## Production deployment

### Render

1. Push this repo to GitHub.
2. Create a new Render Web Service.
3. Use the included `render.yaml` file or set these environment variables manually:
   - `NODE_ENV=production`
   - `PORT=10000`
   - `GHL_WEBHOOK_URL=https://services.leadconnectorhq.com/hooks/...`
   - `ALLOWED_ORIGINS=https://yourdomain.com`
   - `API_KEY=your-long-shared-secret`
4. Deploy.

### Docker

```bash
docker build -t kam-team-lead-generator .
docker run -p 3000:3000 --env-file .env kam-team-lead-generator
```

### VPS / Linux

```bash
npm install
NODE_ENV=production PORT=3000 GHL_WEBHOOK_URL=... ALLOWED_ORIGINS=https://yourdomain.com npm start
```

Use a reverse proxy like Nginx or Cloudflare in front of the app, and enable HTTPS.
