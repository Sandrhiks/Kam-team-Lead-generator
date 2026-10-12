// Design documents: validation, the edit operations the AI assistant can run, and the
// brand check. Plain JavaScript with no dependencies, shared by the server (require) and
// the browser (served as /js/design.js, available as window.KamDesign).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KamDesign = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { elements: 300, text: 2000, chat: 60, chatChars: 8000, svg: 80 * 1024, thumb: 300 * 1024, image: 6 * 1024 * 1024 };
  const TYPES = ["text", "rect", "ellipse", "image", "logo"];
  const STAGES = ["brief", "create", "review", "approve", "export"];
  const DEFAULT_FONTS = ["Archivo", "Inter", "Playfair Display", "Montserrat", "Bebas Neue", "DM Serif Display", "Space Grotesk"];
  const BRAND_HEX = ["#111111", "#FFFFFF", "#F2F2F0", "#2C2C2C", "#9C9C98", "#62625E"];
  const BRIEF_FIELDS = ["goal", "audience", "channel", "message", "cta", "approver", "notes"];

  class DesignError extends Error {}
  const fail = msg => { throw new DesignError(msg); };

  /* ---------------- Primitive cleaners ---------------- */
  const num = (v, min, max, dflt) => {
    const n = Number(v);
    if (v === undefined || v === null || v === "" || !Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  };
  const str = (v, max, dflt = "") => (typeof v === "string" ? v.slice(0, max) : v === undefined || v === null ? dflt : String(v).slice(0, max));
  const hex = (v, dflt) => {
    if (v === "" || v === "none" || v === "transparent") return "";
    const s = String(v || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) return ("#" + s.slice(1).split("").map(c => c + c).join("")).toUpperCase();
    return dflt;
  };
  const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const bool = v => v === true;
  const newId = () => "e" + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7);

  function cleanSrc(v) {
    const s = String(v || "");
    if (!s) return "";
    if (/^asset:[\w-]{1,40}$/.test(s)) return s; // browser-side reference to an image kept out of AI requests
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= LIMITS.image) return s;
    if (/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= LIMITS.svg * 1.4) return s;
    fail("Images must be PNG, JPEG, WebP, GIF or SVG data under 6 MB.");
  }

  /* ---------------- Elements ---------------- */
  // Returns a clean element. `prev` is the element being updated, if any.
  function cleanElement(raw, fonts = DEFAULT_FONTS, prev = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Element must be an object.");
    const e = { ...prev, ...raw };
    const type = oneOf(e.type, TYPES, null);
    if (!type) fail(`Element type must be one of: ${TYPES.join(", ")}.`);
    const id = typeof e.id === "string" && /^[\w-]{1,40}$/.test(e.id) ? e.id : newId();
    const out = {
      id, type, name: str(e.name, 60),
      x: num(e.x, -20000, 20000, 0), y: num(e.y, -20000, 20000, 0),
      w: num(e.w, 1, 20000, 200), h: num(e.h, 1, 20000, 100),
      rotation: num(e.rotation, -360, 360, 0), opacity: num(e.opacity, 0, 1, 1),
      locked: bool(e.locked), hidden: bool(e.hidden),
    };
    if (type === "text") {
      Object.assign(out, {
        text: str(e.text, LIMITS.text, "Text"),
        fontFamily: oneOf(e.fontFamily, fonts, fonts[0]),
        fontSize: num(e.fontSize, 4, 1000, 48),
        fontWeight: oneOf(Math.round(num(e.fontWeight, 100, 900, 400) / 100) * 100, [100, 200, 300, 400, 500, 600, 700, 800, 900], 400),
        italic: bool(e.italic), uppercase: bool(e.uppercase),
        color: hex(e.color, "#111111") || "#111111",
        align: oneOf(e.align, ["left", "center", "right"], "left"),
        lineHeight: num(e.lineHeight, 0.6, 3, 1.2),
        letterSpacing: num(e.letterSpacing, -20, 100, 0),
      });
    } else if (type === "rect" || type === "ellipse") {
      Object.assign(out, {
        fill: hex(e.fill, "#111111"), stroke: hex(e.stroke, ""),
        strokeWidth: num(e.strokeWidth, 0, 200, 0),
        radius: type === "rect" ? num(e.radius, 0, 10000, 0) : 0,
      });
    } else if (type === "image") {
      Object.assign(out, { src: cleanSrc(e.src), fit: oneOf(e.fit, ["cover", "contain"], "cover"), radius: num(e.radius, 0, 10000, 0), prompt: str(e.prompt, 1000) });
    } else if (type === "logo") {
      out.color = hex(e.color, "#111111") || "#111111";
    }
    return out;
  }

  /* ---------------- Whole design ---------------- */
  function cleanDesign(raw, fonts = DEFAULT_FONTS) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Design must be an object.");
    if (typeof raw.id !== "string" || !/^[\w-]{1,64}$/.test(raw.id)) fail("Design id is missing or invalid.");
    const elements = Array.isArray(raw.elements) ? raw.elements : [];
    if (elements.length > LIMITS.elements) fail(`A design can have at most ${LIMITS.elements} elements.`);
    const seen = new Set();
    const brief = {};
    for (const k of BRIEF_FIELDS) brief[k] = str(raw.brief && raw.brief[k], 600);
    const checks = {};
    for (const [k, v] of Object.entries(raw.checks && typeof raw.checks === "object" ? raw.checks : {}).slice(0, 100)) {
      if (/^[a-z]+\.[a-z]+$/.test(k) && v === true) checks[k] = true;
    }
    const chat = (Array.isArray(raw.chat) ? raw.chat : []).slice(-LIMITS.chat)
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, LIMITS.chatChars) }));
    const thumb = typeof raw.thumb === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(raw.thumb) && raw.thumb.length <= LIMITS.thumb ? raw.thumb : "";
    return {
      id: raw.id,
      name: str(raw.name, 100, "Untitled design").trim() || "Untitled design",
      width: Math.round(num(raw.width, 16, 8000, 1080)), height: Math.round(num(raw.height, 16, 8000, 1080)),
      background: hex(raw.background, "#FFFFFF") || "#FFFFFF",
      stage: oneOf(raw.stage, STAGES, "brief"),
      templateId: str(raw.templateId, 60),
      brief, checks, chat, thumb,
      elements: elements.map(e => {
        const c = cleanElement(e, fonts);
        if (seen.has(c.id)) c.id = newId();
        seen.add(c.id);
        return c;
      }),
      created: num(raw.created, 0, 9e15, Date.now()),
      updated: num(raw.updated, 0, 9e15, Date.now()),
    };
  }

  // A small listing entry for the dashboard.
  function designSummary(d) {
    return { id: d.id, name: d.name, width: d.width, height: d.height, stage: d.stage, templateId: d.templateId, thumb: d.thumb, updated: d.updated, created: d.created };
  }

  // What the AI sees: the design with numbers rounded and image data left out.
  function describeForAi(d) {
    const el = e => {
      const o = { id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) };
      if (e.name) o.name = e.name;
      if (e.rotation) o.rotation = e.rotation;
      if (e.opacity !== 1) o.opacity = e.opacity;
      if (e.hidden) o.hidden = true;
      if (e.locked) o.locked = true;
      if (e.type === "text") Object.assign(o, { text: e.text, fontFamily: e.fontFamily, fontSize: e.fontSize, fontWeight: e.fontWeight, color: e.color, align: e.align, lineHeight: e.lineHeight, letterSpacing: e.letterSpacing, uppercase: e.uppercase || undefined, italic: e.italic || undefined });
      if (e.type === "rect" || e.type === "ellipse") Object.assign(o, { fill: e.fill || "none", stroke: e.stroke || undefined, strokeWidth: e.strokeWidth || undefined, radius: e.radius || undefined });
      if (e.type === "image") Object.assign(o, { image: e.src ? (e.src.startsWith("data:image/svg") ? "vector illustration" : "photo") : "EMPTY PLACEHOLDER", fit: e.fit, prompt: e.prompt || undefined });
      if (e.type === "logo") o.color = e.color;
      return o;
    };
    return {
      name: d.name, width: d.width, height: d.height, background: d.background, stage: d.stage, brief: d.brief,
      checks: Object.keys(d.checks), elements: d.elements.map(el),
      note: "Elements are listed back to front: later elements are drawn on top.",
    };
  }

  /* ---------------- Color math ---------------- */
  function luminance(h) {
    const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }
  function mix(fg, bg, alpha) {
    const c = i => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha));
    return "#" + [1, 3, 5].map(i => c(i).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  // The color directly behind a point, or "photo" when an image is under it.
  function backdropAt(d, index, px, py) {
    for (let i = index - 1; i >= 0; i--) {
      const e = d.elements[i];
      if (e.hidden || e.type === "text" || e.type === "logo") continue;
      if (px < e.x || px > e.x + e.w || py < e.y || py > e.y + e.h) continue;
      if (e.type === "image") return "photo";
      if (!e.fill) continue;
      return e.opacity < 1 ? mix(e.fill, backdropBelow(d, i, px, py), e.opacity) : e.fill;
    }
    return d.background;
  }
  function backdropBelow(d, i, px, py) {
    const b = backdropAt(d, i, px, py);
    return b === "photo" ? "#808080" : b;
  }

  /* ---------------- Brand check ---------------- */
  // Returns { score, issues: [{ level: "error"|"warn"|"info", code, message, elementId }] }.
  function brandCheck(d, brandHex = BRAND_HEX) {
    const issues = [];
    const add = (level, code, message, elementId) => issues.push({ level, code, message, elementId });
    const palette = new Set(brandHex.map(h => h.toUpperCase()));
    const margin = Math.min(d.width, d.height) * 0.06;
    const visible = d.elements.map((e, i) => [e, i]).filter(([e]) => !e.hidden);
    const label = e => e.name || (e.type === "text" ? `"${e.text.slice(0, 30)}"` : e.type);

    if (!visible.some(([e]) => e.type === "logo")) add("warn", "logo", "Add the Kam Team mark so the design is recognizably ours.");
    if (!palette.has(d.background)) add("warn", "color", `Background ${d.background} isn't a Kam Team brand color.`);

    for (const [e, i] of visible) {
      for (const c of [e.fill, e.color, e.stroke].filter(Boolean)) {
        if (!palette.has(c)) add("warn", "color", `${label(e)} uses ${c}, which isn't in the brand palette.`, e.id);
      }
      if (e.type === "image" && !e.src) add("error", "placeholder", `${label(e)} is still an empty photo placeholder.`, e.id);
      if (e.type !== "text") continue;
      if (!["Archivo", "Inter"].includes(e.fontFamily)) add("warn", "font", `${label(e)} uses ${e.fontFamily}. Brand fonts are Archivo and Inter.`, e.id);
      if (/0000|Agent Name|AGENT NAME|Lorem ipsum/i.test(e.text)) add("warn", "placeholder", `${label(e)} still has placeholder text.`, e.id);
      const minSize = Math.max(d.width, d.height) * 0.014;
      if (e.fontSize < minSize) add("warn", "size", `${label(e)} is ${e.fontSize}px, which may be too small to read at this canvas size.`, e.id);
      const bg = backdropAt(d, i, e.x + e.w / 2, e.y + e.h / 2);
      if (bg === "photo") {
        add("info", "photo-text", `${label(e)} sits on a photo. Make sure there's enough contrast, or put a solid panel behind it.`, e.id);
      } else {
        const ratio = contrast(e.opacity < 1 ? mix(e.color, bg, e.opacity) : e.color, bg);
        const large = e.fontSize >= Math.max(d.width, d.height) * 0.03 || (e.fontWeight >= 700 && e.fontSize >= Math.max(d.width, d.height) * 0.022);
        if (ratio < (large ? 3 : 4.5)) add("error", "contrast", `${label(e)} has low contrast (${ratio.toFixed(1)}:1) against ${bg}. Aim for ${large ? "3" : "4.5"}:1 or more.`, e.id);
      }
      if (e.x < margin - 1 || e.y < margin - 1 || e.x + e.w > d.width - margin + 1 || e.y + e.h > d.height - margin + 1) {
        add("info", "margin", `${label(e)} is inside the 6% safe margin and may get cropped.`, e.id);
      }
    }
    const allText = visible.filter(([e]) => e.type === "text").map(([e]) => e.text).join(" ");
    if (/listed|sale|sold|open house|listing|\$\d/i.test(allText) && !/DRE|license|lic\.? ?#/i.test(allText)) {
      add("info", "compliance", "Listing ads usually need the agent's DRE license number and the brokerage name.");
    }
    const weight = { error: 15, warn: 6, info: 2 };
    const score = Math.max(0, 100 - issues.reduce((s, x) => s + weight[x.level], 0));
    return { score, issues: issues.slice(0, 50) };
  }

  /* ---------------- Edit operations ---------------- */
  function findIndex(d, id) {
    const i = d.elements.findIndex(e => e.id === id);
    if (i < 0) fail(`No element with id "${id}". Call get_design to see current ids.`);
    return i;
  }

  // Each op mutates the design in place and returns a short result for the AI.
  const ops = {
    add_element(d, input, fonts) {
      if (d.elements.length >= LIMITS.elements) fail("This design already has the maximum number of elements.");
      const e = cleanElement({ ...(input.props || {}), type: input.type, id: undefined }, fonts);
      d.elements.push(e);
      return { id: e.id, message: `Added ${e.type} ${e.id}.` };
    },
    update_element(d, input, fonts) {
      const i = findIndex(d, input.id);
      const props = { ...(input.props || {}) };
      delete props.id; delete props.type;
      d.elements[i] = cleanElement(props, fonts, d.elements[i]);
      return { id: input.id, message: `Updated ${input.id}.` };
    },
    delete_element(d, input) {
      const i = findIndex(d, input.id);
      d.elements.splice(i, 1);
      return { message: `Deleted ${input.id}.` };
    },
    reorder_element(d, input) {
      const i = findIndex(d, input.id);
      const [e] = d.elements.splice(i, 1);
      const to = { front: d.elements.length, back: 0, forward: Math.min(d.elements.length, i + 1), backward: Math.max(0, i - 1) }[input.to];
      if (to === undefined) fail('"to" must be front, back, forward or backward.');
      d.elements.splice(to, 0, e);
      return { message: `Moved ${input.id} ${input.to}.` };
    },
    set_canvas(d, input) {
      const w = input.width !== undefined ? Math.round(num(input.width, 16, 8000, d.width)) : d.width;
      const h = input.height !== undefined ? Math.round(num(input.height, 16, 8000, d.height)) : d.height;
      if (input.scale_content && (w !== d.width || h !== d.height)) {
        const sx = w / d.width, sy = h / d.height, s = Math.min(sx, sy);
        for (const e of d.elements) {
          e.x = Math.round(e.x * sx); e.y = Math.round(e.y * sy); e.w = Math.max(1, Math.round(e.w * sx)); e.h = Math.max(1, Math.round(e.h * sy));
          if (e.type === "text") e.fontSize = Math.max(4, Math.round(e.fontSize * s));
        }
      }
      d.width = w; d.height = h;
      if (input.background !== undefined) d.background = hex(input.background, d.background) || d.background;
      if (input.name !== undefined) d.name = str(input.name, 100, d.name).trim() || d.name;
      return { message: `Canvas is ${d.width}x${d.height}, background ${d.background}.` };
    },
    update_brief(d, input) {
      for (const k of BRIEF_FIELDS) if (typeof input[k] === "string") d.brief[k] = input[k].slice(0, 600);
      return { message: "Brief updated." };
    },
    set_stage(d, input) {
      if (input.stage !== undefined) d.stage = oneOf(input.stage, STAGES, d.stage);
      for (const [k, v] of Object.entries(input.checks || {})) {
        if (!/^[a-z]+\.[a-z]+$/.test(k)) continue;
        if (v) d.checks[k] = true; else delete d.checks[k];
      }
      return { message: `Stage is ${d.stage}. Checked: ${Object.keys(d.checks).join(", ") || "none"}.` };
    },
    brand_check(d, input, fonts, brandHex) {
      return brandCheck(d, brandHex);
    },
    get_design(d) {
      return describeForAi(d);
    },
  };

  // Wraps an SVG string the AI wrote as an image element. Scripts, event handlers and
  // external references are stripped; it's also only ever drawn as an <image>, which
  // never runs scripts.
  function svgToDataUrl(svg) {
    let s = String(svg || "").trim();
    if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) fail("Illustration must be a complete <svg>…</svg> document.");
    if (s.length > LIMITS.svg) fail("Illustration is too large (keep it under 80 KB).");
    s = s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(href\s*=\s*)("|')(?!#|data:image\/)[^"']*\2/gi, "$1$2#$2");
    if (!/xmlns=/.test(s)) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    const b64 = typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(s)));
    return "data:image/svg+xml;base64," + b64;
  }

  return { LIMITS, TYPES, STAGES, BRAND_HEX, BRIEF_FIELDS, DesignError, cleanElement, cleanDesign, designSummary, describeForAi, brandCheck, contrast, ops, svgToDataUrl, newId };
});
