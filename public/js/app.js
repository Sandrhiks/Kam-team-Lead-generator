// Studio shell: routing, Home, Templates, AI Tools (guide + Prompt Builder),
// Assistant (ChatGPT-style chat), Support (help center + tickets).
import { $, $$, esc, h, uid, api, stream, toast, modal, confirmBox, promptBox, md, timeAgo, copyText, store } from "./ui.js";
import { renderSVG } from "./render.js";
import { openEditor, applyTemplate } from "./editor.js";

const D = window.KamDesign;
const ctx = { catalog: null, config: null, leave: [], onLeave(fn) { this.leave.push(fn); }, startPrompt: null };
const view = $("#view");

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    const [cat, cfg] = await Promise.all([api("/api/catalog"), api("/api/config")]);
    ctx.catalog = cat; ctx.config = cfg;
  } catch (e) {
    view.innerHTML = `<div class="page"><div class="empty"><b>Couldn't load the studio.</b><p>${esc(e.message)}</p><a class="btn" href="/">Try again</a></div></div>`;
    return;
  }
  const u = ctx.config.user;
  $("#acctName").textContent = u.name || u.email;
  $("#acctEmail").textContent = u.email;
  $("#avatar").textContent = (u.name || u.email).trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  ctx.leave.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  const [, page = "", arg = ""] = location.hash.split("/");
  $$("#nav a").forEach(a => a.classList.toggle("on", a.dataset.page === (page || "home") || (page === "edit" && a.dataset.page === "home")));
  document.body.classList.toggle("full", page === "edit" || page === "chat");
  const pages = { "": home, home, templates, tools, chat, support, edit: () => editPage(arg) };
  (pages[page] || home)(arg);
  window.scrollTo(0, 0);
}

/* ---------------- Account menu & theme ---------------- */
$("#acctBtn").onclick = e => { e.stopPropagation(); $("#acctMenu").classList.toggle("hidden"); };
document.addEventListener("click", e => { if (!e.target.closest("#acct")) $("#acctMenu").classList.add("hidden"); });
$("#signOut").onclick = async () => { await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }); location.href = "/login"; };
$("#signOutAll").onclick = async () => {
  if (!(await confirmBox("Sign out everywhere?", "This signs you out on every device and browser, including this one.", "Sign out everywhere", true))) return;
  await fetch("/auth/logout-all", { method: "POST", credentials: "same-origin" });
  location.href = "/login";
};
$("#theme").onclick = () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  store.set("theme", next);
};

/* ---------------- Designs ---------------- */
function newDesign(over = {}) {
  const now = Date.now();
  return { id: uid("d"), name: "Untitled design", width: 1080, height: 1080, background: "#FFFFFF", stage: "brief", templateId: "", brief: {}, checks: {}, chat: [], thumb: "", elements: [], created: now, updated: now, ...over };
}

async function createAndOpen(d, startPrompt) {
  try {
    const clean = D.cleanDesign(d, ctx.catalog.fonts);
    await api(`/api/designs/${clean.id}`, { method: "PUT", body: clean });
    ctx.startPrompt = startPrompt || null;
    location.hash = `#/edit/${clean.id}`;
  } catch (e) { toast(e.message, "bad"); }
}

function fromTemplate(t, name) {
  const d = newDesign({ name: name || t.name });
  applyTemplate(d, t);
  return d;
}

async function editPage(id) {
  view.innerHTML = `<div class="loading">Opening design…</div>`;
  try {
    const { design } = await api(`/api/designs/${encodeURIComponent(id)}`);
    openEditor(view, D.cleanDesign(design, ctx.catalog.fonts), ctx);
  } catch (e) {
    view.innerHTML = `<div class="page"><div class="empty"><b>Couldn't open this design.</b><p>${esc(e.message)}</p><a class="btn" href="#/">Back to Home</a></div></div>`;
  }
}

// Picks a sensible starting template for a free-text request.
function guessTemplate(text) {
  const t = text.toLowerCase();
  const rules = [
    [/story|reel|vertical|9:16/, "story-new-listing"], [/open house/, "ig-open-house"], [/sold|closed/, "ig-just-sold"],
    [/flyer|print|brochure/, "flyer-letter"], [/business card/, "business-card"], [/market|stats|update/, "market-update"],
    [/linkedin/, "linkedin-banner"], [/facebook cover|fb cover/, "fb-cover"], [/youtube|thumbnail/, "yt-thumbnail"],
    [/newsletter|email/, "email-header"], [/slide|presentation|deck/, "presentation"], [/listed|listing|for sale/, "ig-just-listed"],
  ];
  return (rules.find(([re]) => re.test(t)) || [])[1] || null;
}

/* ---------------- Home ---------------- */
async function home() {
  const { catalog, config } = ctx;
  view.innerHTML = `
  <div class="page">
    <section class="hero2">
      <h1>What are we designing today${config.user.name ? `, ${esc(config.user.name.split(" ")[0])}` : ""}?</h1>
      <p class="muted">Describe it and the AI design agent builds it on brand. Or start from a template or a blank size.</p>
      <form class="ask" id="ask">
        <textarea id="askIn" rows="2" placeholder="e.g. Just listed Instagram post for 1234 Ocean View Dr, 4 bd, 3 ba, $1,250,000, modern coastal home" aria-label="Describe your design"></textarea>
        <div class="askrow">
          <div class="chips" id="askChips">${["Just listed post", "Open house flyer", "Market update", "Instagram Story", "Business card", "YouTube thumbnail"].map(c => `<button type="button" class="chip">${c}</button>`).join("")}</div>
          <button class="btn primary">${config.assistant ? "✦ Create with AI" : "Create"}</button>
        </div>
      </form>
      ${config.assistant ? "" : `<p class="hint">The AI assistant is off (no ANTHROPIC_API_KEY on the server), so this starts from the closest template.</p>`}
    </section>

    <section>
      <div class="sechead"><h2>Start blank</h2><div class="grow"></div><button class="btn sm" id="importBtn">Import .kamdesign.json</button></div>
      <div class="sizes">${catalog.sizes.map((s, i) => { const r = s.width / s.height; const w = r >= 1 ? 54 : Math.round(54 * r), hh = r >= 1 ? Math.round(54 / r) : 54; return `<button class="sizecard" data-size="${i}"><span class="ratio" style="width:${w}px;height:${hh}px"></span><b>${esc(s.name)}</b><small>${s.width} × ${s.height}</small></button>`; }).join("")}</div>
    </section>

    <section>
      <div class="sechead"><h2>Your designs</h2><div class="grow"></div><div class="chips" id="stageFilter"></div></div>
      <div id="designs" class="dgrid"><div class="loading">Loading…</div></div>
    </section>
  </div>`;

  $("#askChips").onclick = e => { const b = e.target.closest(".chip"); if (b) { $("#askIn").value = b.textContent + ": "; $("#askIn").focus(); } };
  $("#askIn").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#ask").requestSubmit(); } };
  $("#ask").onsubmit = e => {
    e.preventDefault();
    const text = $("#askIn").value.trim();
    if (text.length < 3) return toast("Describe what you'd like to make.", "bad");
    const tid = guessTemplate(text);
    const t = tid && catalog.templates.find(x => x.id === tid);
    const name = text.replace(/\s+/g, " ").slice(0, 60);
    if (config.assistant) createAndOpen(newDesign({ name }), { text, hint: `(This is a new, empty design${t ? `; the "${t.id}" template looks like a good fit` : ""}. Build it.)` });
    else createAndOpen(t ? fromTemplate(t, name) : newDesign({ name }));
  };
  $$(".sizecard").forEach(b => (b.onclick = () => { const s = catalog.sizes[+b.dataset.size]; createAndOpen(newDesign({ name: s.name, width: s.width, height: s.height })); }));
  $("#importBtn").onclick = importDesign;

  let designs = [];
  try { designs = (await api("/api/designs")).designs; } catch (e) { $("#designs").innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  let filter = "";
  const drawList = () => {
    const counts = Object.fromEntries(catalog.sop.map(s => [s.id, designs.filter(d => d.stage === s.id).length]));
    $("#stageFilter").innerHTML = `<button class="chip" data-f="" aria-pressed="${!filter}">All ${designs.length}</button>` + catalog.sop.map(s => `<button class="chip" data-f="${s.id}" aria-pressed="${filter === s.id}">${esc(s.name)} ${counts[s.id]}</button>`).join("");
    const list = designs.filter(d => !filter || d.stage === filter);
    $("#designs").innerHTML = list.length ? list.map(d => `
      <article class="dcard" data-id="${esc(d.id)}">
        <a href="#/edit/${esc(d.id)}" class="dthumb">${d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : `<span class="noth" style="aspect-ratio:${d.width}/${d.height}"></span>`}</a>
        <div class="dmeta"><div><b>${esc(d.name)}</b><small>${d.width}×${d.height} · ${timeAgo(d.updated)}</small></div>
          <span class="tag st-${d.stage}">${esc((catalog.sop.find(s => s.id === d.stage) || {}).name || d.stage)}</span>
          <div class="menu-wrap"><button class="btn ghost icon" data-menu aria-label="More">⋯</button>
            <div class="menu hidden"><button data-act="open">Open</button><button data-act="rename">Rename</button><button data-act="dup">Duplicate</button><hr><button data-act="del" class="danger">Delete</button></div></div>
        </div>
      </article>`).join("") : `<div class="empty"><b>${designs.length ? "No designs at this stage." : "No designs yet."}</b><p>${designs.length ? "" : "Describe one above, or pick a template."}</p>${designs.length ? "" : `<a class="btn" href="#/templates">Browse templates</a>`}</div>`;
  };
  drawList();
  $("#stageFilter").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { filter = b.dataset.f; drawList(); } };
  $("#designs").onclick = async e => {
    const card = e.target.closest(".dcard");
    if (!card) return;
    const id = card.dataset.id, m = e.target.closest("[data-menu]"), act = e.target.closest("[data-act]");
    if (m) { e.stopPropagation(); $$(".dcard .menu").forEach(x => x !== m.nextElementSibling && x.classList.add("hidden")); m.nextElementSibling.classList.toggle("hidden"); return; }
    if (!act) return;
    const a = act.dataset.act;
    if (a === "open") location.hash = `#/edit/${id}`;
    if (a === "del") {
      if (!(await confirmBox("Delete design?", "This permanently deletes the design. Downloads you've saved are not affected.", "Delete", true))) return;
      try { await api(`/api/designs/${id}`, { method: "DELETE" }); designs = designs.filter(d => d.id !== id); drawList(); toast("Deleted"); } catch (err) { toast(err.message, "bad"); }
    }
    if (a === "rename" || a === "dup") {
      try {
        const { design } = await api(`/api/designs/${id}`);
        if (a === "rename") {
          const name = await promptBox("Rename design", "Name", design.name);
          if (!name) return;
          await api(`/api/designs/${id}`, { method: "PUT", body: { ...design, name } });
          designs.find(d => d.id === id).name = name; drawList();
        } else {
          const copy = { ...design, id: uid("d"), name: design.name + " (copy)", stage: "brief", checks: {}, chat: [], created: Date.now() };
          await api(`/api/designs/${copy.id}`, { method: "PUT", body: copy });
          designs.unshift(D.designSummary({ ...copy, updated: Date.now() })); drawList(); toast("Duplicated");
        }
      } catch (err) { toast(err.message, "bad"); }
    }
  };
  document.addEventListener("click", closeCardMenus);
  ctx.onLeave(() => document.removeEventListener("click", closeCardMenus));
}
function closeCardMenus(e) { if (!e.target.closest(".menu-wrap")) $$(".dcard .menu").forEach(m => m.classList.add("hidden")); }

function importDesign() {
  const input = h(`<input type="file" accept=".json,application/json">`);
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const src = j && j.kamDesign ? j.design : j;
      await createAndOpen({ ...src, id: uid("d"), created: Date.now(), updated: Date.now() });
      toast("Imported", "good");
    } catch (e) { toast(e instanceof SyntaxError ? "That isn't a .kamdesign.json file." : e.message, "bad"); }
  };
  input.click();
}

/* ---------------- Templates ---------------- */
function templates() {
  const { catalog } = ctx;
  const cats = [...new Set(catalog.templates.map(t => t.category))];
  let cat = "";
  view.innerHTML = `<div class="page">
    <div class="sechead"><div><h1>Templates</h1><p class="muted">On-brand starting points. Each one lists the AI tools that work best with it.</p></div></div>
    <div class="chips" id="cats"></div>
    <div class="tgrid" id="tgrid"></div></div>`;
  const draw = () => {
    $("#cats").innerHTML = `<button class="chip" data-c="" aria-pressed="${!cat}">All</button>` + cats.map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${cat === c}">${esc(c)}</button>`).join("");
    $("#tgrid").innerHTML = catalog.templates.filter(t => !cat || t.category === cat).map(t => `
      <article class="tcard" data-t="${t.id}">
        <button class="tprev" data-use="${t.id}" aria-label="Use ${esc(t.name)}"><span style="aspect-ratio:${t.width}/${t.height}">${renderSVG({ ...t, background: "#FFFFFF" }, { width: "100%", height: "100%", idPrefix: "g" + t.id })}</span></button>
        <div class="tinfo"><b>${esc(t.name)}</b><small>${esc(t.channel)} · ${t.width}×${t.height}</small>
          <div class="ttools">${t.tools.map(id => { const x = catalog.tools.find(y => y.id === id); return x ? `<span class="tag">${esc(x.name.replace(/ \(.*\)/, ""))}</span>` : ""; }).join("")}</div>
          <div class="tact"><button class="btn primary sm" data-use="${t.id}">Use template</button><button class="btn sm" data-info="${t.id}">Details</button></div></div>
      </article>`).join("");
  };
  draw();
  $("#cats").onclick = e => { const b = e.target.closest("[data-c]"); if (b) { cat = b.dataset.c; draw(); } };
  $("#tgrid").onclick = e => {
    const u = e.target.closest("[data-use]"), i = e.target.closest("[data-info]");
    if (u) createAndOpen(fromTemplate(catalog.templates.find(t => t.id === u.dataset.use)));
    if (i) templateInfo(catalog.templates.find(t => t.id === i.dataset.info));
  };
}

function templateInfo(t) {
  const { catalog } = ctx;
  modal(t.name, (el, close) => {
    el.innerHTML = `<div class="tdetail">
      <div class="tdprev" style="aspect-ratio:${t.width}/${t.height}">${renderSVG({ ...t, background: "#FFFFFF" }, { width: "100%", height: "100%", idPrefix: "x" })}</div>
      <div>
        <p><b>${esc(t.channel)}</b> · ${t.width}×${t.height}px · ${esc(t.category)}</p>
        <h4>Recommended AI tools</h4>
        <ul class="toollist">${t.tools.map(id => catalog.tools.find(x => x.id === id)).filter(Boolean).map(x => `<li><b>${esc(x.name)}</b><span class="muted">${esc(x.bestFor)}</span></li>`).join("")}</ul>
        ${t.prompts.length ? `<h4>Prompt starters</h4>${t.prompts.map(p => `<div class="prompt"><code>${esc(p)}</code><button class="btn ghost sm" data-copy="${esc(p)}">Copy</button></div>`).join("")}` : ""}
        <div class="mfoot"><button class="btn" data-x2>Close</button><button class="btn primary" data-use>Use template</button></div>
      </div></div>`;
    el.onclick = e => {
      const c = e.target.closest("[data-copy]");
      if (c) copyText(c.dataset.copy);
      if (e.target.closest("[data-use]")) { close(); createAndOpen(fromTemplate(t)); }
      if (e.target.closest("[data-x2]")) close();
    };
  }, { wide: true });
}

/* ---------------- AI tools guide + Prompt Builder ---------------- */
const STYLES = ["Editorial real estate photo", "Luxury lifestyle photo", "Bright and airy interior", "Twilight exterior", "Aerial drone view", "Minimal flat illustration", "Line icon set", "3D render, soft clay", "Cinematic, shallow depth of field"];
const LIGHTS = ["Soft natural daylight", "Golden hour", "Blue hour / twilight", "Bright midday sun", "Warm interior lamps", "Studio softbox"];
const CAMERAS = ["Wide angle, eye level", "Straight-on, symmetrical", "Low angle", "Close-up detail", "Overhead flat lay", "Drone, 45° down"];
const ASPECTS = { "1:1": "Square 1:1", "4:5": "Portrait 4:5", "9:16": "Story 9:16", "16:9": "Landscape 16:9", "3:2": "Photo 3:2" };

function buildPrompt(p, tool) {
  const bits = [p.subject, p.setting && `in ${p.setting}`].filter(Boolean).join(" ");
  const look = [p.style, p.light, p.camera, p.mood && `${p.mood} mood`].filter(Boolean);
  if (!bits) return "";
  if (tool === "midjourney") {
    return `${[bits, ...look.map(s => s.toLowerCase())].join(", ")}${p.text ? `, text "${p.text}"` : ""} --ar ${p.aspect} --style raw${p.exclude ? ` --no ${p.exclude}` : ""}`;
  }
  if (tool === "ideogram") {
    return `${p.style || "Graphic design"} of ${bits}${p.text ? `, with the text "${p.text}" in a bold sans serif` : ""}. ${look.slice(1).join(". ")}${look.length > 1 ? "." : ""} Black and white Kam Team palette.${p.exclude ? ` Avoid ${p.exclude}.` : ""}`.replace(/\s+/g, " ").trim();
  }
  if (tool === "video") {
    return `Animate this image: ${p.motion || "slow push-in, subtle parallax"}. Keep architecture straight and stable, no warping. ${p.light || ""}. ${p.mood ? p.mood + " mood." : ""}`.replace(/\s+/g, " ").trim();
  }
  if (tool === "recraft") {
    return `${p.style && /icon|illustration|3D/i.test(p.style) ? p.style : "Flat vector illustration"} of ${bits}. Colors: #111111, #FFFFFF, #9C9C98 only. Clean shapes, no gradients.${p.exclude ? ` No ${p.exclude}.` : ""}`;
  }
  return `${p.style ? `${p.style} of ` : "A photo of "}${bits}. ${look.slice(1).join(". ")}${look.length > 1 ? "." : ""}${p.text ? ` Include the text "${p.text}".` : ""} Aspect ratio ${p.aspect}.${p.exclude ? ` Avoid: ${p.exclude}.` : ""}`.replace(/\s+/g, " ").trim();
}

function tools(arg) {
  const { catalog, config } = ctx;
  const cats = [...new Set(catalog.tools.map(t => t.category))];
  let cat = "";
  const P = store.get("prompt", { subject: "", setting: "", style: STYLES[0], light: LIGHTS[0], camera: CAMERAS[0], mood: "", aspect: "1:1", text: "", motion: "", exclude: "people, text, watermark", tool: "gpt-image" });
  view.innerHTML = `<div class="page">
    <div class="sechead"><div><h1>AI Tools</h1><p class="muted">Which AI tool to use for which job, what to watch out for, and prompts that work.</p></div></div>
    <div class="tabsbar"><button class="chip" data-v="guide" aria-pressed="${arg !== "prompt"}">Tool guide</button><button class="chip" data-v="prompt" aria-pressed="${arg === "prompt"}">Prompt Builder</button></div>
    <div id="tv"></div></div>`;
  const tv = $("#tv");
  const guide = () => {
    tv.innerHTML = `<div class="chips" id="tcats"></div><div class="toolgrid" id="tg"></div>
      <p class="hint">Licensing and plan terms change often. Check each vendor's current terms before commercial use, and never present AI-generated images as photos of a real property.</p>`;
    const draw = () => {
      $("#tcats").innerHTML = `<button class="chip" data-c="" aria-pressed="${!cat}">All</button>` + cats.map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="${cat === c}">${esc(c)}</button>`).join("");
      $("#tg").innerHTML = catalog.tools.filter(t => !cat || t.category === cat).map(t => `
        <article class="toolcard">
          <div class="tchead"><div><b>${esc(t.name)}</b><small>${esc(t.vendor)}</small></div><span class="tag">${esc(t.category)}</span></div>
          <p>${esc(t.bestFor)}</p>
          <ul class="pros">${t.strengths.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
          <ul class="cons">${t.watchOuts.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
          <div class="prompt"><code>${esc(t.promptTip)}</code></div>
          <div class="tact">${t.id === "claude" ? `<a class="btn sm primary" href="#/chat">Open Assistant</a>` : `<a class="btn sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Visit site ↗</a>`}
            ${["gpt-image", "midjourney", "firefly", "ideogram", "recraft", "flux", "gemini-image", "video"].includes(t.id) ? `<button class="btn sm" data-pb="${t.id}">Build a prompt</button>` : ""}</div>
        </article>`).join("");
    };
    draw();
    tv.onclick = e => {
      const c = e.target.closest("[data-c]"), pb = e.target.closest("[data-pb]");
      if (c) { cat = c.dataset.c; draw(); }
      if (pb) { P.tool = pb.dataset.pb; store.set("prompt", P); location.hash = "#/tools/prompt"; }
    };
  };
  const builder = () => {
    const sel = (k, opts) => `<select data-p="${k}">${opts.map(o => `<option ${P[k] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const toolOpts = [["gpt-image", "GPT Image / ChatGPT"], ["midjourney", "Midjourney"], ["firefly", "Adobe Firefly"], ["ideogram", "Ideogram (text in image)"], ["recraft", "Recraft (vector)"], ["flux", "FLUX"], ["gemini-image", "Gemini"], ["video", "Video (Runway, Higgsfield, Veo)"]];
    tv.innerHTML = `<div class="pbuilder">
      <form class="pbform" id="pbf">
        <div class="field"><label>Tool</label><select data-p="tool">${toolOpts.map(([v, l]) => `<option value="${v}" ${P.tool === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label>Subject *</label><input data-p="subject" value="${esc(P.subject)}" placeholder="e.g. a modern two-story home with a glass entry"></div>
        <div class="field"><label>Setting</label><input data-p="setting" value="${esc(P.setting)}" placeholder="e.g. a quiet coastal street with palm trees"></div>
        <div class="row2"><div class="field"><label>Style</label>${sel("style", STYLES)}</div><div class="field"><label>Lighting</label>${sel("light", LIGHTS)}</div></div>
        <div class="row2"><div class="field"><label>Camera</label>${sel("camera", CAMERAS)}</div><div class="field"><label>Aspect</label><select data-p="aspect">${Object.entries(ASPECTS).map(([v, l]) => `<option value="${v}" ${P.aspect === v ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
        <div class="field"><label>Mood</label><input data-p="mood" value="${esc(P.mood)}" placeholder="e.g. calm, premium, welcoming"></div>
        <div class="field"><label>Text in the image (Ideogram, GPT Image)</label><input data-p="text" value="${esc(P.text)}" placeholder="Leave empty; add text in the studio instead"></div>
        <div class="field"><label>Motion (video tools)</label><input data-p="motion" value="${esc(P.motion)}" placeholder="e.g. slow push-in toward the front door"></div>
        <div class="field"><label>Avoid</label><input data-p="exclude" value="${esc(P.exclude)}"></div>
      </form>
      <div class="pbout">
        <h4>Your prompt</h4>
        <div class="pbtext" id="pbOut"></div>
        <div class="tact"><button class="btn primary" id="pbCopy">Copy prompt</button>
          ${config.assistant ? `<button class="btn" id="pbAsk">✦ Ask Kam to improve it</button>` : ""}
          ${config.images ? `<button class="btn" id="pbGen">Generate here</button>` : ""}</div>
        <div id="pbImg"></div>
        <div class="pbtips"><h4>Tips</h4><ul>
          <li>Front-load the subject; add style, light and camera after it.</li>
          <li>Keep text out of AI images. Add headlines in the studio, where they stay sharp and on-brand.</li>
          <li>For listings, use AI for mood and concept images only. Real listing photos must show the real property.</li>
          <li>Upscale AI images before using them in print templates.</li></ul></div>
      </div></div>`;
    const out = () => { const p = buildPrompt(P, P.tool); $("#pbOut").textContent = p || "Add a subject to build your prompt."; return p; };
    out();
    $("#pbf").oninput = e => { const k = e.target.dataset.p; if (k) { P[k] = e.target.value; store.set("prompt", P); out(); } };
    $("#pbCopy").onclick = () => { const p = out(); if (p) copyText(p); };
    const ask = $("#pbAsk");
    if (ask) ask.onclick = () => { const p = out(); if (p) { ctx.chatDraft = `Improve this ${P.tool} prompt for a Kam Team real estate graphic and explain what you changed:\n\n${p}`; location.hash = "#/chat"; } };
    const gen = $("#pbGen");
    if (gen) gen.onclick = async () => {
      const p = out();
      if (!p) return;
      gen.disabled = true; $("#pbImg").innerHTML = `<div class="loading">Generating… up to a minute.</div>`;
      try {
        const aspect = { "1:1": "square", "4:5": "portrait", "9:16": "portrait", "16:9": "landscape", "3:2": "landscape" }[P.aspect];
        const j = await api("/api/images", { method: "POST", body: { prompt: buildPrompt(P, "gpt-image"), aspect } });
        $("#pbImg").innerHTML = `<img class="genimg" src="${j.src}" alt="Generated image"><div class="tact"><button class="btn sm" id="pbUse">Start a design with it</button><a class="btn sm" href="${j.src}" download="kam-ai-image.png">Download</a></div>`;
        $("#pbUse").onclick = () => createAndOpen(newDesign({ name: P.subject.slice(0, 60) || "AI image", elements: [{ type: "image", src: j.src, prompt: p, x: 0, y: 0, w: 1080, h: 1080, fit: "cover", name: "AI image" }] }));
      } catch (e) { $("#pbImg").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      gen.disabled = false;
    };
  };
  $(".tabsbar").onclick = e => { const b = e.target.closest("[data-v]"); if (b) location.hash = b.dataset.v === "prompt" ? "#/tools/prompt" : "#/tools"; };
  (arg === "prompt" ? builder : guide)();
}

/* ---------------- Assistant (ChatGPT-style) ---------------- */
async function chat(chatId) {
  const { config } = ctx;
  view.innerHTML = `<div class="chatapp">
    <aside class="chatside" id="chatside">
      <button class="btn primary" id="newChat" style="width:100%">+ New chat</button>
      <input id="chatSearch" placeholder="Search chats" aria-label="Search chats">
      <ul class="chatlist" id="chatlist"></ul>
    </aside>
    <section class="chatmain">
      <div class="chathead"><button class="btn ghost icon mobile-only" id="sideToggle" aria-label="Show chats">☰</button><b id="chatTitle">New chat</b><div class="grow"></div><span class="muted small">Kam · AI assistant</span></div>
      <div class="chatscroll" id="chatscroll"><div class="chatcol" id="chatcol"></div></div>
      <form class="composer" id="composer">
        <textarea id="cin" rows="1" placeholder="${config.assistant ? "Message Kam…" : "The assistant isn't switched on yet"}" ${config.assistant ? "" : "disabled"} aria-label="Message"></textarea>
        <button class="btn primary" id="csend" ${config.assistant ? "" : "disabled"}>Send</button>
      </form>
      <p class="cfoot">AI can make mistakes. Check facts, prices and compliance details before publishing.</p>
    </section></div>`;

  let chats = [], cur = null, busy = false, abort = null;
  const loadList = async () => { try { chats = (await api("/api/chats")).chats; } catch (e) { toast(e.message, "bad"); } drawList(); };
  const drawList = () => {
    const q = $("#chatSearch").value.toLowerCase();
    const list = chats.filter(c => !q || c.title.toLowerCase().includes(q));
    $("#chatlist").innerHTML = list.length ? list.map(c => `<li class="${cur && cur.id === c.id ? "on" : ""}" data-id="${esc(c.id)}"><a href="#/chat/${esc(c.id)}">${c.pinned ? "📌 " : ""}${esc(c.title)}</a>
      <div class="menu-wrap"><button class="btn ghost icon xs" data-menu aria-label="Chat options">⋯</button><div class="menu hidden"><button data-act="pin">${c.pinned ? "Unpin" : "Pin"}</button><button data-act="rename">Rename</button><button data-act="del" class="danger">Delete</button></div></div></li>`).join("")
      : `<li class="muted small" style="padding:8px">${chats.length ? "No matches" : "Your chats appear here"}</li>`;
  };
  const suggestions = [
    ["Write captions", "Write 3 Instagram captions for a just-listed 4 bed home with ocean views. Include a call to action and hashtags."],
    ["Pick an AI tool", "I need a lifestyle image of a family kitchen for a flyer. Which AI tool should I use and what prompt?"],
    ["Plan a campaign", "Plan a 2-week social campaign for an open house, with a post for each day and which template to use."],
    ["Learn the SOP", "Walk me through the Design Studio SOP from brief to export."],
    ["Fix sign-in", "My sign-in code isn't arriving. What should I do?"],
    ["Brand rules", "Summarize the Kam Team brand rules I need to follow."],
  ];
  const drawMsgs = (live = "") => {
    const col = $("#chatcol");
    const msgs = cur ? cur.messages : [];
    $("#chatTitle").textContent = cur && cur.title ? cur.title : "New chat";
    if (!msgs.length && !live) {
      col.innerHTML = `<div class="chatempty"><svg class="bigmark"><use href="#kam"/></svg><h2>How can I help?</h2><p class="muted">Ask about the studio, brand, campaigns, copy or AI tools.</p>
        <div class="sugg">${suggestions.map(([t, q]) => `<button class="suggcard" data-q="${esc(q)}"><b>${esc(t)}</b><span>${esc(q)}</span></button>`).join("")}</div></div>`;
      return;
    }
    col.innerHTML = msgs.map((m, i) => m.role === "user"
      ? `<div class="cmsg user"><div class="bubble">${esc(m.content)}</div></div>`
      : `<div class="cmsg bot"><div class="av"><svg><use href="#kam"/></svg></div><div class="body">${md(m.content)}<div class="macts"><button class="btn ghost xs" data-copy="${i}">Copy</button>${i === msgs.length - 1 && !busy ? `<button class="btn ghost xs" data-regen>Regenerate</button>` : ""}</div></div></div>`).join("") + live;
    const sc = $("#chatscroll"); sc.scrollTop = sc.scrollHeight;
  };
  const persist = async () => {
    try {
      const j = await api(`/api/chats/${cur.id}`, { method: "PUT", body: cur });
      cur.title = j.chat.title;
      const i = chats.findIndex(c => c.id === cur.id);
      const row = { id: cur.id, title: cur.title, pinned: !!cur.pinned, updated: j.chat.updated, count: cur.messages.length };
      if (i >= 0) chats[i] = row; else chats.unshift(row);
      if (location.hash !== `#/chat/${cur.id}`) history.replaceState(null, "", `#/chat/${cur.id}`);
      drawList(); $("#chatTitle").textContent = cur.title;
    } catch (e) { toast("Couldn't save this chat: " + e.message, "bad"); }
  };
  async function send(text, regen = false) {
    text = String(text || "").trim();
    if (busy || (!text && !regen)) return;
    if (!cur) cur = { id: uid("c"), title: "", messages: [], created: Date.now() };
    if (regen) { if (cur.messages.at(-1)?.role === "assistant") cur.messages.pop(); }
    else cur.messages.push({ role: "user", content: text });
    $("#cin").value = ""; $("#cin").style.height = "";
    busy = true; $("#csend").textContent = "Stop";
    let reply = "", error = "";
    const live = () => `<div class="cmsg bot"><div class="av"><svg><use href="#kam"/></svg></div><div class="body">${reply ? md(reply) : `<span class="typing"><i></i><i></i><i></i></span>`}</div></div>`;
    drawMsgs(live());
    abort = new AbortController();
    await stream("/api/assistant", { mode: "support", messages: cur.messages.slice(-24) }, ev => {
      if (ev.t) { reply += ev.t; drawMsgs(live()); }
      if (ev.error) error = ev.error;
    }, abort.signal);
    busy = false; abort = null;
    if (!$("#chatcol")) return; // navigated away
    $("#csend").textContent = "Send";
    if (reply.trim()) cur.messages.push({ role: "assistant", content: reply.trim() });
    if (error) toast(error, "bad");
    drawMsgs();
    if (reply.trim()) persist();
    $("#cin").focus();
  }

  $("#composer").onsubmit = e => { e.preventDefault(); if (busy) { abort && abort.abort(); return; } send($("#cin").value); };
  $("#cin").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) send($("#cin").value); } };
  $("#cin").oninput = e => { e.target.style.height = ""; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; };
  $("#newChat").onclick = () => { location.hash = "#/chat"; };
  $("#chatSearch").oninput = drawList;
  $("#sideToggle").onclick = () => $("#chatside").classList.toggle("open");
  $("#chatcol").onclick = e => {
    const s = e.target.closest("[data-q]"), c = e.target.closest("[data-copy]");
    if (s) send(s.dataset.q);
    if (c) copyText(cur.messages[+c.dataset.copy].content);
    if (e.target.closest("[data-regen]")) send("", true);
  };
  $("#chatlist").onclick = async e => {
    const li = e.target.closest("li[data-id]"), m = e.target.closest("[data-menu]"), act = e.target.closest("[data-act]");
    if (!li) return;
    if (m) { e.preventDefault(); m.nextElementSibling.classList.toggle("hidden"); return; }
    if (!act) { $("#chatside").classList.remove("open"); return; }
    const id = li.dataset.id;
    try {
      if (act.dataset.act === "del") {
        if (!(await confirmBox("Delete chat?", "This chat will be deleted permanently.", "Delete", true))) return;
        await api(`/api/chats/${id}`, { method: "DELETE" });
        chats = chats.filter(c => c.id !== id);
        if (cur && cur.id === id) { location.hash = "#/chat"; return; }
        drawList();
      } else {
        const { chat: c } = await api(`/api/chats/${id}`);
        if (act.dataset.act === "pin") c.pinned = !c.pinned;
        else { const t = await promptBox("Rename chat", "Title", c.title); if (!t) return; c.title = t; }
        await api(`/api/chats/${id}`, { method: "PUT", body: c });
        if (cur && cur.id === id) { cur.pinned = c.pinned; cur.title = c.title; }
        await loadList();
      }
    } catch (err) { toast(err.message, "bad"); }
  };
  ctx.onLeave(() => { if (abort) abort.abort(); });

  await loadList();
  if (chatId) {
    try { cur = (await api(`/api/chats/${encodeURIComponent(chatId)}`)).chat; } catch (e) { toast(e.message, "bad"); }
    drawList();
  }
  drawMsgs();
  if (ctx.chatDraft) { $("#cin").value = ctx.chatDraft; ctx.chatDraft = null; $("#cin").dispatchEvent(new Event("input")); }
  $("#cin").focus();
}

/* ---------------- Support ---------------- */
const FAQ = [
  ["How do I sign in?", "Enter your work email on the sign-in page. We email you a 6-digit code that works for 10 minutes. Type it in and you're signed in for 7 days on that device. No password to remember."],
  ["My code didn't arrive", "Check spam and promotions folders, and make sure the email is spelled right. You can request a new code after 30 seconds. If your email isn't approved for the studio, the sign-in page will say so; ask your admin to add it."],
  ["How do I sign out?", "Click your initials (top right) and choose Sign out. \"Sign out of all devices\" ends every session, for example if you lost a phone or used a shared computer."],
  ["Are my designs saved?", "Yes. Designs save to your account automatically a moment after each change, and follow you to any device you sign in on. The editor shows Saved / Saving… next to the Download button."],
  ["Which format should I download?", "PNG for social media and the web, PNG @2x for extra-sharp screens, JPG for smaller files, PDF for printing (print templates export at 300 DPI), and SVG for vector use. Also keep the .kamdesign.json source so the design can be edited later."],
  ["What does the AI Assistant do?", "In the editor, the AI Assistant edits your design directly: it can pick a template, write the copy, add shapes, icons and images, resize for other channels and run the brand check. Every change can be undone with Ctrl+Z. The Assistant page is a ChatGPT-style chat for questions, captions, campaign plans and prompts."],
  ["Can I use AI images for listings?", "Use AI images for mood, concepts and backgrounds only. Listing photos must show the real property; virtual staging must be disclosed. Don't generate images of real people. Check each AI tool's license terms before commercial use."],
  ["What is the SOP workflow?", "Every design moves through Brief → Create → Review → Approve → Export, with a checklist at each stage. The Workflow tab in the editor shows the checklist, the brief, and the automatic brand check."],
  ["How do I add our logo?", "In the editor, open Add and choose Logo or Logo (white). It's the official Kam Team mark and keeps its proportions when you resize it."],
];

async function support() {
  const { catalog, config } = ctx;
  view.innerHTML = `<div class="page">
    <div class="sechead"><div><h1>Support</h1><p class="muted">Answers, the studio SOP, and a direct line to the team.</p></div></div>
    <div class="supgrid">
      <section>
        <div class="askcard"><div><b>Ask Kam, the AI assistant</b><p class="muted">Instant answers about the studio, brand rules, AI tools and campaigns.</p></div><a class="btn primary" href="#/chat">Start a chat</a></div>
        <h2>Frequently asked</h2>
        <input id="faqQ" placeholder="Search help" aria-label="Search help">
        <div class="faq" id="faq"></div>
        <h2>The Design SOP</h2>
        <ol class="soplist">${catalog.sop.map(s => `<li><b>${esc(s.name)}</b> <span class="muted">${esc(s.goal)}</span><ul>${s.checklist.map(c => `<li>${esc(c.label)}</li>`).join("")}</ul></li>`).join("")}</ol>
      </section>
      <section>
        <div class="card">
          <h2>Contact support</h2>
          <form id="ticket" class="stack">
            <div class="field"><label>Topic</label><select id="tCat"></select></div>
            <div class="field"><label>Subject</label><input id="tSub" maxlength="140" required></div>
            <div class="field"><label>What happened?</label><textarea id="tMsg" rows="5" maxlength="5000" required placeholder="What you were doing, what you expected, and what happened instead."></textarea></div>
            <div class="err" id="tErr"></div>
            <button class="btn primary">Send to support</button>
          </form>
          ${config.supportEmail ? `<p class="hint">Or email <a href="mailto:${esc(config.supportEmail)}">${esc(config.supportEmail)}</a>.</p>` : ""}
        </div>
        <h2>Your tickets</h2>
        <ul class="tickets" id="tickets"><li class="muted">Loading…</li></ul>
      </section>
    </div></div>`;
  const drawFaq = () => {
    const q = $("#faqQ").value.toLowerCase();
    const list = FAQ.filter(([a, b]) => !q || (a + b).toLowerCase().includes(q));
    $("#faq").innerHTML = list.length ? list.map(([a, b]) => `<details><summary>${esc(a)}</summary><p>${esc(b)}</p></details>`).join("") : `<p class="muted">No matches. <a href="#/chat">Ask the assistant</a> or send a ticket.</p>`;
  };
  drawFaq();
  $("#faqQ").oninput = drawFaq;
  const drawTickets = list => {
    $("#tickets").innerHTML = list.length ? list.map(t => `<li><div><b>${esc(t.subject)}</b><small>${esc(t.id)} · ${esc(t.category)} · ${timeAgo(t.created)}</small></div><span class="tag">${esc(t.status)}</span></li>`).join("") : `<li class="muted">No tickets yet.</li>`;
  };
  try {
    const j = await api("/api/tickets");
    $("#tCat").innerHTML = j.categories.map(c => `<option>${esc(c)}</option>`).join("");
    drawTickets(j.tickets);
  } catch (e) { $("#tickets").innerHTML = `<li class="err">${esc(e.message)}</li>`; }
  $("#ticket").onsubmit = async e => {
    e.preventDefault();
    $("#tErr").textContent = "";
    try {
      const j = await api("/api/tickets", { method: "POST", body: { category: $("#tCat").value, subject: $("#tSub").value, message: $("#tMsg").value } });
      toast(`Ticket ${j.ticket.id} sent${j.notified ? " to the team" : ""}.`, "good");
      $("#tSub").value = $("#tMsg").value = "";
      drawTickets((await api("/api/tickets")).tickets);
    } catch (err) { $("#tErr").textContent = err.message; }
  };
}

boot();
