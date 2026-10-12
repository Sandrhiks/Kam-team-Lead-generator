// The design editor: canvas with select/move/resize, layers, properties, brand kit,
// the SOP workflow panel, downloads, and the AI assistant that edits the design.
import { $, $$, esc, h, api, stream, toast, modal, confirmBox, md, readImageFile, store, copyText } from "./ui.js";
import { renderSVG, download, snapshot, textHeight } from "./render.js";

const D = window.KamDesign;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function openEditor(view, design, ctx) {
  const { catalog, config } = ctx;
  const brandHex = catalog.brand.colors.map(c => c.hex);
  const S = {
    d: design, sel: null, zoom: 1, history: [], future: [], dirty: false, saving: false, saveTimer: null, lastSaved: 0,
    leftTab: store.get("leftTab", "add"), rightTab: ctx.startPrompt ? "ai" : store.get("rightTab", "props"),
    busy: false, abort: null, seeCanvas: store.get("seeCanvas", true), destroyed: false,
  };

  view.innerHTML = `
  <div class="editor">
    <aside class="lpanel">
      <div class="tabs" role="tablist">
        ${[["add", "Add"], ["layers", "Layers"], ["brand", "Brand"], ["tpl", "Templates"]].map(([k, l]) => `<button role="tab" data-ltab="${k}">${l}</button>`).join("")}
      </div>
      <div class="pbody" id="lbody"></div>
    </aside>
    <section class="center">
      <div class="etool">
        <a class="btn ghost sm" href="#/" title="Back to Home">←</a>
        <input class="dname" id="dname" aria-label="Design name" maxlength="100">
        <span class="tag" id="stageTag"></span>
        <div class="grow"></div>
        <button class="btn ghost icon" id="undo" title="Undo (Ctrl+Z)">↶</button>
        <button class="btn ghost icon" id="redo" title="Redo (Ctrl+Shift+Z)">↷</button>
        <span class="zoom"><button class="btn ghost icon" id="zout" aria-label="Zoom out">−</button><button class="btn ghost sm" id="zfit" title="Fit to screen">100%</button><button class="btn ghost icon" id="zin" aria-label="Zoom in">+</button></span>
        <span class="saved" id="saved">Saved</span>
        <div class="menu-wrap">
          <button class="btn primary sm" id="dlBtn" aria-haspopup="true">Download ▾</button>
          <div class="menu hidden" id="dlMenu">
            <button data-fmt="png">PNG · social & web</button>
            <button data-fmt="png2">PNG @2x · high resolution</button>
            <button data-fmt="jpg">JPG · smaller file</button>
            <button data-fmt="pdf">PDF · print</button>
            <button data-fmt="svg">SVG · vector</button>
            <hr><button data-fmt="json">Editable source (.kamdesign.json)</button>
          </div>
        </div>
      </div>
      <div class="stagewrap" id="wrap">
        <div class="stage" id="stage"><div class="art-host" id="art"></div><div class="overlay" id="ov"></div></div>
      </div>
    </section>
    <aside class="rpanel">
      <div class="tabs" role="tablist">
        ${[["props", "Design"], ["ai", "AI Assistant"], ["sop", "Workflow"]].map(([k, l]) => `<button role="tab" data-rtab="${k}">${l}</button>`).join("")}
      </div>
      <div class="pbody" id="rbody"></div>
    </aside>
  </div>`;

  const art = $("#art", view), ov = $("#ov", view), stage = $("#stage", view), wrap = $("#wrap", view);
  const find = id => S.d.elements.find(e => e.id === id);
  const selEl = () => (S.sel ? find(S.sel) : null);

  /* ---------------- History & saving ---------------- */
  const snap = () => JSON.stringify(S.d);
  function commit(fn) {
    const before = snap();
    fn();
    if (snap() === before) return;
    S.history.push(before);
    if (S.history.length > 80) S.history.shift();
    S.future = [];
    changed();
  }
  // Changes that shouldn't be undo steps (chat messages, typing after the first keystroke).
  function silent(fn) { fn(); changed(); }
  const setSaved = t => { const el = $("#saved", view); if (el) el.textContent = t; };
  function changed() {
    S.d.updated = Date.now();
    S.dirty = true;
    setSaved("Unsaved");
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(save, 1200);
    draw();
  }
  function undo() {
    if (!S.history.length) return;
    S.future.push(snap());
    S.d = JSON.parse(S.history.pop());
    if (S.sel && !find(S.sel)) S.sel = null;
    changed(); drawPanels();
  }
  function redo() {
    if (!S.future.length) return;
    S.history.push(snap());
    S.d = JSON.parse(S.future.pop());
    changed(); drawPanels();
  }
  async function save() {
    if (S.saving || !S.dirty || S.destroyed) return;
    S.saving = true; S.dirty = false;
    setSaved("Saving…");
    try {
      S.d.thumb = await snapshot(S.d, 360, 0.7).catch(() => S.d.thumb);
      await api(`/api/designs/${S.d.id}`, { method: "PUT", body: S.d });
      S.lastSaved = Date.now();
      if (!S.dirty) setSaved("Saved");
    } catch (e) {
      S.dirty = true;
      setSaved(e.status === 413 || e.status === 400 ? "Not saved" : "Offline · retrying");
      if (e.status === 400 || e.status === 413) toast(e.message, "bad");
      else setTimeout(save, 5000);
    }
    S.saving = false;
    if (S.dirty) { clearTimeout(S.saveTimer); S.saveTimer = setTimeout(save, 1200); }
  }
  // Leaving the editor: save what's pending (save() checks `destroyed` before its first await).
  ctx.onLeave(() => {
    clearTimeout(S.saveTimer);
    if (S.dirty) save();
    S.destroyed = true;
    if (S.abort) S.abort.abort();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", closeMenus);
    window.removeEventListener("resize", fit);
    window.removeEventListener("beforeunload", onUnload);
  });
  function onUnload(e) { if (S.dirty) { save(); e.preventDefault(); } }
  window.addEventListener("beforeunload", onUnload);

  /* ---------------- Canvas drawing ---------------- */
  function draw() {
    art.innerHTML = renderSVG(S.d, { editor: true });
    stage.style.width = S.d.width * S.zoom + "px";
    stage.style.height = S.d.height * S.zoom + "px";
    $("#zfit", view).textContent = Math.round(S.zoom * 100) + "%";
    $("#dname", view).value === S.d.name || document.activeElement === $("#dname", view) || ($("#dname", view).value = S.d.name);
    const st = catalog.sop.find(s => s.id === S.d.stage);
    $("#stageTag", view).textContent = st ? `SOP · ${st.name}` : "";
    $("#undo", view).disabled = !S.history.length;
    $("#redo", view).disabled = !S.future.length;
    drawOverlay();
  }
  function drawOverlay() {
    const e = selEl();
    if (!e || e.hidden) { ov.innerHTML = ""; return; }
    const z = S.zoom;
    ov.innerHTML = `<div class="selbox${e.locked ? " locked" : ""}" style="left:${e.x * z}px;top:${e.y * z}px;width:${e.w * z}px;height:${e.h * z}px;transform:rotate(${e.rotation}deg)">
      ${e.locked ? "" : HANDLES.map(k => `<span class="hd ${k}" data-h="${k}"></span>`).join("")}
      <span class="dims">${Math.round(e.w)} × ${Math.round(e.h)}</span></div>`;
  }
  function fit() {
    const r = wrap.getBoundingClientRect();
    S.zoom = Math.max(0.05, Math.min(2, (r.width - 64) / S.d.width, (r.height - 64) / S.d.height));
    draw();
  }
  const setZoom = z => { S.zoom = Math.max(0.05, Math.min(4, z)); draw(); };

  /* ---------------- Pointer: select, move, resize ---------------- */
  stage.addEventListener("pointerdown", e => {
    const handle = e.target.closest("[data-h]");
    const g = e.target.closest("[data-id]");
    if (!handle) {
      const id = g ? g.dataset.id : null;
      if (id !== S.sel) { S.sel = id; drawOverlay(); drawPanels(); }
      if (!id) return;
    }
    const el = selEl();
    if (!el || el.locked) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, el: { ...el }, before: snap(), moved: false };
    const k = handle ? handle.dataset.h : null;
    const move = ev => {
      const dx = (ev.clientX - start.x) / S.zoom, dy = (ev.clientY - start.y) / S.zoom;
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 2 / S.zoom) return;
      start.moved = true;
      const o = start.el, n = find(S.sel);
      if (!n) return;
      if (!k) {
        let x = o.x + dx, y = o.y + dy;
        const snapD = 8 / S.zoom, guides = [];
        if (!ev.altKey) {
          if (Math.abs(x + o.w / 2 - S.d.width / 2) < snapD) { x = S.d.width / 2 - o.w / 2; guides.push("v"); }
          if (Math.abs(y + o.h / 2 - S.d.height / 2) < snapD) { y = S.d.height / 2 - o.h / 2; guides.push("h"); }
        }
        n.x = Math.round(x); n.y = Math.round(y);
        showGuides(guides);
      } else {
        let { x, y, w, h: hh } = o;
        if (k.includes("e")) w = o.w + dx;
        if (k.includes("s")) hh = o.h + dy;
        if (k.includes("w")) { w = o.w - dx; x = o.x + dx; }
        if (k.includes("n")) { hh = o.h - dy; y = o.y + dy; }
        const keepRatio = (ev.shiftKey || o.type === "logo" || (o.type === "image" && k.length === 2)) && k.length === 2;
        if (keepRatio) {
          const r = o.w / o.h;
          if (Math.abs(w - o.w) / o.w > Math.abs(hh - o.h) / o.h) hh = w / r; else w = hh * r;
          if (k.includes("w")) x = o.x + o.w - w;
          if (k.includes("n")) y = o.y + o.h - hh;
        }
        n.w = Math.max(4, Math.round(w)); n.h = Math.max(4, Math.round(hh));
        n.x = Math.round(Math.min(x, o.x + o.w - 4)); n.y = Math.round(Math.min(y, o.y + o.h - 4));
        if (o.type === "text" && k.length === 2 && ev.shiftKey) n.fontSize = Math.max(4, Math.round(o.fontSize * n.w / o.w));
      }
      art.innerHTML = renderSVG(S.d, { editor: true });
      drawOverlay();
    };
    const up = () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
      showGuides([]);
      if (start.moved) {
        const t = find(S.sel);
        if (t && t.type === "text") t.h = Math.max(t.h, Math.ceil(textHeight(t)));
        S.history.push(start.before); S.future = [];
        changed(); drawPanels();
      }
    };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
  });
  stage.addEventListener("dblclick", e => {
    const g = e.target.closest("[data-id]");
    if (!g) return;
    const el = find(g.dataset.id);
    if (el && el.type === "text") { S.rightTab = "props"; drawPanels(); setTimeout(() => { const t = $("#p-text", view); if (t) { t.focus(); t.select(); } }, 0); }
    if (el && el.type === "image") pickImage(el.id);
  });
  wrap.addEventListener("pointerdown", e => { if (e.target === wrap) { S.sel = null; drawOverlay(); drawPanels(); } });
  wrap.addEventListener("wheel", e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });

  function showGuides(list) {
    $$(".guide", stage).forEach(g => g.remove());
    for (const g of list) stage.appendChild(h(`<div class="guide ${g}"></div>`));
  }

  /* ---------------- Keyboard ---------------- */
  function onKey(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); S.dirty = true; save(); return; }
    if (typing || document.querySelector("dialog[open]")) return;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    const el = selEl();
    if (!el) return;
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(el.id); return; }
    if (e.key === "Escape") { S.sel = null; drawOverlay(); drawPanels(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && !el.locked) { e.preventDefault(); remove(el.id); return; }
    const step = e.shiftKey ? 10 : 1;
    const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (dir && !el.locked) { e.preventDefault(); commit(() => { el.x += dir[0]; el.y += dir[1]; }); drawPanels(); }
  }
  document.addEventListener("keydown", onKey);

  /* ---------------- Element actions ---------------- */
  function add(raw) {
    let e;
    commit(() => {
      e = D.cleanElement(raw, catalog.fonts);
      if (e.type === "text") e.h = Math.max(e.h, Math.ceil(textHeight(e)));
      S.d.elements.push(e);
    });
    S.sel = e.id;
    drawOverlay(); drawPanels();
    return e;
  }
  function update(id, props, { quiet = false } = {}) {
    (quiet ? silent : commit)(() => {
      const i = S.d.elements.findIndex(e => e.id === id);
      if (i < 0) return;
      const next = D.cleanElement(props, catalog.fonts, S.d.elements[i]);
      if (next.type === "text" && ("text" in props || "fontSize" in props || "fontFamily" in props || "lineHeight" in props || "letterSpacing" in props || "uppercase" in props || "fontWeight" in props || "w" in props)) {
        next.h = Math.max(Math.ceil(textHeight(next)), "h" in props ? next.h : 0);
      }
      S.d.elements[i] = next;
    });
  }
  function remove(id) { commit(() => { S.d.elements = S.d.elements.filter(e => e.id !== id); }); if (S.sel === id) S.sel = null; drawPanels(); }
  function duplicate(id) {
    const e = find(id);
    if (e) add({ ...JSON.parse(JSON.stringify(e)), id: undefined, x: e.x + 24, y: e.y + 24, name: e.name ? e.name + " copy" : "" });
  }
  function reorder(id, to) { commit(() => D.ops.reorder_element(S.d, { id, to })); drawPanels(); }

  function centerBox(w, h) { return { x: Math.round((S.d.width - w) / 2), y: Math.round((S.d.height - h) / 2), w, h }; }
  const unit = () => Math.min(S.d.width, S.d.height);

  async function pickImage(targetId) {
    const input = h(`<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">`);
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const img = await readImageFile(f);
        const t = targetId && find(targetId);
        if (t && t.type === "image") update(t.id, { src: img.src });
        else {
          const s = Math.min(1, (unit() * 0.7) / Math.max(img.width, img.height));
          add({ type: "image", src: img.src, fit: "cover", name: f.name.slice(0, 60), ...centerBox(Math.round(img.width * s), Math.round(img.height * s)) });
        }
        drawPanels();
      } catch (e) { toast(e.message, "bad"); }
    };
    input.click();
  }

  async function generateImage(prompt, targetId) {
    const t = targetId && find(targetId);
    const box = t || { w: S.d.width, h: S.d.height };
    const r = box.w / box.h;
    const aspect = r > 1.2 ? "landscape" : r < 0.83 ? "portrait" : "square";
    toast("Generating image… this can take up to a minute.");
    try {
      const j = await api("/api/images", { method: "POST", body: { prompt, aspect } });
      if (t) update(t.id, { src: j.src, prompt });
      else add({ type: "image", src: j.src, prompt, name: "AI image", fit: "cover", ...centerBox(Math.round(unit() * 0.8), Math.round(unit() * 0.8 / (aspect === "landscape" ? 1.5 : aspect === "portrait" ? 2 / 3 : 1))) });
      toast("Image added. Remember: AI images are illustrations, not photos of a real property.", "good");
      drawPanels();
    } catch (e) { toast(e.message, "bad"); }
  }

  /* ---------------- Panels ---------------- */
  function drawPanels() {
    $$("[data-ltab]", view).forEach(b => b.setAttribute("aria-selected", b.dataset.ltab === S.leftTab));
    $$("[data-rtab]", view).forEach(b => b.setAttribute("aria-selected", b.dataset.rtab === S.rightTab));
    drawLeft(); drawRight();
  }
  view.addEventListener("click", e => {
    const l = e.target.closest("[data-ltab]"), r = e.target.closest("[data-rtab]");
    if (l) { S.leftTab = l.dataset.ltab; store.set("leftTab", S.leftTab); drawPanels(); }
    if (r) { S.rightTab = r.dataset.rtab; store.set("rightTab", S.rightTab); drawPanels(); }
  });

  function drawLeft() {
    const body = $("#lbody", view);
    if (S.leftTab === "add") {
      body.innerHTML = `
        <h4>Text</h4>
        <button class="addbtn big" data-add="h1">Add a heading</button>
        <button class="addbtn mid" data-add="h2">Add a subheading</button>
        <button class="addbtn small" data-add="body">Add body text</button>
        <h4>Shapes & brand</h4>
        <div class="grid3">
          <button class="addtile" data-add="rect"><span class="sw sq"></span>Rectangle</button>
          <button class="addtile" data-add="ellipse"><span class="sw ci"></span>Circle</button>
          <button class="addtile" data-add="line"><span class="sw ln"></span>Line</button>
          <button class="addtile" data-add="logo"><svg class="mk"><use href="#kam"/></svg>Logo</button>
          <button class="addtile" data-add="logoW"><svg class="mk inv"><use href="#kam"/></svg>Logo (white)</button>
          <button class="addtile" data-add="photo"><span class="sw ph"></span>Photo frame</button>
        </div>
        <h4>Images</h4>
        <button class="btn" data-add="upload" style="width:100%">⬆ Upload a photo or logo</button>
        <p class="hint">Use photos you own or have a license for. Max 25 MB; large photos are resized.</p>
        ${config.images ? `
        <h4>Generate with AI</h4>
        <form id="genForm" class="stack">
          <textarea id="genPrompt" rows="3" placeholder="e.g. Bright modern kitchen with white oak cabinets, morning light, editorial real estate photo"></textarea>
          <button class="btn primary">✦ Generate image</button>
        </form>
        <p class="hint">Fills the selected photo frame, or adds a new image. Never use AI images as photos of a real listing.</p>` : `
        <h4>Generate with AI</h4>
        <p class="hint">No image generator is connected. Build a prompt in <a href="#/tools">AI Tools → Prompt Builder</a>, create the image in your favorite tool, then upload it here.</p>`}`;
      body.onclick = e => {
        const b = e.target.closest("[data-add]");
        if (!b) return;
        const u = unit(), k = b.dataset.add;
        const t = (text, size, weight, family = "Archivo", extra = {}) => {
          const w = Math.round(S.d.width * 0.8);
          add({ type: "text", text, fontFamily: family, fontSize: Math.round(size), fontWeight: weight, color: S.d.background === "#FFFFFF" || S.d.background === "#F2F2F0" ? "#111111" : "#FFFFFF", ...centerBox(w, Math.round(size * 1.2)), ...extra });
        };
        if (k === "h1") t("YOUR HEADLINE", u * 0.08, 800, "Archivo", { letterSpacing: 2 });
        if (k === "h2") t("A short subheading", u * 0.045, 600);
        if (k === "body") t("Body copy goes here. Keep it short and clear.", u * 0.03, 400, "Inter", { lineHeight: 1.4 });
        if (k === "rect") add({ type: "rect", fill: "#111111", ...centerBox(Math.round(u * 0.4), Math.round(u * 0.25)) });
        if (k === "ellipse") add({ type: "ellipse", fill: "#111111", ...centerBox(Math.round(u * 0.3), Math.round(u * 0.3)) });
        if (k === "line") add({ type: "rect", fill: "#111111", name: "Line", ...centerBox(Math.round(u * 0.3), Math.max(2, Math.round(u * 0.004))) });
        if (k === "logo" || k === "logoW") { const hh = Math.round(u * 0.12); add({ type: "logo", color: k === "logo" ? "#111111" : "#FFFFFF", name: "Kam Team mark", ...centerBox(Math.round(hh * 0.681), hh) }); }
        if (k === "photo") add({ type: "image", src: "", name: "Photo", ...centerBox(Math.round(u * 0.6), Math.round(u * 0.4)) });
        if (k === "upload") pickImage(selEl() && selEl().type === "image" ? S.sel : null);
      };
      const gf = $("#genForm", body);
      if (gf) gf.onsubmit = e => {
        e.preventDefault();
        const p = $("#genPrompt", body).value.trim();
        if (p.length < 3) return toast("Describe the image first.", "bad");
        generateImage(p, selEl() && selEl().type === "image" ? S.sel : null);
      };
    } else if (S.leftTab === "layers") {
      const els = [...S.d.elements].reverse();
      body.innerHTML = els.length ? `<ul class="layers">${els.map(e => `
        <li class="${e.id === S.sel ? "on" : ""}${e.hidden ? " off" : ""}" data-id="${esc(e.id)}">
          <span class="lic">${{ text: "T", rect: "▭", ellipse: "◯", image: "▣", logo: "◆" }[e.type]}</span>
          <span class="lname">${esc(e.name || (e.type === "text" ? e.text.split("\n")[0] : e.type))}</span>
          <button class="btn ghost icon xs" data-act="up" title="Bring forward">↑</button>
          <button class="btn ghost icon xs" data-act="down" title="Send backward">↓</button>
          <button class="btn ghost icon xs" data-act="hide" title="${e.hidden ? "Show" : "Hide"}">${e.hidden ? "◌" : "●"}</button>
          <button class="btn ghost icon xs" data-act="lock" title="${e.locked ? "Unlock" : "Lock"}">${e.locked ? "🔒" : "🔓"}</button>
        </li>`).join("")}</ul><p class="hint">Top of the list is drawn on top.</p>` : `<p class="hint">No elements yet. Add some from the Add tab, or ask the AI Assistant.</p>`;
      body.onclick = e => {
        const li = e.target.closest("li[data-id]");
        if (!li) return;
        const id = li.dataset.id, act = e.target.closest("[data-act]");
        const el = find(id);
        if (act && el) {
          const a = act.dataset.act;
          if (a === "up") reorder(id, "forward");
          if (a === "down") reorder(id, "backward");
          if (a === "hide") { update(id, { hidden: !el.hidden }); drawPanels(); }
          if (a === "lock") { update(id, { locked: !el.locked }); drawPanels(); }
          return;
        }
        S.sel = id; drawOverlay(); drawPanels();
      };
    } else if (S.leftTab === "brand") {
      body.innerHTML = `
        <h4>Colors</h4>
        <div class="swatches big">${catalog.brand.colors.map(c => `<button class="swatch" style="background:${c.hex}" data-hex="${c.hex}" title="${esc(c.name)} ${c.hex}"></button>`).join("")}</div>
        <p class="hint">Click a color to apply it to the selected element${S.sel ? "" : " (or the background, with nothing selected)"}.</p>
        <h4>Fonts</h4>
        <p class="fontdemo" style="font-family:Archivo;font-weight:800;letter-spacing:.08em">ARCHIVO · HEADLINES</p>
        <p class="fontdemo" style="font-family:Inter">Inter · body copy and details</p>
        <h4>Rules</h4>
        <ul class="rules">${catalog.brand.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
        <button class="btn" id="bcheck" style="width:100%;margin-top:10px">Run brand check</button>`;
      body.onclick = e => {
        const sw = e.target.closest("[data-hex]");
        if (sw) {
          const el = selEl(), hex = sw.dataset.hex;
          if (!el) commit(() => { S.d.background = hex; });
          else if (el.type === "text" || el.type === "logo") update(el.id, { color: hex });
          else if (el.type === "rect" || el.type === "ellipse") update(el.id, { fill: hex });
          drawPanels();
        }
        if (e.target.id === "bcheck") { S.rightTab = "sop"; drawPanels(); }
      };
    } else if (S.leftTab === "tpl") {
      body.innerHTML = `<p class="hint">Applying a template replaces the current layout (you can undo).</p><div class="tplmini">${catalog.templates.map(t => `
        <button class="tplcard" data-tpl="${t.id}" title="${esc(t.name)} · ${t.width}×${t.height}">
          <span class="thumbwrap">${renderSVG({ ...t, background: "#FFFFFF" }, { width: "100%", height: "100%", idPrefix: "m" + t.id })}</span>
          <span>${esc(t.name)}</span></button>`).join("")}</div>`;
      body.onclick = async e => {
        const b = e.target.closest("[data-tpl]");
        if (!b) return;
        const t = catalog.templates.find(x => x.id === b.dataset.tpl);
        if (S.d.elements.length && !(await confirmBox("Apply template?", `Replace this layout with "${t.name}" (${t.width}×${t.height})? You can undo.`, "Apply"))) return;
        commit(() => applyTemplate(S.d, t));
        S.sel = null; fit(); drawPanels();
      };
    }
  }

  function colorField(label, key, value, allowNone) {
    return `<div class="field"><label>${label}</label><div class="colorrow">
      <input type="color" data-k="${key}" value="${value || "#FFFFFF"}">
      <div class="swatches">${brandHex.map(c => `<button class="swatch" style="background:${c}" data-set="${key}" data-v="${c}" title="${c}"></button>`).join("")}
      ${allowNone ? `<button class="swatch none" data-set="${key}" data-v="" title="None">∅</button>` : ""}</div></div></div>`;
  }
  const numField = (label, key, v, attrs = "") => `<div class="field"><label>${label}</label><input type="number" data-k="${key}" value="${v}" ${attrs}></div>`;

  function drawRight() {
    const body = $("#rbody", view);
    body.classList.toggle("chatmode", S.rightTab === "ai");
    if (S.rightTab === "props") drawProps(body);
    else if (S.rightTab === "sop") drawSop(body);
    else drawAi(body);
  }

  function drawProps(body) {
    const e = selEl();
    if (!e) {
      body.innerHTML = `
        <h4>Canvas</h4>
        <div class="row2">${numField("Width", "cw", S.d.width, 'min="16" max="8000"')}${numField("Height", "ch", S.d.height, 'min="16" max="8000"')}</div>
        <div class="field"><label>Size presets</label><select id="preset"><option value="">Choose a size…</option>${catalog.sizes.map((s, i) => `<option value="${i}">${esc(s.name)} · ${s.width}×${s.height}</option>`).join("")}</select></div>
        <label class="check"><input type="checkbox" id="scaleC" checked> Scale content when resizing</label>
        ${colorField("Background", "bg", S.d.background)}
        <h4>Brief</h4>
        <p class="hint">${S.d.brief.goal ? esc(S.d.brief.goal) : "No brief yet. Fill it in on the Workflow tab, or ask the AI Assistant to write one."}</p>
        <p class="hint">Tip: click an element to edit it. Double-click text to type. Hold Shift while resizing to keep proportions; Alt disables snapping.</p>`;
      const resize = (w, hh) => commit(() => D.ops.set_canvas(S.d, { width: w, height: hh, scale_content: $("#scaleC", body).checked }));
      body.oninput = null;
      body.onchange = ev => {
        const k = ev.target.dataset.k;
        if (k === "cw" || k === "ch") { resize(+$('[data-k="cw"]', body).value, +$('[data-k="ch"]', body).value); fit(); drawPanels(); }
        if (k === "bg") { commit(() => { S.d.background = ev.target.value.toUpperCase(); }); }
        if (ev.target.id === "preset" && ev.target.value !== "") { const s = catalog.sizes[+ev.target.value]; resize(s.width, s.height); fit(); drawPanels(); }
      };
      body.onclick = ev => { const b = ev.target.closest("[data-set]"); if (b && b.dataset.set === "bg") { commit(() => { S.d.background = b.dataset.v || S.d.background; }); drawPanels(); } };
      return;
    }
    const fonts = catalog.fonts.map(f => `<option ${f === e.fontFamily ? "selected" : ""}>${esc(f)}</option>`).join("");
    body.innerHTML = `
      <div class="selhead"><b>${{ text: "Text", rect: "Rectangle", ellipse: "Ellipse", image: "Image", logo: "Kam Team mark" }[e.type]}</b>
        <span class="grow"></span>
        <button class="btn ghost icon" data-do="dup" title="Duplicate (Ctrl+D)">⧉</button>
        <button class="btn ghost icon" data-do="front" title="Bring to front">⤒</button>
        <button class="btn ghost icon" data-do="back" title="Send to back">⤓</button>
        <button class="btn ghost icon danger" data-do="del" title="Delete">🗑</button></div>
      <div class="field"><label>Name</label><input data-k="name" value="${esc(e.name)}" placeholder="Layer name"></div>
      ${e.type === "text" ? `
        <div class="field"><label for="p-text">Text</label><textarea id="p-text" data-k="text" rows="3">${esc(e.text)}</textarea></div>
        <div class="row2"><div class="field"><label>Font</label><select data-k="fontFamily">${fonts}</select></div>
          <div class="field"><label>Weight</label><select data-k="fontWeight">${[300, 400, 500, 600, 700, 800, 900].map(w => `<option ${w === e.fontWeight ? "selected" : ""}>${w}</option>`).join("")}</select></div></div>
        <div class="row3">${numField("Size", "fontSize", e.fontSize, 'min="4" max="1000"')}${numField("Line height", "lineHeight", e.lineHeight, 'step="0.05" min="0.6" max="3"')}${numField("Spacing", "letterSpacing", e.letterSpacing, 'step="0.5"')}</div>
        <div class="seg" role="group" aria-label="Alignment">${["left", "center", "right"].map(a => `<button data-set="align" data-v="${a}" aria-pressed="${e.align === a}">${{ left: "⯇ Left", center: "Center", right: "Right ⯈" }[a]}</button>`).join("")}</div>
        <div class="checks"><label class="check"><input type="checkbox" data-k="uppercase" ${e.uppercase ? "checked" : ""}> UPPERCASE</label><label class="check"><input type="checkbox" data-k="italic" ${e.italic ? "checked" : ""}> Italic</label></div>
        ${colorField("Color", "color", e.color)}` : ""}
      ${e.type === "rect" || e.type === "ellipse" ? `
        ${colorField("Fill", "fill", e.fill, true)}
        ${colorField("Border", "stroke", e.stroke, true)}
        <div class="row2">${numField("Border width", "strokeWidth", e.strokeWidth, 'min="0" max="200"')}${e.type === "rect" ? numField("Corner radius", "radius", e.radius, 'min="0"') : ""}</div>` : ""}
      ${e.type === "image" ? `
        <div class="imgacts"><button class="btn" data-do="replace">${e.src ? "Replace image" : "Upload image"}</button>
        ${e.src ? `<button class="btn ghost" data-do="clear">Clear</button>` : ""}</div>
        ${config.images ? `<form class="stack" id="regen"><textarea rows="2" id="regenP" placeholder="Describe an image to generate here">${esc(e.prompt)}</textarea><button class="btn">✦ Generate into this frame</button></form>` : ""}
        <div class="seg">${["cover", "contain"].map(f => `<button data-set="fit" data-v="${f}" aria-pressed="${e.fit === f}">${f === "cover" ? "Fill frame" : "Fit inside"}</button>`).join("")}</div>
        ${numField("Corner radius", "radius", e.radius, 'min="0"')}` : ""}
      ${e.type === "logo" ? colorField("Color", "color", e.color) + `<p class="hint">Keep the mark black or white, never stretched.</p>` : ""}
      <h4>Position</h4>
      <div class="row2">${numField("X", "x", Math.round(e.x))}${numField("Y", "y", Math.round(e.y))}</div>
      <div class="row2">${numField("Width", "w", Math.round(e.w), 'min="1"')}${numField("Height", "h", Math.round(e.h), 'min="1"')}</div>
      <div class="row2">${numField("Rotation °", "rotation", e.rotation, 'min="-360" max="360"')}<div class="field"><label>Opacity ${Math.round(e.opacity * 100)}%</label><input type="range" data-k="opacity" min="0" max="1" step="0.01" value="${e.opacity}"></div></div>
      <div class="seg" role="group" aria-label="Align on canvas">
        <button data-align="left" title="Align left">⇤</button><button data-align="hcenter" title="Center horizontally">↔</button><button data-align="right" title="Align right">⇥</button>
        <button data-align="top" title="Align top">⤒</button><button data-align="vcenter" title="Center vertically">↕</button><button data-align="bottom" title="Align bottom">⤓</button></div>`;

    const val = t => (t.type === "checkbox" ? t.checked : t.type === "number" || t.type === "range" ? Number(t.value) : t.type === "color" ? t.value.toUpperCase() : t.value);
    // Typing in a field is one undo step: the first keystroke records history, the rest don't.
    let typingKey = null;
    body.oninput = ev => {
      const k = ev.target.dataset.k;
      if (!k || ev.target.type === "number") return;
      update(e.id, { [k]: val(ev.target) }, { quiet: typingKey === k });
      typingKey = k;
      if (k === "opacity") ev.target.previousElementSibling.textContent = `Opacity ${Math.round(val(ev.target) * 100)}%`;
    };
    body.onchange = ev => {
      const k = ev.target.dataset.k;
      typingKey = null;
      if (!k) return;
      if (ev.target.type === "number" || ev.target.tagName === "SELECT" || ev.target.type === "checkbox") { update(e.id, { [k]: val(ev.target) }); drawPanels(); }
    };
    body.onclick = ev => {
      const set = ev.target.closest("[data-set]"), act = ev.target.closest("[data-do]"), al = ev.target.closest("[data-align]");
      if (set) { update(e.id, { [set.dataset.set]: set.dataset.v }); drawPanels(); }
      if (al) {
        const a = al.dataset.align, m = Math.round(Math.min(S.d.width, S.d.height) * 0.06);
        const p = { left: { x: m }, right: { x: S.d.width - e.w - m }, hcenter: { x: Math.round((S.d.width - e.w) / 2) }, top: { y: m }, bottom: { y: S.d.height - e.h - m }, vcenter: { y: Math.round((S.d.height - e.h) / 2) } }[a];
        update(e.id, p); drawPanels();
      }
      if (!act) return;
      const a = act.dataset.do;
      if (a === "dup") duplicate(e.id);
      if (a === "del") remove(e.id);
      if (a === "front") reorder(e.id, "front");
      if (a === "back") reorder(e.id, "back");
      if (a === "replace") pickImage(e.id);
      if (a === "clear") { update(e.id, { src: "" }); drawPanels(); }
    };
    const rg = $("#regen", body);
    if (rg) rg.onsubmit = ev => { ev.preventDefault(); const p = $("#regenP", body).value.trim(); if (p.length < 3) return toast("Describe the image first.", "bad"); generateImage(p, e.id); };
  }

  /* ---------------- SOP workflow ---------------- */
  function drawSop(body) {
    const sop = catalog.sop;
    const idx = Math.max(0, sop.findIndex(s => s.id === S.d.stage));
    const report = D.brandCheck(S.d, brandHex);
    const done = s => s.checklist.every(c => S.d.checks[`${s.id}.${c.id}`]);
    body.innerHTML = `
      <ol class="stepper">${sop.map((s, i) => `<li class="${i < idx ? "past" : i === idx ? "now" : ""}${done(s) ? " done" : ""}"><button data-stage="${s.id}"><span class="n">${done(s) ? "✓" : i + 1}</span>${esc(s.name)}</button></li>`).join("")}</ol>
      <div class="stagecard"><b>${esc(sop[idx].name)}</b><p>${esc(sop[idx].goal)}</p>
        <ul class="checklist">${sop[idx].checklist.map(c => { const k = `${sop[idx].id}.${c.id}`; return `<li><label class="check"><input type="checkbox" data-check="${k}" ${S.d.checks[k] ? "checked" : ""}> ${esc(c.label)}</label></li>`; }).join("")}</ul>
        ${sop[idx].id === "brief" ? briefForm() : ""}
        ${sop[idx].id === "approve" ? `<div class="field"><label>Approver</label><input data-brief="approver" value="${esc(S.d.brief.approver)}" placeholder="Who signs off?"></div>` : ""}
        ${sop[idx].id === "export" ? `<div class="dlgrid">${["png", "png2", "jpg", "pdf", "svg", "json"].map(f => `<button class="btn sm" data-fmt="${f}">${{ png: "PNG", png2: "PNG @2x", jpg: "JPG", pdf: "PDF", svg: "SVG", json: "Source" }[f]}</button>`).join("")}</div>` : ""}
        <div class="stagenav">${idx > 0 ? `<button class="btn sm" data-go="${sop[idx - 1].id}">← ${esc(sop[idx - 1].name)}</button>` : "<span></span>"}
        ${idx < sop.length - 1 ? `<button class="btn primary sm" data-go="${sop[idx + 1].id}">${done(sop[idx]) ? "" : "Skip to "}${esc(sop[idx + 1].name)} →</button>` : `<span class="tag">Final stage</span>`}</div>
      </div>
      <h4>Brand check <span class="score ${report.score >= 85 ? "good" : report.score >= 60 ? "mid" : "bad"}">${report.score}/100</span></h4>
      ${report.issues.length ? `<ul class="issues">${report.issues.map(i => `<li class="${i.level}" ${i.elementId ? `data-sel="${esc(i.elementId)}"` : ""}><span class="lvl">${{ error: "Fix", warn: "Check", info: "Tip" }[i.level]}</span>${esc(i.message)}</li>`).join("")}</ul>` : `<p class="hint good">No issues found. Nice work.</p>`}
      ${config.assistant ? `<button class="btn" id="aiFix" style="width:100%;margin-top:8px">✦ Ask AI to fix these</button>` : ""}`;
    body.oninput = ev => {
      const b = ev.target.dataset.brief;
      if (b) silent(() => { S.d.brief[b] = ev.target.value.slice(0, 600); });
    };
    body.onchange = ev => {
      const k = ev.target.dataset.check;
      if (k) { commit(() => { if (ev.target.checked) S.d.checks[k] = true; else delete S.d.checks[k]; }); drawPanels(); }
    };
    body.onclick = async ev => {
      const st = ev.target.closest("[data-stage],[data-go]"), sel = ev.target.closest("[data-sel]"), fmt = ev.target.closest("[data-fmt]");
      if (st) {
        const to = st.dataset.stage || st.dataset.go;
        if ((to === "approve" || to === "export") && report.issues.some(i => i.level === "error") &&
          !(await confirmBox("Brand check has issues", "The brand check still shows things to fix. Move on anyway?", "Move on"))) return;
        if (to === "export" && !S.d.brief.approver && !(await confirmBox("No approver yet", "The SOP asks for a named approver before export. Continue anyway?", "Continue"))) return;
        commit(() => { S.d.stage = to; }); drawPanels();
      }
      if (sel) { S.sel = sel.dataset.sel; drawOverlay(); }
      if (fmt) doDownload(fmt.dataset.fmt);
      if (ev.target.id === "aiFix") { S.rightTab = "ai"; drawPanels(); send("Run the brand check and fix every issue you can. Tell me what's left for me to do."); }
    };
  }
  function briefForm() {
    const f = (k, label, ph) => `<div class="field"><label>${label}</label><input data-brief="${k}" value="${esc(S.d.brief[k])}" placeholder="${esc(ph)}"></div>`;
    return `<div class="brief">${f("goal", "Goal", "e.g. Get 20 RSVPs for Saturday's open house")}${f("audience", "Audience", "e.g. First-time buyers in North Park")}${f("channel", "Channel", "e.g. Instagram feed + Story")}${f("message", "Key message", "e.g. Modern 3-bed, walk to parks, open Sat 1-4")}${f("cta", "Call to action", "e.g. RSVP at the link in bio")}
      <div class="field"><label>Notes</label><textarea data-brief="notes" rows="2">${esc(S.d.brief.notes)}</textarea></div></div>`;
  }

  /* ---------------- AI assistant ---------------- */
  function drawAi(body) {
    if (!config.assistant) {
      body.innerHTML = `<div class="empty"><b>The AI Assistant isn't switched on yet.</b><p>Your admin needs to add an <code>ANTHROPIC_API_KEY</code> to the server. Meanwhile, templates, the brand check and the AI Tools guide all work.</p></div>`;
      return;
    }
    body.innerHTML = `
      <div class="ailog" id="ailog" aria-live="polite"></div>
      <div class="aisugg" id="aisugg"></div>
      <form class="aiform" id="aiform">
        <textarea id="aiin" rows="2" placeholder="Tell the assistant what to make or change…" aria-label="Message"></textarea>
        <div class="airow"><label class="check"><input type="checkbox" id="seeC" ${S.seeCanvas ? "checked" : ""}> Let AI see the canvas</label>
        <span class="grow"></span><button type="button" class="btn ghost sm" id="aiNew" title="Clear this conversation">Clear</button>
        <button class="btn primary sm" id="aiSend">${S.busy ? "Stop" : "Send"}</button></div>
      </form>`;
    drawLog();
    const input = $("#aiin", body);
    $("#aiform", body).onsubmit = e => { e.preventDefault(); if (S.busy) { S.abort && S.abort.abort(); return; } send(input.value); };
    input.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!S.busy) send(input.value); } };
    $("#seeC", body).onchange = e => { S.seeCanvas = e.target.checked; store.set("seeCanvas", S.seeCanvas); };
    $("#aiNew", body).onclick = () => { silent(() => { S.d.chat = []; }); drawAi(body); };
    if (ctx.startPrompt) { const p = ctx.startPrompt; ctx.startPrompt = null; send(p.text, p.hint); }
    else setTimeout(() => input.focus(), 0);
  }
  function drawLog(live) {
    const log = $("#ailog", view);
    if (!log) return;
    const hello = `<div class="msg bot">Hi! I'm Kam, your design assistant. Tell me what you need, like <i>"Just listed post for 12 Oak St, 3 bd 2 ba, $899K"</i>, and I'll build it on the canvas. I can also rewrite copy, fix brand issues, resize for other channels, and suggest the best AI tool for photos.</div>`;
    log.innerHTML = hello + S.d.chat.map(m => `<div class="msg ${m.role === "user" ? "user" : "bot"}">${m.role === "user" ? esc(m.content) : md(m.content)}</div>`).join("") + (live || "");
    const sugg = $("#aisugg", view);
    if (sugg) {
      const ideas = S.d.elements.length
        ? ["Make the headline punchier", "Run the brand check and fix issues", "Resize this for an Instagram Story", "Write an Instagram caption for this", "Which AI tool should I use for the photo?"]
        : ["Just listed post: 4 bd, 3 ba, $1.25M, ocean views", "Open house flyer for Saturday 1-4 PM", "Market update post with 3 stats", "Business card for a new agent"];
      sugg.innerHTML = S.busy ? "" : ideas.map(q => `<button class="chip" type="button">${esc(q)}</button>`).join("");
      sugg.onclick = e => { const b = e.target.closest(".chip"); if (b) send(b.textContent); };
    }
    log.scrollTop = log.scrollHeight;
  }

  // Images stay in the browser: the AI gets "asset:<id>" references instead of pixels.
  function forAi() {
    const assets = {};
    const d = JSON.parse(JSON.stringify(S.d));
    delete d.thumb; delete d.chat;
    for (const e of d.elements) if (e.type === "image" && e.src) { assets[e.id] = e.src; e.src = "asset:" + e.id; }
    return { d, assets };
  }

  // `hint` is extra context for the AI that isn't shown in the chat.
  async function send(text, hint = "") {
    text = String(text || "").trim();
    if (!text || S.busy) return;
    if (S.rightTab !== "ai") { S.rightTab = "ai"; drawPanels(); }
    S.busy = true;
    const input = $("#aiin", view);
    if (input) input.value = "";
    silent(() => { S.d.chat.push({ role: "user", content: text.slice(0, 6000) }); });
    $("#aiSend", view).textContent = "Stop";
    const { d, assets } = forAi();
    let shot = null;
    if (S.seeCanvas) shot = await snapshot(S.d, 1024, 0.8).catch(() => null);
    let reply = "", steps = [], error = "", newDesign = null;
    const live = () => `<div class="msg bot">${steps.length ? `<ul class="steps">${steps.map(s => `<li class="${s.state}">${esc(s.label)}${s.message ? ` <span class="muted">· ${esc(s.message)}</span>` : ""}</li>`).join("")}</ul>` : ""}${reply ? md(reply) : `<span class="typing"><i></i><i></i><i></i></span>`}</div>`;
    drawLog(live());
    S.abort = new AbortController();
    const history = S.d.chat.slice(-20).map(m => ({ ...m }));
    if (hint) history[history.length - 1].content += "\n\n" + hint;
    await stream("/api/assistant", { mode: "design", messages: history, design: d, snapshot: shot }, ev => {
      if (ev.t) reply += ev.t;
      if (ev.tool) steps.push({ name: ev.tool.name, label: ev.tool.label, state: "run" });
      if (ev.toolDone) { const s = [...steps].reverse().find(x => x.name === ev.toolDone.name && x.state === "run"); if (s) { s.state = ev.toolDone.ok ? "ok" : "bad"; s.message = ev.toolDone.message; } }
      if (ev.design) newDesign = ev.design;
      if (ev.error) error = ev.error;
      if (!S.destroyed) drawLog(live());
    }, S.abort.signal);
    S.busy = false; S.abort = null;
    if (S.destroyed) return;
    if (newDesign) {
      for (const e of newDesign.elements) if (e.type === "image" && e.src && e.src.startsWith("asset:")) e.src = assets[e.src.slice(6)] || "";
      // The AI can't measure fonts, so text it added or rewrote shrinks (to 60% at most) to fit its box.
      for (const e of newDesign.elements) {
        if (e.type !== "text") continue;
        const old = find(e.id);
        if (old && old.text === e.text && old.fontSize === e.fontSize && old.w === e.w && old.h === e.h) continue;
        const min = e.fontSize * 0.6;
        while (textHeight(e) > e.h * 1.08 && e.fontSize > min) e.fontSize = Math.round(e.fontSize * 0.95 * 10) / 10;
        e.h = Math.max(e.h, Math.ceil(textHeight(e)));
      }
      commit(() => {
        const chat = S.d.chat, thumb = S.d.thumb;
        S.d = { ...newDesign, chat, thumb, id: S.d.id, created: S.d.created };
      });
      if (S.sel && !find(S.sel)) S.sel = null;
      fit();
    }
    const okSteps = steps.filter(s => s.state === "ok").length;
    const stepsNote = okSteps ? `\n\n*${okSteps} change${okSteps === 1 ? "" : "s"} applied · Ctrl+Z to undo*` : "";
    const content = (reply.trim() || (error ? "" : "Done.")) + (newDesign ? stepsNote : "");
    if (content) silent(() => { S.d.chat.push({ role: "assistant", content: content.slice(0, 8000) }); });
    if (error) toast(error, "bad");
    drawPanels();
  }

  /* ---------------- Download ---------------- */
  async function doDownload(fmt) {
    $("#dlMenu", view).classList.add("hidden");
    try {
      await download(S.d, fmt);
      if (fmt !== "json" && !S.d.checks["export.format"]) commit(() => { S.d.checks["export.format"] = true; });
      toast("Downloaded", "good");
    } catch (e) { toast("Couldn't export: " + e.message, "bad"); }
  }

  /* ---------------- Toolbar wiring ---------------- */
  $("#undo", view).onclick = undo;
  $("#redo", view).onclick = redo;
  $("#zin", view).onclick = () => setZoom(S.zoom * 1.2);
  $("#zout", view).onclick = () => setZoom(S.zoom / 1.2);
  $("#zfit", view).onclick = fit;
  $("#dname", view).onchange = e => commit(() => { S.d.name = e.target.value.trim().slice(0, 100) || "Untitled design"; });
  $("#dlBtn", view).onclick = e => { e.stopPropagation(); $("#dlMenu", view).classList.toggle("hidden"); };
  $("#dlMenu", view).onclick = e => { const b = e.target.closest("[data-fmt]"); if (b) doDownload(b.dataset.fmt); };
  function closeMenus(e) { if (!e.target.closest(".menu-wrap")) { const m = $("#dlMenu", view); if (m) m.classList.add("hidden"); } }
  document.addEventListener("click", closeMenus);
  window.addEventListener("resize", fit);

  drawPanels();
  requestAnimationFrame(fit);
  if (document.fonts) document.fonts.ready.then(() => !S.destroyed && draw());
}

// Replaces a design's layout with a template (fresh element ids).
export function applyTemplate(d, t) {
  const p = window.KamDesign.newId();
  d.width = t.width; d.height = t.height; d.templateId = t.id;
  d.elements = t.elements.map(e => ({ ...JSON.parse(JSON.stringify(e)), id: p + e.id }));
  d.background = d.elements[0] && d.elements[0].type === "rect" ? d.elements[0].fill || "#FFFFFF" : "#FFFFFF";
}

export { copyText };
