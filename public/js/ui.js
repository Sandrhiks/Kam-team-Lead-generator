// Small shared helpers: DOM, API calls, toasts, dialogs, markdown, streaming.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = (p = "d") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem("kds." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kds." + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/* ---------------- API ---------------- */
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = "GET", body, signal } = {}) {
  let r;
  try {
    r = await fetch(path, {
      method, signal, credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith("/auth/")) { location.href = "/login"; throw new ApiError("Signed out", 401); }
  if (!r.ok) throw new ApiError(j.error || `Request failed (${r.status})`, r.status);
  return j;
}

// POSTs and reads a server-sent event stream, calling onEvent for each JSON event.
export async function stream(path, body, onEvent, signal) {
  let r;
  try {
    r = await fetch(path, { method: "POST", credentials: "same-origin", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    if (e.name === "AbortError") return;
    return onEvent({ error: "Couldn't reach the assistant. Check your connection and try again." });
  }
  if (r.status === 401) { location.href = "/login"; return; }
  if (!r.ok) return onEvent({ error: (await r.json().catch(() => ({}))).error || "The assistant isn't available right now." });
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (line.startsWith("data: ")) { try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip */ } }
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") onEvent({ error: "The connection dropped. Try again." });
  }
}

/* ---------------- Toasts & dialogs ---------------- */
export function toast(msg, kind = "") {
  const box = $("#toasts");
  const t = h(`<div class="toast ${kind}" role="status">${esc(msg)}</div>`);
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 3200);
}

// Opens a modal. `build(el, close)` fills it; resolves with the value passed to close().
export function modal(title, build, { wide = false } = {}) {
  return new Promise(resolve => {
    const dlg = h(`<dialog class="modal${wide ? " wide" : ""}"><div class="mhead"><h2>${esc(title)}</h2><button class="btn ghost icon" data-x aria-label="Close">✕</button></div><div class="mbody"></div></dialog>`);
    document.body.appendChild(dlg);
    let value;
    const close = v => { value = v; dlg.close(); };
    dlg.addEventListener("close", () => { dlg.remove(); resolve(value); });
    dlg.querySelector("[data-x]").onclick = () => close();
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
    build(dlg.querySelector(".mbody"), close);
    dlg.showModal();
  });
}

export function confirmBox(title, text, okLabel = "OK", danger = false) {
  return modal(title, (el, close) => {
    el.innerHTML = `<p style="margin:0 0 18px">${esc(text)}</p><div class="mfoot"><button class="btn" data-no>Cancel</button><button class="btn primary ${danger ? "dangerbg" : ""}" data-ok>${esc(okLabel)}</button></div>`;
    el.querySelector("[data-no]").onclick = () => close(false);
    el.querySelector("[data-ok]").onclick = () => close(true);
    setTimeout(() => el.querySelector("[data-ok]").focus(), 0);
  }).then(v => v === true);
}

export function promptBox(title, label, value = "") {
  return modal(title, (el, close) => {
    el.innerHTML = `<form><div class="field"><label>${esc(label)}</label><input value="${esc(value)}" maxlength="100"></div><div class="mfoot"><button type="button" class="btn" data-no>Cancel</button><button class="btn primary">Save</button></div></form>`;
    const input = el.querySelector("input");
    el.querySelector("[data-no]").onclick = () => close(null);
    el.querySelector("form").onsubmit = e => { e.preventDefault(); close(input.value.trim()); };
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Couldn't copy. Select the text and copy it instead.", "bad"); }
}

/* ---------------- Markdown (safe subset) ---------------- */
export function md(src) {
  const blocks = [];
  let s = esc(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const inline = t => t
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = [];
  let list = null;
  const endList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of s.split("\n")) {
    let m;
    if ((m = line.match(/^\u0000(\d+)\u0000$/))) { endList(); out.push(blocks[+m[1]]); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { endList(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== "ul") { endList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== "ol") { endList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    endList();
    if (line.trim() === "") out.push("");
    else out.push(`<p>${inline(line).replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i])}</p>`);
  }
  endList();
  return out.join("\n");
}

export function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

// Reads an image file and downsizes it so designs stay light. Returns a data URL.
export function readImageFile(file, maxSide = 2400) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return reject(new Error("Use a PNG, JPG, WebP, GIF or SVG image."));
    if (file.size > 25 * 1024 * 1024) return reject(new Error("That image is over 25 MB."));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Couldn't read the file."));
    fr.onload = () => {
      if (file.type === "image/svg+xml") {
        if (fr.result.length > 110 * 1024) return reject(new Error("SVG files must be under 80 KB."));
        return resolve(fr.result);
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't open that image."));
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const png = file.type === "image/png" || file.type === "image/gif";
        let url = c.toDataURL(png ? "image/png" : "image/jpeg", 0.9);
        if (png && url.length > 5.5 * 1024 * 1024) url = c.toDataURL("image/jpeg", 0.88);
        resolve({ src: url, width: c.width, height: c.height });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }).then(r => (typeof r === "string" ? { src: svgToBase64(r), width: 800, height: 800 } : r));
}

function svgToBase64(dataUrl) {
  if (dataUrl.includes(";base64,")) return dataUrl;
  return "data:image/svg+xml;base64," + btoa(unescape(decodeURIComponent(dataUrl.split(",")[1])));
}
