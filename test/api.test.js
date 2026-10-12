"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { setup, design } = require("../test-support/helpers");

const t = setup({ ALLOWED_EMAILS: "*", OPENAI_API_KEY: "sk-test", SUPPORT_EMAIL: "help@kam.test" });
let alice, bob;

before(async () => {
  await t.start();
  alice = await t.signIn("alice@kam.test", "Alice");
  bob = await t.signIn("bob@kam.test", "Bob");
});
after(() => t.stop());

const put = (cookie, d) => t.req(`/api/designs/${d.id}`, { method: "PUT", body: d, cookie });

test("catalog and config are available to signed-in users", async () => {
  const cat = await (await t.req("/api/catalog", { cookie: alice })).json();
  assert.deepStrictEqual(cat.sop.map(s => s.id), ["brief", "create", "review", "approve", "export"]);
  assert.ok(cat.templates.length >= 10);
  assert.ok(cat.templates.every(x => x.elements.length && !x.build));
  assert.ok(cat.tools.some(x => x.id === "midjourney"));
  const cfg = await (await t.req("/api/config", { cookie: alice })).json();
  assert.deepStrictEqual({ assistant: cfg.assistant, images: cfg.images, supportEmail: cfg.supportEmail, email: cfg.user.email },
    { assistant: false, images: true, supportEmail: "help@kam.test", email: "alice@kam.test" });
  assert.strictEqual((await t.req("/js/design.js", { cookie: alice })).status, 200);
});

test("designs save, list as summaries, load and delete", async () => {
  const r = await put(alice, design("d1", { thumb: "data:image/jpeg;base64,AAAA" }));
  assert.strictEqual(r.status, 200);
  const list = (await (await t.req("/api/designs", { cookie: alice })).json()).designs;
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, "Test d1");
  assert.strictEqual(list[0].elements, undefined);
  const got = (await (await t.req("/api/designs/d1", { cookie: alice })).json()).design;
  assert.strictEqual(got.elements[0].text, "JUST LISTED");
  assert.strictEqual(got.elements[0].lineHeight, 1.2); // defaults filled in
  assert.strictEqual((await t.req("/api/designs/d1", { method: "DELETE", cookie: alice })).status, 200);
  assert.strictEqual((await t.req("/api/designs/d1", { cookie: alice })).status, 404);
});

test("each user only sees their own designs", async () => {
  await put(alice, design("mine"));
  assert.strictEqual((await t.req("/api/designs/mine", { cookie: bob })).status, 404);
  assert.strictEqual((await (await t.req("/api/designs", { cookie: bob })).json()).designs.length, 0);
  assert.strictEqual((await t.req("/api/designs/mine", { method: "DELETE", cookie: bob })).status, 404);
});

test("invalid designs are rejected with a reason", async () => {
  let r = await put(alice, design("bad1", { elements: [{ type: "video" }] }));
  assert.strictEqual(r.status, 400);
  assert.match((await r.json()).error, /type must be one of/);
  r = await put(alice, design("bad2", { elements: [{ type: "image", src: "https://evil.example/x.png" }] }));
  assert.strictEqual(r.status, 400);
  r = await put(alice, design("bad3", { elements: [{ type: "image", src: "asset:h1" }] }));
  assert.match((await r.json()).error, /images included/);
  assert.strictEqual((await t.req("/api/designs/bad%20id", { method: "PUT", body: design("x"), cookie: alice })).status, 400);
});

test("API writes from another site are refused", async () => {
  const r = await t.req("/api/designs/x1", { method: "PUT", body: design("x1"), cookie: alice, headers: { Origin: "https://evil.example" } });
  assert.strictEqual(r.status, 403);
});

test("chats save with an automatic title and stay private", async () => {
  const r = await t.req("/api/chats/c1", { method: "PUT", cookie: alice, body: { messages: [{ role: "user", content: "How do I   add the logo?" }, { role: "assistant", content: "Open Add." }, { role: "system", content: "x" }] } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).chat.title, "How do I add the logo?");
  const list = (await (await t.req("/api/chats", { cookie: alice })).json()).chats;
  assert.deepStrictEqual(list.map(c => [c.id, c.count]), [["c1", 2]]);
  assert.strictEqual((await t.req("/api/chats/c1", { cookie: bob })).status, 404);
  assert.strictEqual((await t.req("/api/chats/c1", { method: "DELETE", cookie: alice })).status, 200);
});

test("support tickets are stored and emailed to the support address", async () => {
  t.mail.sent.length = 0;
  const r = await t.req("/api/tickets", { method: "POST", cookie: alice, body: { category: "Bug or error", subject: "Export is blank", message: "PDF comes out <b>white</b>" } });
  assert.strictEqual(r.status, 201);
  const j = await r.json();
  assert.match(j.ticket.id, /^KDS-/);
  assert.strictEqual(j.notified, true);
  assert.strictEqual(t.mail.sent[0].to, "help@kam.test");
  assert.match(t.mail.sent[0].html, /&lt;b&gt;white/);
  const list = await (await t.req("/api/tickets", { cookie: alice })).json();
  assert.strictEqual(list.tickets.length, 1);
  assert.ok(list.categories.includes("AI tools"));
  assert.strictEqual((await (await t.req("/api/tickets", { cookie: bob })).json()).tickets.length, 0);
  assert.strictEqual((await t.req("/api/tickets", { method: "POST", cookie: alice, body: { subject: "", message: "" } })).status, 400);
});

test("image generation returns a PNG data URL", async () => {
  const r = await t.req("/api/images", { method: "POST", cookie: alice, body: { prompt: "Modern kitchen at dawn", aspect: "landscape" } });
  assert.strictEqual(r.status, 200);
  assert.match((await r.json()).src, /^data:image\/png;base64,/);
  assert.deepStrictEqual(t.images.calls.at(-1), { model: "gpt-image-1", prompt: "Modern kitchen at dawn", size: "1536x1024", n: 1 });
  t.images.status = 500;
  const bad = await t.req("/api/images", { method: "POST", cookie: alice, body: { prompt: "Modern kitchen" } });
  t.images.status = 200;
  assert.strictEqual(bad.status, 502);
});

test("the assistant reports when it isn't configured", async () => {
  const r = await t.req("/api/assistant", { method: "POST", cookie: alice, body: { mode: "support", messages: [{ role: "user", content: "hi" }] } });
  assert.strictEqual(r.status, 503);
});
