# Kam Team Bible Study Guide

**Kam Team Publishing** · Powered by **Arty Incognito** & **Sandrhiks Builder**

A Bible study workbook app built on the G12 *Ladder of Success*: **Win → Consolidate → Disciple → Send**. Members sign in, work through Life Class, Pre-Encounter, Encounter, Post-Encounter, School of Leaders (SOL) 1–3, Re-Encounter and the Send practicum, and climb five levels from **Seeker** to **Multiplier**. Daily reading, S.O.A.P. journaling, a prayer list, memory-verse practice and push reminders keep them in the Word between classes.

It installs to the phone's home screen (PWA), works offline, and syncs progress across devices.

## Contents

- [The study method](#the-study-method)
- [Structure: stages, tracks and levels](#structure-stages-tracks-and-levels)
- [Features](#features)
- [Architecture](#architecture)
- [Run it](#run-it)
- [GitHub Pages + Supabase](#github-pages--supabase)
- [Configuration](#configuration)
- [Notifications](#notifications)
- [Customising the curriculum](#customising-the-curriculum)
- [Suggested next features](#suggested-next-features)

## The study method

Every workbook lesson uses the same six steps, so members build one simple habit:

| Step | What the member does |
| --- | --- |
| 1. **Pray** | Asks the Holy Spirit to open their eyes (Psalm 119:18). |
| 2. **Read** | Opens the passage in their own Bible version (NIV, KJV, ESV, NLT, NKJV, Tagalog MBBTAG / ASND). |
| 3. **Key truth** | Reads a short teaching and three main points. |
| 4. **Workbook** | Answers three questions: understand the text, apply it, share their story. Answers save automatically. |
| 5. **Memory verse** | Learns the verse (KJV text in the app) and ticks it off once they can say it. |
| 6. **Apply & share** | Commits to one action step, then shares an answer with their cell leader or consolidator. |

A lesson is complete only when every question is answered and the action step is ticked. That keeps it a workbook to work through, not something to skim.

Between lessons, the **daily rhythm** is one chapter from a reading plan, then a **S.O.A.P.** note:

- **S**cripture: write the verse that stood out
- **O**bservation: what it says
- **A**pplication: what you'll do today
- **P**rayer: talk to God about it

The practical pattern for a member: read every day (5–15 min), do one workbook lesson a week, and bring the workbook to cell group. That matches how Life Class and SOL run in most G12 churches, where there's one session a week.

## Structure: stages, tracks and levels

```
WIN ───────────── CONSOLIDATE ─────────────────────── DISCIPLE ──────────────────────────── SEND
Level 1 Seeker    Level 2 Believer                     Level 3 Disciple    Level 4 Leader       Level 5 Multiplier
Life Class (8)    Pre-Encounter (4)                    SOL 1 (6)           SOL 3 (6)            Send practicum (4)
                  Encounter Weekend (3)                SOL 2 (6)           Re-Encounter (2)
                  Post-Encounter (4)
```

| Track | Lessons | Focus |
| --- | --- | --- |
| **Life Class** (LC) | 8 | New birth, assurance, new creation, grace, forgiveness, the Word, prayer, cell & church |
| **Pre-Encounter** (PE) | 4 | Who Jesus is, the cross, a clean heart, the Father's love |
| **Encounter Weekend** (EN) | 3 | Freedom in Christ, forgiving others, filled with the Holy Spirit |
| **Post-Encounter** (PO) | 4 | Keeping freedom, renewing the mind, water baptism, rooted & growing |
| **School of Leaders 1** | 6 | Scripture, lordship, character, stewardship, family, the G12 vision |
| **School of Leaders 2** | 6 | Intercession, praying for all, spiritual warfare, the gospel, testimony, soul-winning |
| **School of Leaders 3** | 6 | Servant leadership, example, consolidation, leading a cell (Welcome/Worship/Word/Works), multiplying leaders, shepherding |
| **Re-Encounter** (RE) | 2 | Fresh fire (Isaiah 6), writing the vision (Habakkuk 2) |
| **Send** | 4 | Open your cell, fruit that remains, forming your twelve, enlarge your tent |

That's 43 lessons in total.

**Unlocking:** lessons open one at a time, and each track opens when the one before it is finished. Members who have already done these classes at church can turn on **Me → Unlock all lessons**.

**Levels:** a member earns a level when every track in it is done. Each level has a printable **certificate** (Print / Save as PDF).

**XP & badges** reward daily habits alongside the ladder:

| Activity | XP |
| --- | --- |
| Lesson completed | 100 |
| Memory verse memorized | 25 |
| S.O.A.P. journal entry | 15 |
| Chapter read | 10 |
| Prayer marked answered | 5 |

There are 18 badges: First Step, Reader (7 chapters), Bookworm (30), Faithful (7-day streak), Steadfast (30-day streak), Hidden in My Heart (5 verses), Sword Ready (15), Journal Keeper (10 S.O.A.P.), Answered, plus one for each track.

### Research notes

The structure follows the G12 Ladder of Success as churches publish it:

- [FCBC – G12 Ladder: Disciple](https://fcbc.org.sg/about/g12-ladder-success-disciple): SOL 1 covers foundations and family, SOL 2 intercession and evangelism, SOL 3 leadership and the open cell.
- [FCBC – G12 Ladder: Send](https://fcbc.org.sg/about/g12-ladder-success-send): leading your own open cell and joining a G12.
- [FCBC – Equipping courses](https://www.fcbc.org.sg/equipping/equipping-courses): newer formats fold Pre-Encounter, Encounter and Post-Encounter into a 9-week LifeClass, and SOL into "Destiny Training". You can restructure the tracks to match either format (see [Customising](#customising-the-curriculum)).
- [A Manila church's Pre-/Post-Encounter guidelines](https://www.scribd.com/document/185985585/Guidelines): Pre-Encounter as a 4-week weekly class, Post-Encounter as weekly follow-up.

The lesson text is original Kam Team Publishing material. It follows that structure but doesn't copy any church's official workbook. Memory verses are King James Version (public domain).

## Features

- **Sign in / create account / sign out.** Passwords are hashed with scrypt, and sessions use a signed HttpOnly cookie. Signing out also turns off that device's reminders.
- **Today.** Greeting, level and progress, streak, today's chapter (opens in the member's Bible version), the next lesson, and the top prayer requests. It also shows banners for a missed reading or cell day.
- **Path.** The full ladder with every track, lesson, lock state and certificate.
- **Workbook lesson.** The six-step page described above.
- **Journal.** S.O.A.P. notes and a prayer list with categories ("My three to win", Family, Cell & church…). Answered prayers get ticked off.
- **Verses.** Flashcards (reference → verse, or fill the blanks) for every unlocked memory verse.
- **Me.** Level, badges, certificates, reminder settings, reading plan, Bible version, light/dark theme, unlock-all, data export and sign out.
- **Reading plans:** Gospel of John (21 days), New Testament Foundations (125), Proverbs in a Month (31), 30 Days of Psalms.
- **Offline & install.** A service worker caches the app. Progress saves on the device and syncs when it's back online.

## Architecture

```
Phone / browser (PWA)                         bible-study/server.js (Node 18+, no framework)
┌──────────────────────────────┐             ┌──────────────────────────────────────────┐
│ index.html + app.js          │  /auth/*    │ Sign-in  ── ../lib/users.js (scrypt)     │
│  ├ curriculum.js (lessons)   │────────────▶│ Sessions (HMAC-signed cookie)            │
│  ├ state in localStorage     │ /api/progress│ Progress ── lib/store.js                 │
│  └ sw.js (offline + push)    │◀───────────▶│            Postgres or JSON files        │
│                              │ /api/push/* │ Push     ── lib/push.js (VAPID + RFC 8291)│
│  Notification ◀── push ──────┼─────────────│ Scheduler ─ lib/reminders.js (every min) │
└──────────────────────────────┘             └──────────────────────────────────────────┘
```

| Path | What it is |
| --- | --- |
| `server.js` | HTTP server: sign-in gate, static files, progress API, push API, reminder scheduler |
| `lib/store.js` | Progress (one JSON document per member) and push subscriptions (one row per device): Postgres tables `bible_progress` and `bible_push`, or JSON files in `DATA_DIR` |
| `lib/push.js` | Web Push with no dependencies: VAPID (ES256 JWT) and aes128gcm encryption, using `node:crypto` |
| `lib/reminders.js` | Works out which reminders are due for a member right now, in their time zone |
| `public/curriculum.js` | Levels, tracks, lessons, reading plans and Bible versions. **Edit this file to change the content.** |
| `public/app.js` | The single-page app (Today, Path, Lesson, Journal, Verses, Me, Certificate) |
| `public/login.html` | Sign-in and create-account page |
| `public/sw.js` | Service worker: offline cache, push display, notification clicks |
| `public/api.js` | Talks to the backend: the Node server, or Supabase when `config.js` names a project |
| `public/config.js` | Which backend to use. Empty means the Node server; the GitHub Pages workflow fills in Supabase. |
| `supabase/pages.sql` | Supabase tables, access rules and the once-a-minute reminder job, for the GitHub Pages version |
| `supabase/functions/kbs-push/` | Supabase Edge Function that sends push reminders for the GitHub Pages version |
| `supabase/setup.sql` | Locks down the tables when the Node server uses a Supabase database |
| `render.yaml` | Render Blueprint: web app + Postgres |
| `test/` | Tests (`npm test` from the repo root; set `TEST_DATABASE_URL` to also run the Postgres test) |

Accounts reuse the lead generator's `lib/users.js` and `lib/db.js`, so this app needs no extra npm packages. The repo's `pg` dependency is only loaded when `DATABASE_URL` is set.

**Sync model.** The app keeps one state object per member: lessons and answers, verses, journal, prayers, reading, activity log and settings. Changes save to the device immediately and are sent to `PUT /api/progress` about a second later. The copy with the newer `updated` time wins. If a stale device tries to overwrite newer progress, the server answers 409 with the newer copy, and the app switches to it.

## Run it

From the repo root:

```bash
npm install                 # once, for the repo
npm run bible               # http://localhost:3100
npm test                    # runs the lead generator and Bible study tests
```

Open http://localhost:3100, click **Create account**, and start Life Class.

## GitHub Pages + Supabase

This runs the app with no server of your own. GitHub Pages hosts the pages and Supabase does the rest:

| Part | Where it runs |
| --- | --- |
| The app (pages, lessons, offline copy) | GitHub Pages |
| Sign-in and accounts | Supabase Auth |
| Progress and devices | Supabase database, protected by Row Level Security |
| Reminders | A Supabase Edge Function (`kbs-push`), called once a minute by `pg_cron` |

The GitHub workflow `.github/workflows/bible-study-pages.yml` publishes the app and deploys the function whenever `main` changes. GitHub Pages is free for public repositories; a private one needs a paid GitHub plan. Accounts here are Supabase accounts, separate from the Node server version's.

### Set it up (about 20 minutes, once)

**1. Supabase project**

1. In [Supabase](https://supabase.com/dashboard), click **New project**. Pick **Southeast Asia (Singapore)** and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `bible-study/supabase/pages.sql`, and click **Run**.
3. Open **Authentication → URL Configuration**. Set **Site URL** to your Pages address, `https://sandrhiks.github.io/Kam-team-Lead-generator/`, and add the same address under **Redirect URLs**. The links in sign-up emails go there.
4. Collect three values from **Project Settings**:
   - **Project URL**, like `https://abcdefghij.supabase.co`
   - the **anon public** key (or the **publishable** key, `sb_publishable_…`). It's safe in the browser: the tables only allow what the app needs.
   - the **project ref**, the `abcdefghij` part of the URL
5. Open [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) and click **Generate new token**. GitHub uses it to deploy the reminder function. Keep it private.

**2. GitHub repository**

1. Open **Settings → Secrets and variables → Actions**.
   - On the **Variables** tab, add `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_PROJECT_REF`.
   - On the **Secrets** tab, add `SUPABASE_ACCESS_TOKEN`.
2. Open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open **Actions → Bible Study on GitHub Pages → Run workflow**. Later changes to `main` publish by themselves.
4. When both jobs are green, open `https://sandrhiks.github.io/Kam-team-Lead-generator/` and create an account.
5. Check reminders: **Me → Reminders → Turn on**, then **Send test**.

### Good to know

- **Email confirmation.** Supabase asks new members to confirm their email by default. Its built-in email sender only sends a few emails an hour, which suits a test but not a whole church. For launch, either add your own email service under **Project Settings → Authentication → SMTP**, or turn off **Confirm email** under **Authentication → Sign In / Providers → Email**.
- **Who can sign up.** Anyone with the link. To close sign-ups, turn off **Allow new users to sign up** under **Authentication → Sign In / Providers**. (`ALLOWED_EMAILS` is for the Node server only.)
- **Your own domain.** Add it under **Settings → Pages → Custom domain**, then update the Site URL and Redirect URLs in Supabase to match.
- **Push keys** are made by the function on its first run and kept in the `kbs_meta` table. Don't delete that row: new keys would turn off reminders on every device.
- **Checking reminders.** In Supabase, **Integrations → Cron → kbs-reminders** shows each minute's run, and **Edge Functions → kbs-push → Logs** shows what was sent.
- **Free plan.** Supabase can pause a free project that sees little use. Members using the app keep it active; if it's paused, restore it from the dashboard.

### Deploy on Render

`bible-study/render.yaml` is a Render Blueprint. It creates the web app and its own Postgres database in Singapore, the closest region to the Philippines. The settings are filled in for you: `SESSION_SECRET` is generated, the database is connected, and push keys are created on first start and kept in the database.

1. In the [Render dashboard](https://dashboard.render.com), choose **New → Blueprint**.
2. Connect the GitHub repo `sandrhiks/kam-team-lead-generator`. Pick the branch that has this code: `main` once it's merged, or the feature branch until then.
3. Set **Blueprint Path** to `bible-study/render.yaml`, then click **Apply**.
4. Wait for the deploy to go green, then open the `https://kam-bible-study.onrender.com` link Render shows you.
5. Optional: add your own domain (for example `bible.kam-team.com`) under the service's **Settings → Custom Domains**.

**Cost:** Render's Starter web plan and the `basic-256mb` database are paid, at a few dollars a month each. The web app has to stay awake, because the reminder scheduler runs inside it; Render's free web plan sleeps and would miss reminders. Free Render databases also expire after 30 days. Check [Render pricing](https://render.com/pricing) for current prices.

This database is separate from the lead generator's, so Bible study accounts are separate too.

### Use Supabase as the database

Supabase hosts the Postgres database; it can't run this Node server, so the app itself still runs on Render (or another Node host). Supabase's free plan replaces the paid Render database.

1. In [Supabase](https://supabase.com/dashboard), click **New project**. Pick the **Southeast Asia (Singapore)** region, set a database password and save it somewhere safe.
2. Open **SQL Editor → New query**, paste the contents of `bible-study/supabase/setup.sql` and click **Run**. It creates the tables and turns on Row Level Security, so the project's public API keys can't read accounts or progress.
3. Click **Connect** at the top of the project. Under **Connection string → Session pooler**, copy the URI. It looks like `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`. Replace `[YOUR-PASSWORD]` with your database password. Use the session pooler, not the "Direct connection": the direct one is IPv6-only and Render can't reach it.
4. In Render, choose **New → Blueprint**, connect this repo, set **Blueprint Path** to `bible-study/render-supabase.yaml`, paste the URI from step 3 as `DATABASE_URL`, then click **Apply**.
5. When the deploy is green, open the app link and create the first account. In Supabase's **Table Editor** you'll see the row appear in `kam_users`.

Notes:

- If your password has symbols such as `@`, `#` or `/`, URL-encode them in the URI (for example `@` becomes `%40`), or choose a password of letters and numbers.
- Supabase pauses free projects after about a week with no activity. A church using the app daily keeps it awake; otherwise un-pause it from the dashboard.
- To run locally against Supabase, put the same URI in `bible-study/.env` as `DATABASE_URL` and run `npm run bible`.

### Other hosts

**Deploy:** any Node host works, including Render, Railway, Fly.io or a VPS. Set the start command to `node bible-study/server.js` from the repo root. Then:

- Set `DATABASE_URL` (Postgres) so progress survives redeploys. Without it, use a persistent disk for `DATA_DIR`.
- Set `SESSION_SECRET` so sign-ins survive restarts. Push keys are generated and kept in the database automatically.
- Serve it over **HTTPS**. Service workers and push only work on HTTPS (or localhost).

## Configuration

Copy `bible-study/.env.example` to `bible-study/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3100` | Port to listen on |
| `SESSION_SECRET` | random | Signs session cookies. Set it, or everyone is signed out on restart. |
| `SESSION_DAYS` | `30` | How long a sign-in lasts |
| `ALLOWED_EMAILS` | `*` | Who can create an account: `*` (anyone), or a list like `pastor@church.org,@church.org` |
| `DATABASE_URL` | – | Postgres. If unset, JSON files are used. |
| `DATA_DIR` | `bible-study/data` | Where the JSON files go when there's no `DATABASE_URL` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated | Optional push keys. If unset, a pair is generated once and kept in the database (or `DATA_DIR`). To set your own, generate a pair with `node -e "console.log(require('./bible-study/lib/push').generateVapidKeys())"`. |
| `VAPID_SUBJECT` | `mailto:team@kam-team.com` | Contact the push services see |

**Shared database:** if this app and the lead generator use the same `DATABASE_URL`, they share the `kam_users` accounts table. Use a separate database if you want separate accounts.

## Notifications

Members turn them on in **Me → Reminders → Turn on**. Each device subscribes to Web Push, and the server's once-a-minute scheduler sends:

- **Daily study reminder** at their chosen time and days, with today's chapter and next lesson. It's skipped if they've already read today. After 3 or more days away it becomes a "we saved your seat" message, and it mentions their streak when they have one.
- **Cell group reminder** on the day their cell meets, with their own note (place, what to bring).
- **Evening verse review** with the next verse to memorize.

Reminders arrive even when the app is closed. Supported platforms: Chrome, Edge and Firefox on Android and desktop, and Safari on iOS 16.4+ once the app is **added to the Home Screen** (the app shows iPhone users this tip). On a device that can't subscribe, the app falls back to a local notification while it's open. **Send test** checks the setup.

## Customising the curriculum

Everything is in `public/curriculum.js`:

- **Change a lesson:** edit its `title`, `read` (passages), `verse`, `truth`, `points`, `questions` or `action`.
- **Use your church's official materials:** replace the lessons in a track. Ids must stay unique, and members' saved answers are keyed by lesson id.
- **Match the newer LifeClass / Destiny format:** merge `pre`, `enc` and `post` into one 9-lesson LifeClass track, or rename SOL to Destiny Training. Levels are earned by whichever tracks have that `level` number.
- **Add a reading plan or Bible version:** append to `PLANS` or `VERSIONS`.

## Suggested next features

These fit the G12 model and are the natural next steps:

1. **Leader / consolidator dashboard.** Link each member to their cell leader. The leader sees their disciples' level, streak and last activity, and gets an alert when someone goes quiet for 7 days. This is consolidation made visible.
2. **Cell group space.** Each group gets a meeting schedule, an attendance check-in, the week's lesson discussion guide (Welcome, Worship, Word, Works), and a shared prayer wall.
3. **Encounter registration.** Members sign up for Encounter and Re-Encounter weekends inside the app. Leaders mark attendance, which unlocks the Encounter track automatically.
4. **"My three to win" tracker.** Promote the prayer list category into a small pipeline: praying → invited → attended cell → Life Class.
5. **Bible text in the app.** Embed a licensed or public-domain Bible (KJV, WEB), so reading works offline and verses can be highlighted.
6. **Audio and video.** A short teaching video or audio for each lesson, for members who learn by listening.
7. **Quizzes and an admin console.** A 5-question check at the end of each track, and a web editor for curriculum.js so pastors can update lessons without code.
8. **Languages.** Tagalog and Bisaya versions of the lesson text, since the app already links Tagalog Bibles.
9. **Email / SMS fallback** for members who don't allow push.

---

**Kam Team Publishing** · Powered by **Arty Incognito** & **Sandrhiks Builder**
