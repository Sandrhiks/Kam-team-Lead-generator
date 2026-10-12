# Kam Team Graphic Designer AI

A web app for making on-brand Kam Team graphics with AI. It lives on its own `graphic-designer-ai` branch, separate from the Lead Generator. People sign in with a one-time code sent to their email, describe what they need, and an AI design agent builds it on the canvas. Every design follows the team's [Design SOP](docs/SOP.md) (Brief → Create → Review → Approve → Export) and downloads as PNG, JPG, PDF, SVG or an editable source file.

## Features

| Area | What it does |
| --- | --- |
| **Sign-in with email OTP** | 6-digit code by email, no passwords. Codes expire in 10 minutes, are stored hashed, burn after 5 wrong tries, and can be re-sent after 30 seconds. Sign out, or **Sign out of all devices**. |
| **AI design agent** | In the editor, the assistant (Claude) edits the design with tools: applies templates, writes the brief and copy, adds/edits/arranges elements, draws vector icons, fills photo frames with generated images, resizes for other channels, runs the brand check and ticks SOP checklist items. It sees a snapshot of the canvas. Every AI change is one Ctrl+Z away. |
| **Editor** | Text, shapes, Kam Team logo, photo frames and uploads; drag, resize (Shift keeps proportions), snapping to center, arrow-key nudge, layers (order, hide, lock), alignment, undo/redo, autosave. |
| **Templates** | 12 on-brand starters: Just Listed, Open House, New Listing Story, Just Sold, Market Update, Facebook cover, LinkedIn banner, newsletter header, YouTube thumbnail, listing flyer (300 DPI), business card, presentation slide. Each lists the best AI tools and prompt starters. |
| **SOP workflow** | Stage stepper, per-stage checklists, the brief, approver, and an automatic **brand check** (contrast, palette, fonts, logo, placeholders, margins, text size, DRE reminder) with a score. |
| **AI Tools guide** | When to use Claude, GPT Image, Midjourney, Adobe Firefly, Ideogram, Recraft, FLUX, Gemini, Canva, Photoshop Generative Fill, upscalers, background removal and video tools, with strengths, watch-outs and prompt tips. |
| **Prompt Builder** | Builds a prompt formatted for the chosen tool (Midjourney parameters, Ideogram text, video motion, and so on). Copy it, ask the assistant to improve it, or generate it in the app. |
| **Assistant** | A ChatGPT-style chat: saved conversations (search, pin, rename, delete), streaming answers with markdown, copy and regenerate. Knows the app, the brand, the SOP and the tool guide. |
| **Support** | Searchable FAQ, the SOP, and support tickets that are saved and emailed to `SUPPORT_EMAIL`. |
| **Downloads** | PNG, PNG @2x, JPG, PDF (one page, 300 DPI for print templates), SVG, and `.kamdesign.json` (re-import from Home). |
| **Brand** | Kam Team monochrome palette, Archivo + Inter, the chevron mark, light and dark themes, works on phones. |

## Quick start

```bash
cp .env.example .env      # set ALLOWED_EMAILS and SESSION_SECRET at least
npm install
npm start
```

Open http://localhost:3000 and sign in with an approved email. With no email provider configured (and `NODE_ENV` not `production`), the code is printed in the server log so you can try it locally.

To turn on AI, set `ANTHROPIC_API_KEY`. To generate images inside the app, also set `OPENAI_API_KEY`. Without them, everything else still works and the AI buttons explain what's missing.

## How it fits together

```
browser ──▶ server.js ──▶ storage: Postgres (DATABASE_URL) or JSON files (DATA_DIR)
  │  /auth/otp/*  /api/designs  /api/chats  /api/tickets     ├──▶ email: Resend or your webhook (codes, tickets)
  │  /api/assistant (SSE)  /api/images                         ├──▶ Claude API (design agent + chat)
  └─ renders and exports designs in the browser                └──▶ OpenAI Images API (optional)
```

| Path | What it is |
| --- | --- |
| `server.js` | HTTP server: sessions, OTP sign-in, designs/chats/tickets API, AI routes, static files, security headers |
| `lib/otp.js` | One-time codes and the mailer (Resend, webhook, or dev console) |
| `lib/store.js` | Users, codes and documents in Postgres or JSON files |
| `lib/design.js` | Design validation, the edit operations, the brand check (shared with the browser as `/js/design.js`) |
| `lib/agent.js` | The AI assistant: tools, instructions, the tool loop and streaming |
| `lib/catalog.js` | SOP, brand kit, AI tool guide and templates (one source for the UI and the AI) |
| `lib/images.js` | Optional image generation |
| `public/` | The app: `index.html`, `login.html`, `js/` (app, editor, renderer, UI helpers), `css/` |
| `docs/SOP.md` | The Design SOP |
| `test/` | Tests (`npm test`) |

### How the design agent works

The browser sends the conversation, the current design (with image pixels swapped for `asset:<id>` references so requests stay small) and a JPEG snapshot of the canvas. The server runs Claude with design tools in a loop: each tool call is validated, applied to a working copy of the design, and its result goes back to Claude, until Claude is done (at most 14 steps). The server streams Claude's text and each step (`Adding text`, `Running the brand check`…) to the browser, then sends the updated design, which the browser applies as a single undo step.

- Model: `claude-opus-5-5` by default (`AI_MODEL`), `medium` effort in the editor and `low` in the chat, with server-side refusal fallback (`fallbacks: "default"`).
- The instructions (brand, SOP, templates, tool guide) are cached between requests.
- Tool inputs stream as they're generated (`eager_input_streaming`) and are checked against each tool's schema before they run; bad input goes back to Claude as an error so it can retry.
- AI-drawn SVG is stripped of scripts, event handlers and external links, and is only ever drawn as an image.

## Sign-in details

- **Who can sign up:** `ALLOWED_EMAILS` lists emails and `@domains`, or `*` for anyone. With an empty list only the very first account can be created. Existing accounts can always sign in.
- **Codes:** 6 digits from a secure random source, HMAC-hashed with `SESSION_SECRET`, valid `OTP_MINUTES` (default 10), single use, 5 wrong guesses burn the code. Limits: one code per email per 30 seconds and 6 per hour; 10 code requests and 30 verify attempts per IP per 15 minutes.
- **Sessions:** HttpOnly, SameSite=Lax cookie signed with `SESSION_SECRET`, `Secure` on HTTPS, lasting `SESSION_DAYS` (default 7). **Sign out of all devices** bumps the account's session version so every older cookie stops working.
- **Email delivery:** `RESEND_API_KEY` + `MAIL_FROM` (a sender on a domain verified in Resend), or `MAIL_WEBHOOK_URL`, which receives `{to, subject, text, html, code}` so a GoHighLevel, n8n or Zapier workflow can send it. In production with neither, the server refuses to start sign-ins and logs a warning.

## Security

- Every page and API call needs a signed-in user except the sign-in page and its assets.
- Writes must come from the app's own origin. Strict Content Security Policy (scripts only from the app itself), `nosniff`, `X-Frame-Options`, HSTS in production.
- Designs are validated on the server: known element types, clamped numbers, `#RRGGBB` colors, images only as PNG/JPEG/WebP/GIF/SVG data under 6 MB, at most 300 elements, 500 designs per user.
- Each user only sees their own designs, chats and tickets.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ALLOWED_EMAILS` | yes | Emails and `@domains` allowed to create an account, or `*` |
| `SESSION_SECRET` | yes, in production | Long random string; signs cookies and hashes codes |
| `RESEND_API_KEY` + `MAIL_FROM` | one email option, in production | Sends sign-in codes and tickets through Resend |
| `MAIL_WEBHOOK_URL` | the other email option | Posts emails to your own workflow |
| `DATABASE_URL` | yes, on hosts without a disk | Postgres connection string (tables `studio_users`, `studio_codes`, `studio_docs` are created automatically) |
| `DATA_DIR` | no | Folder for JSON storage when there's no database (default `./data`) |
| `ANTHROPIC_API_KEY` | for AI | Turns on the design agent and the Assistant |
| `AI_MODEL` | no | Claude model (default `claude-opus-5-5`) |
| `OPENAI_API_KEY` | no | Turns on image generation |
| `IMAGE_MODEL` | no | Image model (default `gpt-image-1`) |
| `SUPPORT_EMAIL` | no | Receives support tickets; shown to users |
| `OTP_MINUTES` / `SESSION_DAYS` | no | Code lifetime (10) / sign-in length in days (7) |
| `AI_MESSAGES_PER_10_MIN` / `IMAGES_PER_HOUR` | no | Per-user AI limits (40 / 30) |
| `CODE_REQUESTS_PER_15_MIN` / `VERIFY_ATTEMPTS_PER_15_MIN` | no | Per-IP sign-in limits (10 / 30) |
| `PORT` | no | Default `3000` |
| `NODE_ENV` | no | `production` enables HSTS and requires a real email provider |

## Deploy

**Render (one click):** `render.yaml` on this branch creates the web service and a Postgres database, wires `DATABASE_URL`, and generates `SESSION_SECRET`.

1. In Render: **New → Blueprint**, connect the `Kam-team-Lead-generator` repo, and pick the **`graphic-designer-ai`** branch.
2. Fill in the prompted values: `ALLOWED_EMAILS` (e.g. `@kam-team.com`), one email option (`RESEND_API_KEY` + `MAIL_FROM`, or `MAIL_WEBHOOK_URL`), `ANTHROPIC_API_KEY`, and optionally `OPENAI_API_KEY` and `SUPPORT_EMAIL`. Leave the rest empty.
3. Click **Apply**. When the deploy is live, open the `.onrender.com` URL and sign in.

The Blueprint uses Render's free plans: the web service sleeps when idle (the first visit takes ~30 seconds) and the free database expires after 30 days. Switch both to paid plans for real use.

**Docker:**

```bash
docker build -t kam-team-graphic-designer-ai .
docker run -p 3000:3000 --env-file .env -v kds-data:/app/data kam-team-graphic-designer-ai
```

Put it behind HTTPS (Nginx, Cloudflare, or your host's TLS). The server reads `X-Forwarded-For` and `X-Forwarded-Proto` for rate limits and secure cookies.

## Tests

```bash
npm test
```

Covers OTP sign-in (codes, hashing, cooldown, lockout, sign-out everywhere), the designs/chats/tickets API and per-user isolation, design validation and the brand check, every template, SVG sanitizing, image generation, and the AI agent's tool loop against a local mock of the Claude API.
