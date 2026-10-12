// Rendering for designs: one text layout shared by the SVG renderer (editor, previews,
// SVG download) and the canvas renderer (PNG, JPG, PDF, thumbnails, AI snapshots), so
// what you see in the editor is what you download.

export const LOGO_POLYS = ["374,0 748,403 628,515 374,242 120,515 0,403", "120,583 374,856 628,583 748,695 374,1098 0,695"];
const FONT_URL = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Inter:wght@300..800&family=Playfair+Display:wght@400..900&family=Montserrat:wght@300..900&family=Bebas+Neue&family=DM+Serif+Display&family=Space+Grotesk:wght@300..700&display=swap";

const measureCtx = document.createElement("canvas").getContext("2d");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fontCss = e => `${e.italic ? "italic " : ""}${e.fontWeight} ${e.fontSize}px "${e.fontFamily}"`;

/* ---------------- Text layout ---------------- */
function textWidth(s, e) {
  measureCtx.font = fontCss(e);
  return measureCtx.measureText(s).width + e.letterSpacing * Math.max(0, [...s].length - 1);
}

// Splits text into lines that fit the element width. Returns [{ text, width }].
export function layoutText(e) {
  const src = e.uppercase ? e.text.toUpperCase() : e.text;
  const out = [];
  for (const para of src.split("\n")) {
    const words = para.split(/(\s+)/).filter(w => w.length);
    let line = "";
    for (const w of words) {
      const next = line + w;
      if (!line || textWidth(next.trimEnd(), e) <= e.w + 0.5) { line = next; continue; }
      out.push(line.trimEnd());
      line = /^\s+$/.test(w) ? "" : w;
      // A single word wider than the box: break it by characters.
      while (textWidth(line, e) > e.w && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && textWidth(line.slice(0, k), e) > e.w) k--;
        out.push(line.slice(0, k));
        line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out.map(t => ({ text: t, width: textWidth(t, e) }));
}

// Baseline of line i, so the glyphs sit centred in each line box.
const baseline = (e, i) => e.y + i * e.fontSize * e.lineHeight + (e.fontSize * e.lineHeight - e.fontSize) / 2 + e.fontSize * 0.8;
const lineX = (e, l) => (e.align === "center" ? e.x + (e.w - l.width) / 2 : e.align === "right" ? e.x + e.w - l.width : e.x);

export function textHeight(e) {
  return layoutText(e).length * e.fontSize * e.lineHeight;
}

/* ---------------- SVG ---------------- */
// opts.assets: map of element id -> image src, for "asset:" references.
// opts.editor: adds data-id attributes and placeholder labels.
export function renderSVG(d, opts = {}) {
  const assets = opts.assets || {};
  const parts = [];
  let clip = 0;
  const srcOf = e => (e.src && e.src.startsWith("asset:") ? assets[e.id] || "" : e.src);
  for (const e of d.elements) {
    if (e.hidden && !opts.showHidden) continue;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const attrs = `${opts.editor ? ` data-id="${esc(e.id)}"` : ""}${e.rotation ? ` transform="rotate(${e.rotation} ${cx} ${cy})"` : ""}${e.opacity < 1 ? ` opacity="${e.opacity}"` : ""}`;
    let body = "";
    if (e.type === "rect") {
      body = `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${Math.min(e.radius, e.w / 2, e.h / 2)}" fill="${e.fill || "none"}"${e.stroke && e.strokeWidth ? ` stroke="${e.stroke}" stroke-width="${e.strokeWidth}"` : ""}/>`;
    } else if (e.type === "ellipse") {
      body = `<ellipse cx="${cx}" cy="${cy}" rx="${e.w / 2}" ry="${e.h / 2}" fill="${e.fill || "none"}"${e.stroke && e.strokeWidth ? ` stroke="${e.stroke}" stroke-width="${e.strokeWidth}"` : ""}/>`;
    } else if (e.type === "image") {
      const src = srcOf(e);
      const id = `c${opts.idPrefix || ""}${clip++}`;
      if (src) {
        body = `<clipPath id="${id}"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${Math.min(e.radius, e.w / 2, e.h / 2)}"/></clipPath>` +
          `<image href="${esc(src)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="xMidYMid ${e.fit === "contain" ? "meet" : "slice"}" clip-path="url(#${id})"/>`;
      } else {
        const s = Math.min(e.w, e.h) * 0.12;
        body = `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${Math.min(e.radius, e.w / 2, e.h / 2)}" fill="#2C2C2C"/>` +
          `<g fill="none" stroke="#62625E" stroke-width="${Math.max(2, s / 10)}" stroke-linejoin="round"><rect x="${cx - s}" y="${cy - s * 0.75}" width="${s * 2}" height="${s * 1.5}" rx="${s / 6}"/><path d="M${cx - s} ${cy + s * 0.5} L${cx - s * 0.3} ${cy - s * 0.15} L${cx + s * 0.2} ${cy + s * 0.3} L${cx + s * 0.5} ${cy} L${cx + s} ${cy + s * 0.5}"/><circle cx="${cx + s * 0.45}" cy="${cy - s * 0.35}" r="${s / 6}"/></g>` +
          (opts.editor ? `<text x="${cx}" y="${cy + s * 1.35}" text-anchor="middle" font-family="Inter, sans-serif" font-size="${Math.max(12, s * 0.38)}" fill="#9C9C98">Photo · upload or generate</text>` : "");
      }
    } else if (e.type === "logo") {
      body = `<svg x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" viewBox="0 0 748 1098" preserveAspectRatio="xMidYMid meet">${LOGO_POLYS.map(p => `<polygon fill="${e.color}" points="${p}"/>`).join("")}</svg>`;
    } else if (e.type === "text") {
      const lines = layoutText(e);
      body = `<text font-family="'${esc(e.fontFamily)}', sans-serif" font-size="${e.fontSize}" font-weight="${e.fontWeight}"${e.italic ? ' font-style="italic"' : ""} fill="${e.color}"${e.letterSpacing ? ` letter-spacing="${e.letterSpacing}"` : ""} xml:space="preserve">` +
        lines.map((l, i) => `<tspan x="${lineX(e, l)}" y="${baseline(e, i)}">${esc(l.text)}</tspan>`).join("") + "</text>";
      if (opts.editor) body = `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${Math.max(e.h, lines.length * e.fontSize * e.lineHeight)}" fill="transparent"/>` + body;
    }
    parts.push(`<g${attrs}>${body}</g>`);
  }
  const fonts = opts.export ? `<defs><style>@import url('${FONT_URL.replace(/&/g, "&amp;")}');</style></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${opts.width || d.width}" height="${opts.height || d.height}"${opts.editor ? ' class="art"' : ""}>${fonts}<rect width="${d.width}" height="${d.height}" fill="${d.background}"/>${parts.join("")}</svg>`;
}

/* ---------------- Canvas ---------------- */
const imgCache = new Map();
function loadImage(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't load an image"));
      img.src = src;
    }));
    if (imgCache.size > 80) imgCache.delete(imgCache.keys().next().value);
  }
  return imgCache.get(src);
}

async function fontsReady(d) {
  if (!document.fonts) return;
  const wanted = new Set(d.elements.filter(e => e.type === "text").map(e => fontCss({ ...e, fontSize: 32 })));
  await Promise.all([...wanted].map(f => document.fonts.load(f).catch(() => {})));
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

// Draws the design onto a new canvas at the given scale.
export async function renderCanvas(d, { scale = 1, assets = {}, maxSide } = {}) {
  if (maxSide) scale = Math.min(scale, maxSide / Math.max(d.width, d.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(d.width * scale));
  canvas.height = Math.max(1, Math.round(d.height * scale));
  const ctx = canvas.getContext("2d");
  await fontsReady(d);
  const srcOf = e => (e.src && e.src.startsWith("asset:") ? assets[e.id] || "" : e.src);
  const loaded = new Map();
  await Promise.all(d.elements.filter(e => e.type === "image" && srcOf(e)).map(async e => {
    try { loaded.set(e.id, await loadImage(srcOf(e))); } catch { /* draw as placeholder */ }
  }));

  ctx.scale(scale, scale);
  ctx.fillStyle = d.background;
  ctx.fillRect(0, 0, d.width, d.height);
  for (const e of d.elements) {
    if (e.hidden) continue;
    ctx.save();
    ctx.globalAlpha = e.opacity;
    if (e.rotation) {
      ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
      ctx.rotate(e.rotation * Math.PI / 180);
      ctx.translate(-(e.x + e.w / 2), -(e.y + e.h / 2));
    }
    if (e.type === "rect" || e.type === "ellipse") {
      if (e.type === "rect") roundRect(ctx, e.x, e.y, e.w, e.h, e.radius);
      else { ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2); }
      if (e.fill) { ctx.fillStyle = e.fill; ctx.fill(); }
      if (e.stroke && e.strokeWidth) { ctx.strokeStyle = e.stroke; ctx.lineWidth = e.strokeWidth; ctx.stroke(); }
    } else if (e.type === "image") {
      roundRect(ctx, e.x, e.y, e.w, e.h, e.radius);
      const img = loaded.get(e.id);
      if (!img) { ctx.fillStyle = "#2C2C2C"; ctx.fill(); }
      else {
        ctx.clip();
        const iw = img.naturalWidth || img.width || e.w, ih = img.naturalHeight || img.height || e.h;
        const s = e.fit === "contain" ? Math.min(e.w / iw, e.h / ih) : Math.max(e.w / iw, e.h / ih);
        ctx.drawImage(img, e.x + (e.w - iw * s) / 2, e.y + (e.h - ih * s) / 2, iw * s, ih * s);
      }
    } else if (e.type === "logo") {
      const s = Math.min(e.w / 748, e.h / 1098);
      ctx.translate(e.x + (e.w - 748 * s) / 2, e.y + (e.h - 1098 * s) / 2);
      ctx.scale(s, s);
      ctx.fillStyle = e.color;
      for (const p of LOGO_POLYS) {
        const pts = p.split(" ").map(xy => xy.split(",").map(Number));
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
    } else if (e.type === "text") {
      ctx.font = fontCss(e);
      ctx.fillStyle = e.color;
      ctx.textBaseline = "alphabetic";
      const native = "letterSpacing" in ctx;
      if (native) ctx.letterSpacing = `${e.letterSpacing}px`;
      layoutText(e).forEach((l, i) => {
        const x = lineX(e, l), y = baseline(e, i);
        if (native || !e.letterSpacing) return ctx.fillText(l.text, x, y);
        let cx = x;
        for (const ch of l.text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + e.letterSpacing; }
      });
    }
    ctx.restore();
  }
  return canvas;
}

/* ---------------- Downloads ---------------- */
const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));

// A one-page PDF with the design as a full-bleed JPEG. Print templates (2000px+) are
// treated as 300 DPI, everything else as 96 DPI screen pixels.
export async function renderPDF(d, opts) {
  const dpi = Math.max(d.width, d.height) >= 2000 ? 300 : 96;
  const canvas = await renderCanvas(d, { ...opts, scale: dpi === 300 ? 1 : 2 });
  const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
  const W = (d.width * 72 / dpi).toFixed(2), H = (d.height * 72 / dpi).toFixed(2);
  const enc = new TextEncoder();
  const chunks = [], offsets = [];
  let size = 0;
  const push = b => { const u = typeof b === "string" ? enc.encode(b) : b; chunks.push(u); size += u.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push("\nendstream"); });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push(`<< /Title (${d.name.replace(/[()\\]/g, "")}) /Producer (Kam Team Graphic Designer AI) >>`));
  const xref = size;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

export function fileBase(d) {
  const day = new Date().toISOString().slice(0, 10);
  return `${d.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "design"}_${day}`;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function download(d, format, opts = {}) {
  const base = fileBase(d);
  if (format === "png" || format === "png2") {
    const c = await renderCanvas(d, { ...opts, scale: format === "png2" ? 2 : 1 });
    return saveBlob(await toBlob(c, "image/png"), `${base}${format === "png2" ? "@2x" : ""}.png`);
  }
  if (format === "jpg") {
    const c = await renderCanvas(d, opts);
    return saveBlob(await toBlob(c, "image/jpeg", 0.92), `${base}.jpg`);
  }
  if (format === "pdf") return saveBlob(await renderPDF(d, opts), `${base}.pdf`);
  if (format === "svg") return saveBlob(new Blob([renderSVG(d, { ...opts, export: true })], { type: "image/svg+xml" }), `${base}.svg`);
  if (format === "json") {
    const { thumb, chat, ...src } = d;
    return saveBlob(new Blob([JSON.stringify({ kamDesign: 1, design: src }, null, 1)], { type: "application/json" }), `${base}.kamdesign.json`);
  }
  throw new Error("Unknown format " + format);
}

// Small JPEG used on the dashboard and for the AI's view of the canvas.
export async function snapshot(d, maxSide, quality = 0.75, assets) {
  const c = await renderCanvas(d, { maxSide, assets });
  return c.toDataURL("image/jpeg", quality);
}
