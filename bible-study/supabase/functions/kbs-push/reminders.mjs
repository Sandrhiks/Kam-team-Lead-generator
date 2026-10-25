// Copy of bible-study/lib/reminders.js as an ES module for the kbs-push Edge
// Function. Keep the two in step: bible-study/test/supabase.test.js checks they agree.

// Works out which reminders a member is due right now, from the settings and
// progress their app saved. Pure functions, so the scheduler stays simple and
// testable: the server calls dueReminders() once a minute for every member
// with a push subscription.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Local date ("2026-10-22"), time ("06:30") and weekday (0-6) in a time zone.
function localParts(now, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
    }).formatToParts(now);
  } catch {
    return localParts(now, "UTC");
  }
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: DAYS.indexOf(p.weekday) };
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}

const validTime = t => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

// Returns [{ key, title, body, url }] for reminders due this minute.
// `key` is unique per reminder per day, so the caller can skip repeats.
function dueReminders(data, now = new Date()) {
  const settings = (data && data.settings) || {};
  const r = settings.reminders || {};
  const { date, time, weekday } = localParts(now, settings.tz);
  const log = (data && data.log) || {};
  const next = (data && data.next) || {};
  const out = [];

  const daily = r.daily || {};
  if (daily.on && validTime(daily.time) && daily.time === time &&
      (!Array.isArray(daily.days) || !daily.days.length || daily.days.includes(weekday))) {
    const today = log[date] || {};
    if (!today.read) {
      const days = Object.keys(log).filter(d => d < date).sort();
      const last = days[days.length - 1];
      const away = last ? daysBetween(last, date) : 0;
      const streak = Number(data && data.streak) || 0;
      let title = "Time with God \u{1F64F}";
      let body = next.reading ? `Today's reading: ${next.reading}.` : "Open your Bible and today's workbook page.";
      if (next.lesson) body += ` Next lesson: ${next.lesson}.`;
      if (away >= 3) { title = "We saved your seat \u{1F4D6}"; body = `It's been ${away} days. Pick up where you left off — ${next.reading || "one chapter"} is enough for today.`; }
      else if (streak >= 2) title = `Keep your ${streak}-day streak going \u{1F525}`;
      out.push({ key: `daily:${date}`, title, body, url: "/#today" });
    }
  }

  const cell = r.cell || {};
  if (cell.on && validTime(cell.time) && cell.time === time && Number(cell.day) === weekday) {
    out.push({
      key: `cell:${date}`,
      title: "Cell group today \u{1F91D}",
      body: cell.note ? String(cell.note).slice(0, 120) : "Bring your workbook and a friend. See you there!",
      url: "/#today",
    });
  }

  const verse = r.verse || {};
  if (verse.on && validTime(verse.time) && verse.time === time && next.verse) {
    out.push({ key: `verse:${date}`, title: "Memory verse review \u{2728}", body: `Can you say ${next.verse} from memory?`, url: "/#verses" });
  }
  return out;
}

export { dueReminders, localParts, daysBetween };
