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
| `test/` | Tests (`npm test` from the repo root) |

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

**Deploy:** any Node host works, including Render, Railway, Fly.io or a VPS. Set the start command to `node bible-study/server.js` from the repo root. Then:

- Set `DATABASE_URL` (Postgres) so progress survives redeploys. Without it, use a persistent disk for `DATA_DIR`.
- Set `SESSION_SECRET`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` so sessions and push subscriptions survive restarts.
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
| `DATA_DIR` | `bible-study/data` | Where the JSON files and generated VAPID keys go |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | generated | Push keys. Generate a pair with `node -e "console.log(require('./bible-study/lib/push').generateVapidKeys())"`. |
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
