"use strict";

// AI chat support, powered by Claude. The browser sends the conversation; the
// server adds the support instructions and streams the reply back as
// server-sent events: `data: {"t":"text"}` chunks, then `data: {"done":true}`.

const Anthropic = require("@anthropic-ai/sdk");

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;

const SYSTEM_PROMPT = `You are Kam, the in-app support assistant for the Kam Team Lead Generator, a web app real estate agents use to find, track and work property leads. You're talking with a signed-in agent. Help them use the app, fix setup problems, and work their leads well.

How the app works:
- Sign-in: everyone signs in with email and password. Accounts and leads are saved on the team's server, so leads follow the agent to any device they sign in on. The top bar shows their name; clicking it signs them out.
- Map: a satellite map (Leaflet, or Google Maps if a Google key is set in Settings). Pins are colored by lead type and cluster when zoomed out. "Drop pin" adds a lead by clicking a rooftop ("driving for dollars"). The search box flies to an address. State and county boundaries can be toggled with "Boundaries".
- Lead types: Seller, Buyer, Referral partner, Probate, Inherited / Will, Pre-foreclosure, Expired listing, For sale by owner, Absentee owner.
- Pipeline statuses: New, Contacted, Appointment, Under contract, Closed, Not interested.
- Lead score (0-100): starts from the lead type, then adds points for equity, having a phone or email, being recent (under 7 or 30 days), and the Appointment or Contacted status. Closed and Not interested leads are capped at 20; Do Not Call leads without consent lose points. "Hot" means 70+.
- Lead panel: click a lead to open it. Call, Text and Email buttons open the phone or email app and log the contact. "Log contact" records a call, text, email, meeting or note with an outcome (Connected, Left voicemail, No answer, Wrong number, Not interested, Appointment set). Texting needs a phone number and consent.
- History: the History button in the top bar lists every contact and change across all leads, newest first, with filters (calls, texts, emails, meetings, notes, status changes, GHL) and a date range. Clicking an entry opens that lead. "Export CSV" downloads the history.
- Find leads: searches Google listings (needs a Google Maps key), OpenStreetMap businesses, Instagram hashtags or business accounts (needs an Instagram token), and opens LinkedIn searches.
- Import/export: "Import CSV" in the left sidebar (download "CSV template" first for the right columns), "Export CSV", and "Download backup" / "Restore backup" (JSON).
- Filters: search, lead type, state, county, pipeline status, "Hot leads only", "Has phone or email", "Not yet sent to GHL". "Reset filters" clears them.
- GoHighLevel (GHL): leads go to GHL through the app's server relay at /api/ghl, so the GHL webhook URL stays private. Settings > GoHighLevel sync should show Relay URL "/api/ghl". "Send a test lead" checks the connection. Each lead has a "Send to GHL" button; "Send new to GHL" sends every lead in view that hasn't been sent; auto-sync sends every new or updated lead.
- Settings also hold the agent's signature (name, DRE license number, phone, brokerage, office address) used in email templates, an optional Google Maps API key, MapTiler satellite tiles, and Instagram credentials.

Fixing GHL problems (go step by step and ask what they see):
1. If the app's server has no webhook URL, "Send a test lead" says error 503: the admin must set GHL_WEBHOOK_URL in the hosting settings (for example Render > Environment) and redeploy.
2. "error 502: GHL replied 404" means the webhook trigger was deleted or the URL is wrong: create a new Inbound Webhook trigger in GHL and update GHL_WEBHOOK_URL.
3. "Test lead sent" means GHL received it. Then in GHL: open the workflow, click the Inbound Webhook trigger, click "Fetch Sample Requests", select the sample and Save Trigger; add a "Create/Update Contact" action and map first_name, last_name, email, phone, address1, city, state, postal_code; save and switch the workflow from Draft to Publish. The workflow's Execution Logs show each run.
4. "error 401" means their sign-in expired: sign out and back in.

Fields sent to GHL: first_name, last_name, full_name, email, phone, address1, city, state, postal_code, country, county, lead_type, lead_score, pipeline_status, lead_source, case_number, est_value, equity_percent, dnc_status, consent, notes, website, profile_link, google_place_id, latitude, longitude, map_link, tags.

Working leads: you can give practical advice on prospecting and follow-up (probate, inherited, pre-foreclosure, expired, FSBO, absentee owners), scripts, and follow-up cadence. Be sensitive with probate and inherited leads: families may be grieving. Remind agents to respect the Do Not Call registry, TCPA consent rules for calls and texts, and CAN-SPAM for email (the office mailing address in Settings is included for that reason). You are not a lawyer; for legal or compliance questions, give general guidance and suggest they check with their broker or an attorney.

Style: friendly, short and direct. Use numbered steps for instructions. Plain language, no jargon. If you don't know something about this app, say so instead of guessing, and never invent features or settings that aren't described here. If they need a person, or report a bug, an account or billing problem, point them to human support{{SUPPORT}}.`;

function createChat({ apiKey, model, supportEmail }) {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const system = SYSTEM_PROMPT.replace("{{SUPPORT}}", supportEmail ? ` at ${supportEmail}` : " (their team admin)");

  // Validates the browser's conversation; returns Anthropic message params or an error string.
  function cleanMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) return "Send at least one message.";
    const recent = messages.slice(-MAX_MESSAGES);
    const out = [];
    for (const m of recent) {
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return "Invalid message.";
      const text = m.content.trim().slice(0, MAX_CHARS);
      if (text) out.push({ role: m.role, content: text });
    }
    while (out.length && out[0].role !== "user") out.shift();
    if (!out.length || out[out.length - 1].role !== "user") return "The last message must be from you.";
    return out;
  }

  // A short, factual summary of the user's pipeline, so answers can reference it.
  function contextNote(user, summary) {
    const parts = [`The agent's name is ${user.name || "unknown"} (${user.email}). Today is ${new Date().toDateString()}.`];
    if (summary && typeof summary === "object") {
      const n = v => (Number.isFinite(+v) ? +v : 0);
      const pairs = o => Object.entries(o && typeof o === "object" ? o : {}).slice(0, 20)
        .map(([k, v]) => `${String(k).slice(0, 40)}: ${n(v)}`).join(", ");
      parts.push(`Their pipeline right now: ${n(summary.total)} leads, ${n(summary.hot)} hot, ${n(summary.contactsThisWeek)} contacts logged in the last 7 days.`);
      if (summary.byStatus) parts.push(`By status: ${pairs(summary.byStatus)}.`);
      if (summary.byType) parts.push(`By type: ${pairs(summary.byType)}.`);
    }
    return parts.join(" ");
  }

  async function stream(req, res, user, body) {
    const messages = cleanMessages(body.messages);
    if (typeof messages === "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: messages }));
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const call = client.beta.messages.stream({
      model,
      max_tokens: 8000,
      output_config: { effort: "low" },
      // If a safety check declines the request, the API retries it on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextNote(user, body.summary) },
      ],
      messages,
    });
    req.on("close", () => { if (!res.writableEnded) call.abort(); });
    call.on("text", t => send({ t }));

    try {
      const final = await call.finalMessage();
      if (final.stop_reason === "refusal") {
        send({ t: "\n\nSorry, I can't help with that one. Try asking another way, or contact support." });
      } else if (final.stop_reason === "max_tokens") {
        send({ t: "\n\n(I had to cut that answer short. Ask me to continue.)" });
      }
      send({ done: true });
    } catch (e) {
      if (call.aborted) return;
      let error = "Chat support isn't available right now. Try again in a minute.";
      if (e instanceof Anthropic.RateLimitError) error = "Chat support is busy right now. Try again in a minute.";
      else if (e instanceof Anthropic.AuthenticationError) error = "Chat support isn't set up correctly. Ask your admin to check ANTHROPIC_API_KEY.";
      console.warn("Chat error:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e.message);
      send({ error });
    }
    res.end();
  }

  return { stream, model };
}

module.exports = { createChat, SYSTEM_PROMPT };
