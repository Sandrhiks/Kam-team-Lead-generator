"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const D = require("../lib/design");
const catalog = require("../lib/catalog");

const base = (elements, extra = {}) => D.cleanDesign({ id: "x", width: 1080, height: 1080, background: "#111111", elements, ...extra });

test("cleanDesign fills defaults, clamps values and normalizes colors", () => {
  const d = base([{ type: "text", text: "Hi", fontSize: 5000, color: "#fff", fontFamily: "Comic Sans", fontWeight: 750 }]);
  const e = d.elements[0];
  assert.strictEqual(e.fontSize, 1000);
  assert.strictEqual(e.color, "#FFFFFF");
  assert.strictEqual(e.fontFamily, "Archivo");
  assert.strictEqual(e.fontWeight, 800);
  assert.match(e.id, /^e/);
  assert.strictEqual(d.stage, "brief");
  assert.deepStrictEqual(Object.keys(d.brief), D.BRIEF_FIELDS);
});

test("cleanDesign rejects bad ids, types and image sources, and de-duplicates element ids", () => {
  assert.throws(() => D.cleanDesign({ id: "../x" }), D.DesignError);
  assert.throws(() => base([{ type: "script" }]), /type must be one of/);
  assert.throws(() => base([{ type: "image", src: "javascript:alert(1)" }]), /Images must be/);
  const d = base([{ id: "a", type: "rect" }, { id: "a", type: "rect" }]);
  assert.notStrictEqual(d.elements[0].id, d.elements[1].id);
});

test("ops add, update, reorder and delete elements", () => {
  const d = base([]);
  const { id } = D.ops.add_element(d, { type: "rect", props: { x: 10, fill: "#FFFFFF" } });
  const { id: id2 } = D.ops.add_element(d, { type: "ellipse", props: {} });
  D.ops.update_element(d, { id, props: { x: 99, type: "text" } });
  assert.strictEqual(d.elements[0].x, 99);
  assert.strictEqual(d.elements[0].type, "rect");
  D.ops.reorder_element(d, { id, to: "front" });
  assert.deepStrictEqual(d.elements.map(e => e.id), [id2, id]);
  assert.throws(() => D.ops.delete_element(d, { id: "nope" }), /No element/);
  D.ops.delete_element(d, { id });
  assert.strictEqual(d.elements.length, 1);
});

test("set_canvas can scale content with the canvas", () => {
  const d = base([{ id: "t", type: "text", x: 100, y: 100, w: 400, h: 50, fontSize: 40 }]);
  D.ops.set_canvas(d, { width: 1080, height: 1920, scale_content: true, background: "#ffffff" });
  assert.deepStrictEqual([d.width, d.height, d.background], [1080, 1920, "#FFFFFF"]);
  assert.deepStrictEqual([d.elements[0].y, d.elements[0].h, d.elements[0].fontSize], [178, 89, 40]);
});

test("set_stage ticks and unticks checklist items", () => {
  const d = base([]);
  D.ops.set_stage(d, { stage: "review", checks: { "brief.goal": true, "brief.size": true, "bad key": true } });
  D.ops.set_stage(d, { checks: { "brief.size": false } });
  assert.strictEqual(d.stage, "review");
  assert.deepStrictEqual(d.checks, { "brief.goal": true });
});

test("brand check flags contrast, off-brand colors, fonts, placeholders and missing logo", () => {
  const d = base([
    { id: "lowc", type: "text", text: "Hello", x: 100, y: 100, w: 400, h: 60, fontSize: 30, color: "#2C2C2C" },
    { id: "pink", type: "rect", x: 0, y: 900, w: 1080, h: 180, fill: "#FF00AA" },
    { id: "font", type: "text", text: "Agent Name", x: 100, y: 300, w: 600, h: 60, fontSize: 40, color: "#FFFFFF", fontFamily: "Bebas Neue" },
    { id: "ph", type: "image", x: 100, y: 400, w: 300, h: 300, src: "" },
  ]);
  const { score, issues } = D.brandCheck(d, catalog.BRAND.colors.map(c => c.hex));
  const codes = issues.map(i => `${i.code}:${i.elementId || ""}`);
  for (const c of ["logo:", "contrast:lowc", "color:pink", "font:font", "placeholder:font", "placeholder:ph"]) assert.ok(codes.includes(c), c);
  assert.ok(score < 60);
});

test("a clean on-brand design passes", () => {
  const d = base([
    { id: "t", type: "text", text: "WELCOME HOME", x: 90, y: 90, w: 900, h: 100, fontSize: 80, color: "#FFFFFF" },
    { id: "l", type: "logo", x: 90, y: 900, w: 54, h: 80, color: "#FFFFFF" },
  ]);
  assert.deepStrictEqual(D.brandCheck(d).issues, []);
  assert.strictEqual(D.brandCheck(d).score, 100);
});

test("contrast behind text accounts for panels drawn under it", () => {
  const d = base([
    { id: "panel", type: "rect", x: 0, y: 0, w: 1080, h: 540, fill: "#FFFFFF" },
    { id: "t", type: "text", text: "Light text", x: 100, y: 100, w: 600, h: 60, fontSize: 40, color: "#F2F2F0" },
  ]);
  assert.ok(D.brandCheck(d).issues.some(i => i.code === "contrast" && i.elementId === "t"));
});

test("AI-drawn SVG is sanitized and wrapped as an image", () => {
  const url = D.svgToDataUrl('<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><a href="https://evil.example"><rect width="10" height="10"/></a></svg>');
  const svg = Buffer.from(url.split(",")[1], "base64").toString();
  assert.doesNotMatch(svg, /script|onload|evil/);
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.throws(() => D.svgToDataUrl("<div>not svg</div>"), /complete <svg>/);
});

test("every template builds valid, on-palette elements", () => {
  const brand = catalog.BRAND.colors.map(c => c.hex);
  for (const t of catalog.TEMPLATES) {
    const { width, height, elements } = catalog.templateElements(t.id);
    const d = D.cleanDesign({ id: t.id, width, height, elements }, catalog.FONTS);
    assert.strictEqual(d.elements.length, elements.length, t.id);
    for (const e of d.elements) for (const c of [e.fill, e.color, e.stroke].filter(Boolean)) assert.ok(brand.includes(c), `${t.id} ${e.id} ${c}`);
    assert.ok(t.tools.every(id => catalog.AI_TOOLS.some(x => x.id === id)), `${t.id} tools`);
  }
});
