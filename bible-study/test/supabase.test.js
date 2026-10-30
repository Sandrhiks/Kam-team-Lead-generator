"use strict";

// Checks for the GitHub Pages + Supabase version.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("the Edge Function's reminder rules match lib/reminders.js", () => {
  // reminders.mjs is lib/reminders.js as an ES module plus a two-line header.
  const cjs = read("lib/reminders.js")
    .replace(/^"use strict";\n/m, "")
    .replace("module.exports = { dueReminders, localParts, daysBetween };", "export { dueReminders, localParts, daysBetween };");
  const esm = read("supabase/functions/kbs-push/reminders.mjs").split("\n").slice(2).join("\n");
  assert.strictEqual(esm, cjs, "copy the change from lib/reminders.js into supabase/functions/kbs-push/reminders.mjs");
});

test("pages use relative paths, so the app works in a GitHub Pages folder", () => {
  for (const file of ["public/index.html", "public/login.html", "public/app.js", "public/api.js", "public/manifest.webmanifest"]) {
    const src = read(file);
    assert.doesNotMatch(src, /(?:href|src)="\/(?!\/)/, `${file} has a root-relative href or src`);
    assert.doesNotMatch(src, /fetch\("\//, `${file} fetches a root-relative URL`);
    assert.doesNotMatch(src, /"(?:start_url|scope|src)":\s*"\//, `${file} has a root-relative manifest path`);
  }
});

test("config.js defaults to the Node server", () => {
  const window = {};
  new Function("window", read("public/config.js"))(window);
  assert.deepStrictEqual(window.KBS_CONFIG, {});
});

test("leader and admin functions require two-step sign-in", () => {
  const sql = read("supabase/leaders.sql");
  for (const fn of ["kbs_my_members", "kbs_remove_member", "kbs_team", "kbs_set_role"]) {
    const body = sql.split(`FUNCTION public.${fn}(`)[1].split("END $$;")[0];
    assert.match(body, /PERFORM public\.kbs_require_role\(/, `${fn} must call kbs_require_role`);
  }
  assert.match(sql, /'aal2'/);
  // Nothing in leaders.sql is callable without signing in.
  assert.match(sql, /REVOKE EXECUTE[\s\S]+FROM PUBLIC, anon;/);
});

test("the Pages workflow refuses a secret key as the public key", () => {
  const wf = fs.readFileSync(path.join(root, "..", ".github/workflows/bible-study-pages.yml"), "utf8");
  assert.match(wf, /sb_secret_\*\)/);
});
