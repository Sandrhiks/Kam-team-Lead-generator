// Kam Team Bible Study Guide — the app.
// One state object per member, kept in localStorage for offline use and synced
// through window.KBS (api.js). Views are rendered from that state on every hash change.
(function () {
  "use strict";

  const C = window.CURRICULUM;
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const LESSONS = C.TRACKS.flatMap(t => t.lessons.map((l, i) => Object.assign({}, l, { track: t, index: i })));
  const LESSON = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const TRACK = Object.fromEntries(C.TRACKS.map(t => [t.id, t]));

  let me = null;
  let S = null;

  /* ---------------- State ---------------- */
  function blank() {
    return {
      v: 1, updated: 0, lessons: {}, verses: {}, journal: [], prayers: [],
      reading: { plan: "john21", day: 0, done: {} }, log: {},
      settings: {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", version: "NIV", unlockAll: false,
        reminders: {
          daily: { on: true, time: "06:00", days: [] },
          cell: { on: false, day: 5, time: "19:00", note: "" },
          verse: { on: false, time: "21:00" },
        },
      },
      next: {}, streak: 0,
    };
  }

  // Fill in anything a stored copy is missing (older versions, new settings).
  function normalize(s) {
    const b = blank();
    s = Object.assign(b, s || {});
    s.settings = Object.assign(blank().settings, s.settings || {});
    s.settings.reminders = Object.assign(blank().settings.reminders, s.settings.reminders || {});
    for (const k of ["daily", "cell", "verse"]) s.settings.reminders[k] = Object.assign(blank().settings.reminders[k], s.settings.reminders[k]);
    s.reading = Object.assign(blank().reading, s.reading || {});
    s.settings.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || s.settings.tz;
    return s;
  }

  const storeKey = () => "kbs.state." + me.email;
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(storeKey())); } catch { return null; }
  }
  function writeLocal() {
    try { localStorage.setItem(storeKey(), JSON.stringify(S)); } catch { /* storage full or blocked */ }
  }

  let syncTimer = null, syncing = false;
  function save() {
    S.updated = Date.now();
    S.next = nextHints();
    S.streak = streak();
    writeLocal();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 1200);
  }

  async function sync() {
    if (syncing) { syncTimer = setTimeout(sync, 1500); return; }
    syncing = true;
    try {
      const r = await KBS.putProgress(S, S.updated);
      if (r.status === "signedOut") return location.replace(KBS.loginUrl);
      if (r.status === "conflict" && r.updated > S.updated) {
        S = normalize(r.data); writeLocal(); render(); toast("Updated with your latest progress from another device");
      }
    } catch { /* offline: the local copy is kept and synced next time */ }
    finally { syncing = false; }
  }

  function logToday(kind) {
    const d = dateKey();
    S.log[d] = Object.assign(S.log[d] || {}, { [kind]: true });
  }

  /* ---------------- Progress rules ---------------- */
  const lessonDone = id => !!(S.lessons[id] && S.lessons[id].done);
  const trackDone = t => t.lessons.every(l => lessonDone(l.id));
  const levelTracks = n => C.TRACKS.filter(t => t.level === n);
  const levelDone = n => levelTracks(n).every(trackDone);

  function trackUnlocked(t) {
    if (S.settings.unlockAll) return true;
    const i = C.TRACKS.indexOf(t);
    return i === 0 || trackDone(C.TRACKS[i - 1]);
  }
  function lessonUnlocked(l) {
    if (S.settings.unlockAll) return true;
    return trackUnlocked(l.track) && (l.index === 0 || lessonDone(l.track.lessons[l.index - 1].id));
  }
  const nextLesson = () => LESSONS.find(l => !lessonDone(l.id) && lessonUnlocked(l)) || null;

  // Levels earned in order; the member is "at" the first level not yet earned.
  function earnedLevels() {
    let n = 0;
    for (const lv of C.LEVELS) { if (levelDone(lv.level)) n = lv.level; else break; }
    return n;
  }
  function rankInfo() {
    const earned = earnedLevels();
    const at = C.LEVELS[Math.min(earned, C.LEVELS.length - 1)];
    const lessons = levelTracks(at.level).flatMap(t => t.lessons);
    const done = lessons.filter(l => lessonDone(l.id)).length;
    return { earned, at, done, total: lessons.length, complete: earned === C.LEVELS.length };
  }

  function streak() {
    let n = 0;
    const d = new Date();
    if (!S.log[dateKey(d)]) d.setDate(d.getDate() - 1);
    while (S.log[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function bestStreak() {
    const days = Object.keys(S.log).sort();
    let best = 0, run = 0, prev = null;
    for (const k of days) {
      const t = Date.parse(k + "T00:00:00Z");
      run = prev !== null && t - prev === 864e5 ? run + 1 : 1;
      best = Math.max(best, run); prev = t;
    }
    return best;
  }

  const readCount = () => Object.keys(S.reading.done).length;
  const versesMemorized = () => Object.values(S.verses).filter(v => v && v.memorized).length;
  function xp() {
    const lessons = Object.values(S.lessons).filter(l => l && l.done).length;
    return lessons * 100 + readCount() * 10 + S.journal.length * 15 + versesMemorized() * 25 +
      S.prayers.filter(p => p.answered).length * 5;
  }

  const plan = () => C.PLANS.find(p => p.id === S.reading.plan) || C.PLANS[0];
  const todayRef = () => plan().days[Math.min(S.reading.day, plan().days.length - 1)];
  const planFinished = () => S.reading.day >= plan().days.length;
  const bibleUrl = ref => `https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref)}&version=${encodeURIComponent(S.settings.version)}`;

  function nextHints() {
    const l = nextLesson();
    const v = unlockedVerses().find(x => !(S.verses[x.ref] && S.verses[x.ref].memorized));
    return { reading: planFinished() ? "" : todayRef(), lesson: l ? `${l.track.code} ${l.index + 1} · ${l.title}` : "", verse: v ? v.ref : "" };
  }

  function unlockedVerses() {
    const seen = new Set();
    return LESSONS.filter(l => lessonUnlocked(l) || lessonDone(l.id))
      .map(l => Object.assign({ lesson: l }, l.verse))
      .filter(v => !seen.has(v.ref) && seen.add(v.ref));
  }

  const BADGES = [
    { id: "first", ic: "\u{1F331}", name: "First Step", hint: "Finish your first lesson", test: () => Object.values(S.lessons).some(l => l && l.done) },
    { id: "read7", ic: "\u{1F4D6}", name: "Reader", hint: "Read 7 chapters", test: () => readCount() >= 7 },
    { id: "read30", ic: "\u{1F4DA}", name: "Bookworm", hint: "Read 30 chapters", test: () => readCount() >= 30 },
    { id: "streak7", ic: "\u{1F525}", name: "Faithful", hint: "7-day streak", test: () => bestStreak() >= 7 },
    { id: "streak30", ic: "\u{2B50}", name: "Steadfast", hint: "30-day streak", test: () => bestStreak() >= 30 },
    { id: "verse5", ic: "\u{2728}", name: "Hidden in My Heart", hint: "Memorize 5 verses", test: () => versesMemorized() >= 5 },
    { id: "verse15", ic: "\u{1F48E}", name: "Sword Ready", hint: "Memorize 15 verses", test: () => versesMemorized() >= 15 },
    { id: "soap10", ic: "\u{270D}\u{FE0F}", name: "Journal Keeper", hint: "10 S.O.A.P. entries", test: () => S.journal.length >= 10 },
    { id: "answered", ic: "\u{1F64C}", name: "Answered", hint: "Mark a prayer answered", test: () => S.prayers.some(p => p.answered) },
    ...C.TRACKS.map(t => ({ id: "t-" + t.id, ic: t.id === "enc" ? "\u{1F54A}\u{FE0F}" : "\u{1F393}", name: t.title, hint: "Complete " + t.title, test: () => trackDone(t) })),
  ];

  /* ---------------- UI helpers ---------------- */
  let toastTimer;
  function toast(msg, ms = 2600) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }
  const bar = (done, total) => `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><b style="width:${total ? Math.round(done / total * 100) : 0}%"></b></div>`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function renderChip() {
    const r = rankInfo();
    $("#rankChip").innerHTML = `<i style="background:${r.at.color}">${r.at.level}</i>${esc(r.complete ? "Multiplier ✓" : r.at.rank)} · ${xp()} XP`;
  }
  $("#rankChip").onclick = () => { location.hash = "#me"; };

  /* ---------------- Views ---------------- */
  function viewToday() {
    const r = rankInfo();
    const name = (me.name || me.email.split("@")[0]).split(" ")[0];
    const hour = new Date().getHours();
    const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const readToday = !!(S.log[dateKey()] && S.log[dateKey()].read);
    const nl = nextLesson();
    const dr = S.settings.reminders.daily;
    const nowHm = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
    const late = dr.on && !readToday && nowHm >= dr.time;
    const cell = S.settings.reminders.cell;
    const cellToday = cell.on && Number(cell.day) === new Date().getDay();
    const pushHint = "Notification" in window && Notification.permission === "default";

    return `
      ${late ? `<div class="banner">\u{1F514} <div>Your reading for today is waiting. Five quiet minutes is enough.</div></div>` : ""}
      ${cellToday ? `<div class="banner">\u{1F91D} <div><b>Cell group today at ${esc(cell.time)}.</b> ${esc(cell.note || "Bring your workbook and a friend.")}</div></div>` : ""}
      ${pushHint ? `<div class="banner">\u{1F4F2} <div>Turn on reminders so you never miss your daily time with God.</div><a class="btn small primary" href="#me/reminders">Set up</a></div>` : ""}
      <h1 class="page">${hello}, ${esc(name)}</h1>
      <p class="lede">${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</p>

      <section class="panel">
        <div class="rank-hero">
          <div class="medal" style="background:${r.at.color}">${r.at.level}</div>
          <div style="flex:1;min-width:0">
            <h3>Level ${r.at.level} · ${esc(r.at.rank)}</h3>
            <p>${esc(r.complete ? "You've completed the whole ladder. Keep multiplying!" : r.at.blurb)}</p>
            ${bar(r.done, r.total)}
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>${streak()}</b><span>day streak</span></div>
          <div class="stat"><b>${xp()}</b><span>XP</span></div>
          <div class="stat"><b>${Object.values(S.lessons).filter(l => l && l.done).length}/${LESSONS.length}</b><span>lessons</span></div>
        </div>
      </section>

      <h2 class="sec">1 · Read</h2>
      <section class="panel">
        ${planFinished() ? `<p style="margin:0">\u{1F389} You finished <b>${esc(plan().title)}</b>! Choose a new plan in <a href="#me">Me</a>.</p>` : `
        <div class="row between">
          <div>
            <div class="muted" style="font-size:13px">${esc(plan().title)} · Day ${S.reading.day + 1} of ${plan().days.length}</div>
            <div class="reading"><span class="ref">${esc(todayRef())}</span></div>
          </div>
          <a class="btn" href="${bibleUrl(todayRef())}" target="_blank" rel="noopener">Open ${esc(S.settings.version)}</a>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn ${readToday ? "" : "primary"}" data-act="read">${readToday ? "✓ Read today — mark next chapter" : "Mark as read (+10 XP)"}</button>
          <a class="btn ghost" href="#journal/new">Write a S.O.A.P. note</a>
        </div>`}
      </section>

      <h2 class="sec">2 · Study</h2>
      <section class="panel">
        ${nl ? `
          <div class="muted" style="font-size:13px">${esc(nl.track.title)} · Lesson ${nl.index + 1} of ${nl.track.lessons.length}</div>
          <h3 style="margin:2px 0 6px;font-family:var(--serif);font-size:20px">${esc(nl.title)}</h3>
          <p class="muted" style="margin:0 0 12px">${esc(nl.read.join(" · "))}</p>
          <a class="btn primary" href="#lesson/${nl.id}">${S.lessons[nl.id] ? "Continue workbook" : "Start lesson"}</a>`
        : `<p style="margin:0">You've completed every lesson. \u{1F64C} Review your verses, keep journaling, and lead others through the ladder.</p>`}
      </section>

      <h2 class="sec">3 · Pray</h2>
      <section class="panel">
        ${S.prayers.filter(p => !p.answered).slice(0, 3).map(p => `<div class="prayer"><span>\u{1F64F}</span><div class="txt">${esc(p.text)}</div></div>`).join("") || `<p class="empty" style="padding:4px">No prayer requests yet.</p>`}
        <a class="btn small" href="#journal/prayer" style="margin-top:8px">Open prayer list</a>
      </section>
      ${credit()}`;
  }

  function viewPath() {
    const r = rankInfo();
    return `
      <h1 class="page">Your path</h1>
      <p class="lede">The ladder: Win → Consolidate → Disciple → Send. Finish each track to unlock the next and earn your next level.</p>
      ${C.LEVELS.map(lv => {
        const tracks = levelTracks(lv.level);
        const earned = levelDone(lv.level);
        return `<section class="stage" style="color:${lv.color}">
          <span class="stage-dot" style="background:${earned ? lv.color : "var(--panel)"}"></span>
          <div class="stage-head"><b>${lv.stage}</b><span style="color:var(--ink)">Level ${lv.level} · ${esc(lv.rank)}</span>${earned ? `<a class="pill ok" href="#cert/${lv.level}">Certificate</a>` : ""}</div>
          <div style="color:var(--ink)">${tracks.map(trackCard).join("")}</div>
        </section>`;
      }).join("")}
      <p class="muted" style="font-size:13px">Already finished some of these classes at church? Turn on <a href="#me">Me → Unlock all lessons</a>.</p>
      ${r.complete ? `<p class="banner">\u{1F3C6} Ladder complete. Now help your twelve climb it.</p>` : ""}
      ${credit()}`;
  }

  function trackCard(t) {
    const open = trackUnlocked(t);
    const done = t.lessons.filter(l => lessonDone(l.id)).length;
    return `<div class="track" ${open ? "" : 'aria-disabled="true"'}>
      <h3><span class="code">${esc(t.code)}</span>${esc(t.title)} ${open ? "" : "\u{1F512}"}</h3>
      <p>${esc(t.subtitle)} · ${done}/${t.lessons.length} done</p>
      ${bar(done, t.lessons.length)}
      <ul class="lessons">${t.lessons.map((l, i) => {
        const L = LESSON[l.id];
        const cls = lessonDone(l.id) ? "done" : lessonUnlocked(L) ? "" : "locked";
        return `<li class="${cls}"><a href="#lesson/${l.id}" ${cls === "locked" ? 'aria-disabled="true" tabindex="-1"' : ""}>
          <span class="n">${lessonDone(l.id) ? "✓" : i + 1}</span>
          <span class="t">${esc(l.title)}<small>${esc(l.read.join(" · "))}</small></span></a></li>`;
      }).join("")}</ul>
    </div>`;
  }

  function viewLesson(id) {
    const l = LESSON[id];
    if (!l) return `<p class="empty">Lesson not found. <a href="#path">Back to your path</a></p>`;
    if (!lessonUnlocked(l) && !lessonDone(id)) {
      return `<p class="crumbs"><a href="#path">Path</a> › ${esc(l.track.title)}</p>
        <h1 class="page">${esc(l.title)} \u{1F512}</h1>
        <p class="lede">Finish the lessons before this one to unlock it — or turn on “Unlock all lessons” in Me if you've already done this class at church.</p>
        <a class="btn primary" href="#path">Back to your path</a>`;
    }
    const st = S.lessons[id] || { answers: [], action: false };
    const memorized = !!(S.verses[l.verse.ref] && S.verses[l.verse.ref].memorized);
    const done = lessonDone(id);
    return `
      <p class="crumbs"><a href="#path">Path</a> › ${esc(l.track.title)} · Lesson ${l.index + 1}</p>
      <h1 class="page">${esc(l.title)}</h1>
      <p class="lede">${esc(l.track.code)} ${l.index + 1} · Work through each step. Your answers save automatically.</p>

      <div class="step"><span class="num">1</span><div>
        <h3>Pray</h3>
        <p style="margin:0" class="muted">“Holy Spirit, open my eyes to see what You want to show me today.” (Psalm 119:18)</p>
      </div></div>

      <div class="step"><span class="num">2</span><div>
        <h3>Read the passage</h3>
        <div class="passages">${l.read.map(p => `<a href="${bibleUrl(p)}" target="_blank" rel="noopener">\u{1F4D6} ${esc(p)}</a>`).join("")}</div>
      </div></div>

      <div class="step"><span class="num">3</span><div>
        <h3>Key truth</h3>
        <p class="truth">${esc(l.truth)}</p>
        <ul class="points">${l.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
      </div></div>

      <div class="step"><span class="num">4</span><div>
        <h3>Workbook</h3>
        ${l.questions.map((q, i) => `<div class="q"><label for="q${i}">${i + 1}. ${esc(q)}</label>
          <textarea id="q${i}" data-q="${i}" placeholder="Write your answer…">${esc(st.answers[i] || "")}</textarea></div>`).join("")}
        <div class="saved" id="saved" aria-live="polite"></div>
      </div></div>

      <div class="step"><span class="num">5</span><div>
        <h3>Memory verse</h3>
        <blockquote class="verse">${esc(l.verse.text)}<cite>${esc(l.verse.ref)} (KJV)</cite></blockquote>
        <label class="check" style="margin-top:10px"><input type="checkbox" data-act="memorize" ${memorized ? "checked" : ""}> I can say it from memory (+25 XP)</label>
      </div></div>

      <div class="step"><span class="num">6</span><div>
        <h3>Apply &amp; share</h3>
        <label class="check"><input type="checkbox" data-act="action" ${st.action ? "checked" : ""}> <span>${esc(l.action)}</span></label>
        <p class="muted" style="font-size:13.5px;margin:8px 0 0">Share one answer with your cell leader or consolidator this week.</p>
      </div></div>

      <div class="complete">
        ${done ? `<p style="margin:0 0 10px">\u{2705} Completed on ${esc(new Date(S.lessons[id].done).toLocaleDateString())}</p>`
          : `<p class="muted" style="margin:0 0 10px">Answer every question and commit to the action step to complete this lesson.</p>`}
        <div class="row" style="justify-content:center">
          ${done ? "" : `<button class="btn gold" data-act="complete">Complete lesson (+100 XP)</button>`}
          ${nextAfter(l) ? `<a class="btn" href="#lesson/${nextAfter(l).id}">Next lesson →</a>` : ""}
        </div>
      </div>`;
  }
  const nextAfter = l => LESSONS[LESSONS.findIndex(x => x.id === l.id) + 1] || null;

  function viewJournal(sub) {
    const tab = sub === "prayer" ? "prayer" : "soap";
    const head = `<h1 class="page">Journal</h1>
      <p class="lede">S.O.A.P. your daily reading, and keep a prayer list you can watch God answer.</p>
      <div class="seg" role="tablist">
        <button role="tab" aria-selected="${tab === "soap"}" data-go="#journal">S.O.A.P. notes</button>
        <button role="tab" aria-selected="${tab === "prayer"}" data-go="#journal/prayer">Prayer list</button>
      </div>`;
    if (tab === "prayer") {
      const cats = ["My life", "Family", "My three to win", "Cell & church", "Nation & leaders"];
      return head + `
        <section class="panel">
          <form id="fPrayer" class="row" style="flex-direction:row;align-items:flex-end">
            <div class="field" style="flex:2 1 220px"><label for="pText">Prayer request</label><input type="text" id="pText" maxlength="300" required placeholder="e.g. Salvation for my brother"></div>
            <div class="field" style="flex:1 1 140px"><label for="pCat">For</label><select id="pCat">${cats.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
            <button class="btn primary" type="submit">Add</button>
          </form>
        </section>
        <section class="panel">
          ${S.prayers.length ? S.prayers.map(p => `<div class="prayer ${p.answered ? "answered" : ""}">
              <input type="checkbox" data-pray="${p.id}" ${p.answered ? "checked" : ""} aria-label="Answered">
              <div class="txt">${esc(p.text)}<div class="muted" style="font-size:12px">${esc(p.cat || "")}${p.answered ? " · answered " + esc(new Date(p.answered).toLocaleDateString()) : ""}</div></div>
              <button class="btn ghost small danger" data-unpray="${p.id}" aria-label="Delete">✕</button></div>`).join("")
            : `<p class="empty">Add the people and needs you're praying for. Tick them when God answers.</p>`}
        </section>${credit()}`;
    }
    const ref = planFinished() ? "" : todayRef();
    return head + `
      <section class="panel" id="soapForm">
        <form id="fSoap">
          <div class="field"><label for="jRef">Passage</label><input type="text" id="jRef" value="${esc(ref)}" maxlength="80" required></div>
          <div class="field"><label for="jS"><span class="soap-letter">S</span>Scripture — write the verse that stood out</label><textarea id="jS" maxlength="2000"></textarea></div>
          <div class="field"><label for="jO"><span class="soap-letter">O</span>Observation — what does it say? What do you notice?</label><textarea id="jO" maxlength="4000"></textarea></div>
          <div class="field"><label for="jA"><span class="soap-letter">A</span>Application — what will you do differently today?</label><textarea id="jA" maxlength="4000"></textarea></div>
          <div class="field"><label for="jP"><span class="soap-letter">P</span>Prayer — talk to God about it</label><textarea id="jP" maxlength="4000"></textarea></div>
          <div class="row"><button class="btn primary" type="submit">Save entry (+15 XP)</button>${ref ? `<a class="btn ghost" href="${bibleUrl(ref)}" target="_blank" rel="noopener">Open ${esc(ref)}</a>` : ""}</div>
        </form>
      </section>
      <h2 class="sec">Past entries</h2>
      <section class="panel">
        ${S.journal.length ? S.journal.map(j => `<article class="entry">
            <div class="row between"><h4>${esc(j.ref)}</h4><span class="muted" style="font-size:12.5px">${esc(j.date)} <button class="btn ghost small danger" data-unsoap="${j.id}" aria-label="Delete entry">✕</button></span></div>
            ${j.s ? `<p class="serif"><span class="soap-letter">S</span>${esc(j.s)}</p>` : ""}
            ${j.o ? `<p><span class="soap-letter">O</span>${esc(j.o)}</p>` : ""}
            ${j.a ? `<p><span class="soap-letter">A</span>${esc(j.a)}</p>` : ""}
            ${j.p ? `<p><span class="soap-letter">P</span>${esc(j.p)}</p>` : ""}
          </article>`).join("") : `<p class="empty">Your S.O.A.P. notes will appear here.</p>`}
      </section>${credit()}`;
  }

  let card = { i: 0, mode: "ref", shown: false };
  function viewVerses() {
    const list = unlockedVerses();
    if (!list.length) return `<h1 class="page">Memory verses</h1><p class="empty">Start Life Class to unlock your first verse.</p>`;
    card.i = Math.min(card.i, list.length - 1);
    const v = list[card.i];
    const words = v.text.split(" ");
    const blanks = words.map((w, i) => (i % 3 === 1 ? `<span class="blank">${esc(w)}</span>` : esc(w))).join(" ");
    let face;
    if (!card.shown && card.mode === "ref") face = `<div class="ref">${esc(v.ref)}</div><div class="muted">Say it aloud, then tap to check</div>`;
    else if (!card.shown && card.mode === "blanks") face = `<div class="txt">${blanks}</div><div class="muted">${esc(v.ref)} · fill the blanks, then tap</div>`;
    else face = `<div class="txt">${esc(v.text)}</div><div class="ref" style="font-size:16px">${esc(v.ref)}</div>`;
    const mem = !!(S.verses[v.ref] && S.verses[v.ref].memorized);
    return `
      <h1 class="page">Memory verses</h1>
      <p class="lede">${versesMemorized()} of ${list.length} unlocked verses memorized. Hide God's Word in your heart (Psalm 119:11).</p>
      <div class="seg" role="tablist">
        <button role="tab" aria-selected="${card.mode === "ref"}" data-mode="ref">Reference → verse</button>
        <button role="tab" aria-selected="${card.mode === "blanks"}" data-mode="blanks">Fill the blanks</button>
      </div>
      <section class="panel flash" data-act="flip" role="button" tabindex="0" aria-label="Flip card">${face}</section>
      <div class="row between" style="margin-top:12px">
        <button class="btn" data-act="prev" ${card.i === 0 ? "disabled" : ""}>← Prev</button>
        <label class="check"><input type="checkbox" data-act="memorize-card" ${mem ? "checked" : ""}> Memorized</label>
        <button class="btn" data-act="nextcard" ${card.i >= list.length - 1 ? "disabled" : ""}>Next →</button>
      </div>
      <h2 class="sec">All unlocked verses</h2>
      <section class="panel"><ul class="verse-list">${list.map((x, i) => `<li>
          <div class="t"><b>${esc(x.ref)}</b><div class="muted" style="font-size:12.5px">${esc(x.lesson.track.code)} · ${esc(x.lesson.title)}</div></div>
          ${S.verses[x.ref] && S.verses[x.ref].memorized ? `<span class="pill ok">Memorized</span>` : `<span class="pill">Learning</span>`}
          <button class="btn small" data-card="${i}">Practise</button></li>`).join("")}</ul></section>
      ${credit()}`;
  }

  function viewMe(sub) {
    const r = rankInfo();
    const rm = S.settings.reminders;
    const pushOk = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.navigator.standalone;
    const dayChecks = DAY_NAMES.map((d, i) => `<label class="check" style="font-weight:500"><input type="checkbox" data-day="${i}" ${!rm.daily.days.length || rm.daily.days.includes(i) ? "checked" : ""}>${d.slice(0, 3)}</label>`).join("");
    setTimeout(() => { if (sub === "reminders") { const el = $("#reminders"); if (el) el.scrollIntoView({ behavior: "smooth" }); } }, 0);
    return `
      <h1 class="page">${esc(me.name || "My profile")}</h1>
      <p class="lede">${esc(me.email)}</p>

      <section class="panel">
        <div class="rank-hero">
          <div class="medal" style="background:${r.at.color}">${r.at.level}</div>
          <div style="flex:1;min-width:0"><h3>Level ${r.at.level} · ${esc(r.at.rank)} ${r.complete ? "✓" : ""}</h3>
          <p>${xp()} XP · best streak ${plural(bestStreak(), "day")} · ${plural(readCount(), "chapter")} read</p>${bar(r.done, r.total)}</div>
        </div>
        <div class="row" style="margin-top:12px">${C.LEVELS.filter(lv => levelDone(lv.level)).map(lv => `<a class="btn small" href="#cert/${lv.level}">\u{1F4DC} Level ${lv.level} certificate</a>`).join("") || `<span class="muted" style="font-size:13.5px">Finish a level to earn your first certificate.</span>`}</div>
      </section>

      <h2 class="sec">Achievements</h2>
      <section class="panel"><div class="badges">${BADGES.map(b => {
        const got = b.test();
        return `<div class="badge ${got ? "earned" : ""}" title="${esc(b.hint)}"><span class="ic">${b.ic}</span><b>${esc(b.name)}</b><span class="muted">${esc(got ? "Earned" : b.hint)}</span></div>`;
      }).join("")}</div></section>

      <h2 class="sec" id="reminders">Reminders</h2>
      <section class="panel">
        <div class="row between">
          <div><b>Notifications on this device</b><div class="muted" style="font-size:13px" id="pushStatus">${perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked — allow notifications in your browser settings" : pushOk ? "Not set up yet" : "Not supported in this browser"}</div></div>
          <div class="row">${pushOk && perm !== "denied" ? `<button class="btn primary small" data-act="push-on">Turn on</button>` : ""}${perm === "granted" ? `<button class="btn small" data-act="push-test">Send test</button>` : ""}</div>
        </div>
        ${ios ? `<p class="banner" style="margin:12px 0 0">On iPhone/iPad: tap Share → <b>Add to Home Screen</b>, open the app from there, then turn on notifications.</p>` : ""}
        <div class="switch" style="margin-top:8px"><div><span>Daily study reminder</span><small>Today's chapter and next lesson</small></div><input type="checkbox" data-set="daily.on" ${rm.daily.on ? "checked" : ""}></div>
        <div class="row" style="margin-bottom:8px"><input type="time" data-set="daily.time" value="${esc(rm.daily.time)}" style="max-width:140px" aria-label="Daily reminder time"></div>
        <div class="row" style="gap:12px;margin-bottom:6px">${dayChecks}</div>
        <div class="switch"><div><span>Cell group reminder</span><small>On the day your cell meets</small></div><input type="checkbox" data-set="cell.on" ${rm.cell.on ? "checked" : ""}></div>
        <div class="grid2" style="margin-bottom:8px">
          <div class="field"><label>Day</label><select data-set="cell.day">${DAY_NAMES.map((d, i) => `<option value="${i}" ${Number(rm.cell.day) === i ? "selected" : ""}>${d}</option>`).join("")}</select></div>
          <div class="field"><label>Reminder time</label><input type="time" data-set="cell.time" value="${esc(rm.cell.time)}"></div>
        </div>
        <div class="field"><label>Note (place, what to bring)</label><input type="text" data-set="cell.note" maxlength="120" value="${esc(rm.cell.note)}" placeholder="e.g. 7:30pm at Kuya Mark's house"></div>
        <div class="switch" style="margin-top:8px"><div><span>Evening verse review</span><small>Practise your next memory verse</small></div><input type="checkbox" data-set="verse.on" ${rm.verse.on ? "checked" : ""}></div>
        <div class="row"><input type="time" data-set="verse.time" value="${esc(rm.verse.time)}" style="max-width:140px" aria-label="Verse review time"></div>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Times use your device's time zone (${esc(S.settings.tz)}).</p>
      </section>

      <h2 class="sec">Study settings</h2>
      <section class="panel">
        <div class="field"><label for="setPlan">Reading plan</label><select id="setPlan">${C.PLANS.map(p => `<option value="${p.id}" ${p.id === S.reading.plan ? "selected" : ""}>${esc(p.title)} (${p.days.length} days)</option>`).join("")}</select>
          <span class="hint">${esc(plan().blurb)} Changing plans starts the new plan at day 1.</span></div>
        <div class="field" style="margin-top:12px"><label for="setVer">Bible version for reading links</label><select id="setVer">${C.VERSIONS.map(([k, n]) => `<option value="${k}" ${k === S.settings.version ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
        <div class="field" style="margin-top:12px"><label for="setTheme">Appearance</label><select id="setTheme">
          ${[["system", "Match my device"], ["light", "Light"], ["dark", "Dark"]].map(([k, n]) => `<option value="${k}" ${(document.documentElement.dataset.theme || "system") === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div class="switch" style="margin-top:8px"><div><span>Unlock all lessons</span><small>For members who already finished classes at church</small></div><input type="checkbox" id="setUnlock" ${S.settings.unlockAll ? "checked" : ""}></div>
      </section>

      ${cellSection()}

      <h2 class="sec">Account</h2>
      <section class="panel row">
        <button class="btn" data-act="export">Download my data</button>
        <button class="btn danger" data-act="signout">Sign out</button>
      </section>

      <h2 class="sec">About</h2>
      <section class="panel">
        <p style="margin:0 0 8px">The Kam Team Bible Study Guide follows the G12 Ladder of Success — <b>Win, Consolidate, Disciple, Send</b> — through Life Class, Pre-Encounter, Encounter, Post-Encounter, School of Leaders 1–3, Re-Encounter and the Send practicum.</p>
        <p class="muted" style="margin:0;font-size:13.5px">Memory verses: King James Version (public domain). Reading links open BibleGateway in your chosen version.</p>
      </section>
      ${credit()}`;
  }

  /* ---------------- Cell leaders ---------------- */
  // ROLE comes from the server (null until loaded, or when the backend has no leaders).
  // L holds the Leader tab's state: two-step setup, then the dashboard.
  let ROLE = null;
  const L = { status: "idle" };
  const isLeader = () => !!(ROLE && ROLE.role);
  const ago = t => {
    if (!t) return "never";
    const d = Math.floor((Date.now() - t) / 864e5);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };
  // Highest level whose tracks are all done, from a list of finished lesson ids.
  function levelOf(doneIds) {
    const done = new Set(doneIds || []);
    let n = 0;
    for (const lv of C.LEVELS) {
      if (levelTracks(lv.level).every(t => t.lessons.every(l => done.has(l.id)))) n = lv.level; else break;
    }
    return C.LEVELS[Math.min(n, C.LEVELS.length - 1)];
  }

  async function loadRole() {
    if (!KBS.leaders) return;
    try { ROLE = await KBS.myRole(); } catch { return; }
    $("#leaderTab").classList.toggle("hidden", !isLeader());
    const tab = location.hash.replace(/^#/, "").split("/")[0];
    if (tab === "me" || tab === "leader") render();
  }

  async function loadLeader() {
    L.status = "loading"; L.error = "";
    try {
      const t = await KBS.twoStep();
      if (!t.factorId) { L.status = "setup"; return; }
      if (t.level !== "aal2") { L.status = "verify"; L.factorId = t.factorId; return; }
      ROLE = await KBS.myRole();
      if (!isLeader()) { L.status = "none"; return; }
      L.members = await KBS.members();
      L.team = ROLE.role === "admin" ? await KBS.team() : null;
      L.status = "ready";
    } catch { L.status = "error"; }
    finally { if (location.hash.startsWith("#leader")) render(); }
  }

  function viewLeader() {
    if (!KBS.leaders) return `<p class="empty">The leader dashboard needs the Supabase version of the app.</p>`;
    if (ROLE && !isLeader()) return `<p class="empty">This page is for cell leaders. Ask your church admin if you lead a cell.</p>`;
    if (L.status === "idle") { setTimeout(loadLeader, 0); L.status = "loading"; }
    const head = `<h1 class="page">Leader</h1>`;
    if (L.status === "loading") return head + `<p class="empty">Loading…</p>`;
    if (L.status === "error") return head + `<p class="empty">Couldn't load the dashboard. Check your connection. <button class="btn small" data-act="leader-reload">Try again</button></p>`;
    if (L.status === "none") return head + `<p class="empty">This page is for cell leaders. Ask your church admin if you lead a cell.</p>`;

    if (L.status === "setup") return head + `
      <p class="lede">Leaders can see their members' progress, so the dashboard is protected with two-step sign-in.</p>
      <section class="panel">
        <h3 style="margin-top:0">Set up two-step sign-in</h3>
        <ol style="margin:0 0 12px;padding-left:20px;line-height:1.6">
          <li>Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or Authy.</li>
          <li>Tap <b>Start</b>, then scan the QR code with the app.</li>
          <li>Type the 6-digit code it shows.</li>
        </ol>
        <p class="muted" style="font-size:13px;margin:0 0 12px">From then on, signing in asks for your password and the code from the app.</p>
        <button class="btn primary" data-act="mfa-start">Start</button>
      </section>`;

    if (L.status === "enroll" || L.status === "verify") {
      const enrolling = L.status === "enroll";
      return head + `
      <section class="panel">
        <h3 style="margin-top:0">${enrolling ? "Scan this code" : "Enter your code"}</h3>
        ${enrolling ? `<p class="muted" style="margin:0">In your authenticator app, tap <b>+</b> and scan:</p>
          <img class="qr" src="${esc(L.qr)}" alt="QR code for your authenticator app">
          <p class="muted" style="font-size:13px;margin:0 0 6px">Can't scan? Enter this key in the app instead:</p>
          <div class="secret">${esc(L.secret)}</div>` : `<p class="muted" style="margin:0">Open your authenticator app and type the 6-digit code for Kam Team.</p>`}
        <form id="fMfa" style="margin-top:14px">
          <div class="field"><label for="mfaCode">6-digit code</label><input id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></div>
          ${L.error ? `<p class="err" role="alert">${esc(L.error)}</p>` : ""}
          <button class="btn primary" type="submit" style="margin-top:10px">${enrolling ? "Turn on two-step sign-in" : "Verify"}</button>
        </form>
      </section>`;
    }

    const ms = L.members || [];
    const week = Date.now() - 7 * 864e5;
    const active = ms.filter(m => m.updated && m.updated >= week).length;
    const quiet = ms.length - active;
    const members = ms.map(m => {
      const lv = levelOf(m.done);
      const q = !m.updated || m.updated < week;
      return `<li>
        <div class="medal" style="background:${lv.color};width:30px;height:30px;font-size:14px">${lv.level}</div>
        <div class="t"><b>${esc(m.name || m.email)}</b>
          <div class="muted" style="font-size:12.5px">${esc(lv.rank)} · ${plural(m.done.length, "lesson")} · ${plural(m.read, "chapter")} · streak ${m.streak}</div>
          <div class="muted" style="font-size:12.5px">Last active ${ago(m.updated)}</div></div>
        ${q ? `<span class="pill warn">Quiet</span>` : `<span class="pill ok">Active</span>`}
        <button class="btn small" data-member="${esc(m.id)}" data-name="${esc(m.name || m.email)}" aria-label="Remove ${esc(m.name || m.email)}">Remove</button>
      </li>`;
    }).join("");

    const team = L.team ? `
      <h2 class="sec">Leaders &amp; admins</h2>
      <section class="panel">
        <ul class="mlist">${L.team.map(p => `<li>
          <div class="t"><b>${esc(p.name || p.email)}</b><div class="muted" style="font-size:12.5px">${esc(p.email)} · ${plural(p.members, "member")}</div></div>
          <span class="pill">${p.role === "admin" ? "Admin" : "Leader"}</span>
          ${p.twoStep ? `<span class="pill ok">Two-step on</span>` : `<span class="pill warn">No two-step</span>`}
          ${p.self ? "" : `<button class="btn small" data-unrole="${esc(p.email)}">Remove</button>`}</li>`).join("")}</ul>
        <form id="fRole" class="grid2" style="margin-top:12px;align-items:end">
          <div class="field"><label for="roleEmail">Member's email</label><input id="roleEmail" type="email" required placeholder="They need an account first"></div>
          <div class="field"><label for="roleWhich">Role</label><select id="roleWhich"><option value="leader">Cell leader</option><option value="admin">Admin</option></select></div>
          <button class="btn primary" type="submit">Save role</button>
        </form>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">New leaders set up two-step sign-in the first time they open the Leader tab.</p>
      </section>` : "";

    return head + `
      <p class="lede">Consolidation made visible: see who is growing and who needs a call.</p>
      <section class="panel" style="text-align:center">
        <div class="muted" style="font-size:13px">Your cell code</div>
        <div class="cellcode">${esc(ROLE.code || "—")}</div>
        <p class="muted" style="font-size:13px;margin:4px 0 0">Members enter it under <b>Me → My cell leader</b> to join your cell.</p>
      </section>
      <div class="stats">
        <div class="stat"><b>${ms.length}</b><span>members</span></div>
        <div class="stat"><b>${active}</b><span>active this week</span></div>
        <div class="stat"><b>${quiet}</b><span>quiet 7+ days</span></div>
      </div>
      <h2 class="sec">My cell</h2>
      <section class="panel">${ms.length ? `<ul class="mlist">${members}</ul>` : `<p class="empty">No members yet. Share your cell code with them.</p>`}</section>
      <p class="muted" style="font-size:12.5px">Leaders see levels, lessons finished, reading and last activity — not members' answers, journal or prayers.</p>
      ${team}
      ${credit()}`;
  }

  function cellSection() {
    if (!KBS.leaders || !ROLE) return "";
    const body = ROLE.leader
      ? `<div class="row between"><div><b>${esc(ROLE.leader.name)}</b><div class="muted" style="font-size:13px">Your cell leader can see your level, lessons finished and last activity.</div></div>
          <button class="btn small" data-act="leave-leader">Leave</button></div>`
      : `<form id="fJoin" class="row" style="align-items:end">
          <div class="field" style="flex:1"><label for="joinCode">Cell code from your leader</label><input id="joinCode" maxlength="12" autocomplete="off" style="text-transform:uppercase" required></div>
          <button class="btn primary" type="submit">Join</button></form>
         <p class="muted" style="font-size:12.5px;margin:8px 0 0">Your leader will see your level, lessons finished and last activity — not your answers, journal or prayers.</p>`;
    return `<h2 class="sec">My cell leader</h2><section class="panel">${body}</section>`;
  }

  async function leaderAction(fn, ok) {
    try { await fn(); if (ok) toast(ok); } catch { toast("Couldn't save. Check your connection."); }
  }

  function viewCert(n) {
    const lv = C.LEVELS[n - 1];
    if (!lv || !levelDone(n)) return `<p class="empty">Finish Level ${esc(n)} to unlock this certificate. <a href="#path">See your path</a></p>`;
    const when = Math.max(...levelTracks(n).flatMap(t => t.lessons.map(l => S.lessons[l.id].done)));
    return `
      <div class="row between noprint" style="margin-bottom:12px"><a class="btn" href="#me">← Back</a><button class="btn primary" data-act="print">Print / save PDF</button></div>
      <div class="cert">
        <svg class="mark" style="width:26px;height:38px;color:#1B1A17" aria-hidden="true"><use href="#kam"/></svg>
        <small style="letter-spacing:.16em;font-weight:700;margin-top:6px">KAM TEAM BIBLE STUDY GUIDE</small>
        <h2>Certificate of Completion</h2>
        <small>This certifies that</small>
        <div class="who">${esc(me.name || me.email)}</div>
        <p style="margin:6px 0">has completed the <b>${esc(lv.stage)}</b> stage and reached</p>
        <p style="font-family:var(--serif);font-size:22px;margin:4px 0 6px;color:${lv.color}"><b>Level ${lv.level} · ${esc(lv.rank)}</b></p>
        <p style="margin:0 0 14px">${levelTracks(n).map(t => esc(t.title)).join(" · ")}</p>
        <small>Completed ${esc(new Date(when).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))}</small>
        <p style="font-family:var(--serif);font-style:italic;margin:16px 0 18px">“Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ.” — Philippians 1:6</p>
        <small><b style="color:#1B1A17">Kam Team Publishing</b> · Powered by <b style="color:#1B1A17">Arty Incognito</b> &amp; <b style="color:#1B1A17">Sandrhiks Builder</b></small>
      </div>`;
  }

  const credit = () => `<p class="credit" style="margin-top:28px"><b>Kam Team Publishing</b><br>Powered by <b>Arty Incognito</b> &amp; <b>Sandrhiks Builder</b></p>`;

  /* ---------------- Router ---------------- */
  function render() {
    const [tab, arg] = (location.hash.replace(/^#/, "") || "today").split("/");
    const views = {
      today: viewToday, path: viewPath, lesson: () => viewLesson(arg), journal: () => viewJournal(arg),
      verses: viewVerses, me: () => viewMe(arg), cert: () => viewCert(Number(arg)), leader: viewLeader,
    };
    view.innerHTML = (views[tab] || viewToday)();
    const active = tab === "lesson" || tab === "cert" ? (tab === "cert" ? "me" : "path") : (views[tab] ? tab : "today");
    document.querySelectorAll(".tabbar a").forEach(a => { if (a.dataset.tab === active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    renderChip();
    if (tab === "journal" && arg === "new") { const el = $("#jS"); if (el) el.focus(); }
  }
  window.addEventListener("hashchange", () => {
    // Fresh numbers each time a leader opens the dashboard.
    if (location.hash.startsWith("#leader") && L.status === "ready") L.status = "idle";
    render(); window.scrollTo(0, 0);
  });

  /* ---------------- Actions ---------------- */
  function celebrate(before) {
    const after = earnedLevels();
    if (after > before) {
      const lv = C.LEVELS[after - 1];
      const up = C.LEVELS[after];
      toast(up ? `\u{1F389} Level ${lv.level} · ${lv.rank} complete! On to Level ${up.level}: ${up.rank}` : "\u{1F3C6} You've completed the whole ladder!", 5000);
      setTimeout(() => { location.hash = `#cert/${lv.level}`; }, 1200);
    }
  }

  view.addEventListener("click", e => {
    const t = e.target.closest("[data-act],[data-go],[data-mode],[data-card],[data-unpray],[data-unsoap],[data-member],[data-unrole]");
    if (!t) return;
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.mode) { card.mode = t.dataset.mode; card.shown = false; render(); return; }
    if (t.dataset.card) { card.i = Number(t.dataset.card); card.shown = false; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (t.dataset.unpray) { if (confirm("Delete this prayer request?")) { S.prayers = S.prayers.filter(p => p.id !== t.dataset.unpray); save(); render(); } return; }
    if (t.dataset.member) {
      if (confirm(`Remove ${t.dataset.name} from your cell? They can join again with your code.`)) {
        leaderAction(() => KBS.removeMember(t.dataset.member), "Removed from your cell").then(loadLeader);
      }
      return;
    }
    if (t.dataset.unrole) {
      if (confirm(`Remove the leader/admin role from ${t.dataset.unrole}? Their members leave the cell and can join another.`)) {
        KBS.setRole(t.dataset.unrole, null).then(r => { toast(r.ok ? "Role removed" : r.error); loadLeader(); });
      }
      return;
    }
    if (t.dataset.unsoap) { if (confirm("Delete this journal entry?")) { S.journal = S.journal.filter(j => j.id !== t.dataset.unsoap); save(); render(); } return; }

    const act = t.dataset.act;
    const [tab, arg] = location.hash.replace(/^#/, "").split("/");
    if (act === "read") {
      if (planFinished()) return;
      S.reading.done[S.reading.day] = dateKey();
      S.reading.day++;
      logToday("read"); save(); render();
      toast(planFinished() ? `\u{1F389} Plan complete: ${plan().title}!` : "+10 XP · Well done! Write a S.O.A.P. note to go deeper.");
    } else if (act === "complete" && tab === "lesson") {
      const l = LESSON[arg], st = S.lessons[arg] || { answers: [] };
      const missing = l.questions.findIndex((_, i) => !String(st.answers[i] || "").trim());
      if (missing >= 0) { toast(`Answer question ${missing + 1} first`); const el = $("#q" + missing); if (el) el.focus(); return; }
      if (!st.action) { toast("Commit to the action step first"); return; }
      const before = earnedLevels();
      st.done = Date.now(); S.lessons[arg] = st;
      logToday("lesson"); save(); render();
      toast(trackDone(l.track) ? `\u{1F393} ${l.track.title} complete!` : "+100 XP · Lesson complete!");
      celebrate(before);
    } else if (act === "flip") {
      card.shown = !card.shown; render();
    } else if (act === "prev") { card.i--; card.shown = false; render(); }
    else if (act === "nextcard") { card.i++; card.shown = false; render(); }
    else if (act === "push-on") enablePush();
    else if (act === "push-test") testPush();
    else if (act === "export") exportData();
    else if (act === "signout") signOut();
    else if (act === "print") window.print();
    else if (act === "leader-reload") { L.status = "idle"; render(); }
    else if (act === "mfa-start") {
      t.disabled = true;
      KBS.twoStepEnroll().then(r => {
        if (!r.ok) { toast(r.error, 4000); t.disabled = false; return; }
        Object.assign(L, { status: "enroll", factorId: r.factorId, qr: r.qr, secret: r.secret, error: "" }); render();
      });
    } else if (act === "leave-leader") {
      if (confirm("Leave your cell? You can join again with a cell code.")) leaderAction(() => KBS.leaveLeader(), "You left the cell").then(loadRole);
    }
  });

  view.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-act=flip]")) { e.preventDefault(); card.shown = !card.shown; render(); }
  });

  let answerTimer;
  view.addEventListener("input", e => {
    const t = e.target;
    const [tab, arg] = location.hash.replace(/^#/, "").split("/");
    if (t.dataset.q !== undefined && tab === "lesson") {
      const st = S.lessons[arg] = S.lessons[arg] || { answers: [], action: false };
      st.answers[Number(t.dataset.q)] = t.value.slice(0, 4000);
      $("#saved").textContent = "Saving…";
      clearTimeout(answerTimer);
      answerTimer = setTimeout(() => { save(); const s = $("#saved"); if (s) s.textContent = "✓ Saved"; }, 600);
    } else if (t.dataset.set && t.type !== "checkbox") {
      setReminder(t.dataset.set, t.dataset.set === "cell.day" ? Number(t.value) : t.value);
    }
  });

  view.addEventListener("change", e => {
    const t = e.target;
    const [tab, arg] = location.hash.replace(/^#/, "").split("/");
    if (t.dataset.act === "action" && tab === "lesson") {
      const st = S.lessons[arg] = S.lessons[arg] || { answers: [], action: false };
      st.action = t.checked; save();
    } else if (t.dataset.act === "memorize" || t.dataset.act === "memorize-card") {
      const ref = t.dataset.act === "memorize" ? LESSON[arg].verse.ref : unlockedVerses()[card.i].ref;
      S.verses[ref] = t.checked ? { memorized: Date.now() } : { memorized: 0 };
      if (t.checked) { logToday("verse"); toast("+25 XP · Hidden in your heart!"); }
      save(); renderChip();
      if (t.dataset.act === "memorize-card") render();
    } else if (t.dataset.pray) {
      const p = S.prayers.find(x => x.id === t.dataset.pray);
      if (p) { p.answered = t.checked ? Date.now() : 0; if (t.checked) toast("\u{1F64C} Praise God!"); save(); render(); }
    } else if (t.dataset.set && t.type === "checkbox") {
      setReminder(t.dataset.set, t.checked);
    } else if (t.dataset.day !== undefined) {
      const days = [...view.querySelectorAll("[data-day]")].filter(x => x.checked).map(x => Number(x.dataset.day));
      S.settings.reminders.daily.days = days.length === 7 ? [] : days; save();
    } else if (t.id === "setPlan") {
      if (t.value !== S.reading.plan) { S.reading = { plan: t.value, day: 0, done: {} }; save(); render(); toast("New reading plan started"); }
    } else if (t.id === "setVer") { S.settings.version = t.value; save(); }
    else if (t.id === "setTheme") {
      if (t.value === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t.value;
      try { if (t.value === "system") localStorage.removeItem("kbs.theme"); else localStorage.setItem("kbs.theme", t.value); } catch { /* ignore */ }
    } else if (t.id === "setUnlock") { S.settings.unlockAll = t.checked; save(); }
  });

  view.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id === "fSoap") {
      const v = id => $(id).value.trim();
      if (!v("#jRef") || !(v("#jS") || v("#jO") || v("#jA") || v("#jP"))) { toast("Write at least one part of your S.O.A.P. note"); return; }
      S.journal.unshift({ id: uid(), date: dateKey(), ref: v("#jRef"), s: v("#jS"), o: v("#jO"), a: v("#jA"), p: v("#jP") });
      logToday("journal"); save(); render(); toast("+15 XP · Journal saved");
    } else if (e.target.id === "fPrayer") {
      const text = $("#pText").value.trim();
      if (!text) return;
      S.prayers.unshift({ id: uid(), text, cat: $("#pCat").value, created: Date.now(), answered: 0 });
      save(); render();
    } else if (e.target.id === "fMfa") {
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      KBS.twoStepVerify(L.factorId, $("#mfaCode").value).then(r => {
        if (!r.ok) { L.error = r.error; render(); return; }
        toast("\u{1F512} Two-step sign-in is on"); loadLeader();
      }).catch(() => { L.error = "Couldn't reach the server. Check your connection."; render(); });
    } else if (e.target.id === "fJoin") {
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      KBS.joinLeader($("#joinCode").value).then(r => {
        if (!r.ok) { toast(r.error, 3500); btn.disabled = false; return; }
        toast(`Joined ${r.leader.name}'s cell`); loadRole();
      }).catch(() => { toast("Couldn't reach the server. Check your connection."); btn.disabled = false; });
    } else if (e.target.id === "fRole") {
      KBS.setRole($("#roleEmail").value.trim(), $("#roleWhich").value).then(r => {
        toast(r.ok ? "Role saved" : r.error, 3500); if (r.ok) loadLeader();
      });
    }
  });

  function setReminder(path, value) {
    const [k, f] = path.split(".");
    S.settings.reminders[k][f] = value;
    save();
    scheduleLocal();
  }

  /* ---------------- Notifications ---------------- */
  // Server push is the main channel (works with the app closed). When a device
  // can't subscribe, we fall back to a local notification while the app is open.
  let swReg = null;
  async function registerSW() {
    if (!("serviceWorker" in navigator)) return null;
    try { swReg = await navigator.serviceWorker.register("sw.js"); } catch { swReg = null; }
    return swReg;
  }

  function keyBytes(b64) {
    const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }

  async function enablePush() {
    if (!("Notification" in window)) return toast("This browser can't show notifications");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { render(); return toast("Notifications are off. You can allow them in browser settings."); }
    const reg = swReg || await navigator.serviceWorker.ready;
    try {
      const publicKey = await KBS.pushKey();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      if (!(await KBS.subscribe(sub.toJSON()))) throw new Error("subscribe failed");
      if (!S.settings.reminders.daily.on) { S.settings.reminders.daily.on = true; }
      save(); render(); toast("\u{2705} Reminders are on for this device");
    } catch {
      render(); toast("Couldn't set up push here — you'll get reminders while the app is open.");
      scheduleLocal();
    }
  }

  async function testPush() {
    const r = await KBS.testPush().catch(() => ({ ok: false }));
    if (r.ok) return toast("Test sent — it should arrive in a few seconds");
    if (Notification.permission === "granted" && swReg) {
      swReg.showNotification("Reminders are on \u{2705}", { body: "This is how your Bible study reminders will look.", icon: "icon.svg", tag: "test" });
      return;
    }
    toast(r.error || "Couldn't send a test notification");
  }

  let localTimer;
  async function scheduleLocal() {
    clearTimeout(localTimer);
    if (!("Notification" in window) || Notification.permission !== "granted" || !swReg) return;
    const sub = swReg.pushManager ? await swReg.pushManager.getSubscription().catch(() => null) : null;
    if (sub) return; // the server sends these
    const d = S.settings.reminders.daily;
    if (!d.on) return;
    const [h, m] = d.time.split(":").map(Number);
    const at = new Date(); at.setHours(h, m, 0, 0);
    if (at <= new Date()) at.setDate(at.getDate() + 1);
    localTimer = setTimeout(() => {
      if (!(S.log[dateKey()] && S.log[dateKey()].read)) {
        swReg.showNotification("Time with God \u{1F64F}", { body: `Today's reading: ${todayRef()}.`, icon: "icon.svg", tag: "daily", data: { url: "#today" } });
      }
      scheduleLocal();
    }, at - new Date());
  }

  /* ---------------- Account ---------------- */
  function exportData() {
    const blob = new Blob([JSON.stringify({ account: me, exported: new Date().toISOString(), progress: S }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `bible-study-${dateKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function signOut() {
    clearTimeout(syncTimer);
    try { await sync(); } catch { /* best effort */ }
    // Stop this device's reminders so the next person here doesn't get them.
    try {
      const sub = swReg && await swReg.pushManager.getSubscription();
      if (sub) {
        await KBS.unsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch { /* ignore */ }
    try { localStorage.removeItem(storeKey()); } catch { /* ignore */ }
    await KBS.logout().catch(() => {});
    location.replace(KBS.loginUrl);
  }

  /* ---------------- Start ---------------- */
  async function start() {
    try {
      me = await KBS.me();
      if (!me) return location.replace(KBS.loginUrl);
      try { localStorage.setItem("kbs.me", JSON.stringify({ email: me.email, name: me.name })); } catch { /* ignore */ }
    } catch {
      // Offline: reuse the last signed-in member on this device, if any.
      try { me = JSON.parse(localStorage.getItem("kbs.me")); } catch { me = null; }
      if (!me) { view.innerHTML = `<p class="empty">You're offline. Connect to the internet to sign in.</p>`; return; }
    }

    S = normalize(loadLocal());
    render();
    registerSW().then(scheduleLocal);
    loadRole();

    try {
      const j = await KBS.getProgress();
      if (!j) return location.replace(KBS.loginUrl);
      if (j.data && j.updated > S.updated) { S = normalize(j.data); writeLocal(); render(); }
      else if (S.updated > (j.updated || 0)) sync();
      else if (!j.data) save();
    } catch { /* offline */ }
  }
  start();
})();
