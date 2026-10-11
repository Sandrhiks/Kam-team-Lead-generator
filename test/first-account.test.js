"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { setup } = require("../test-support/helpers");

// With no ALLOWED_EMAILS, only the owner's first account can be created.
const t = setup({ ALLOWED_EMAILS: "" });

before(() => t.start());
after(() => t.stop());

test("first account is allowed, later ones are not", async () => {
  assert.strictEqual((await t.signup("owner@anywhere.test")).status, 201);
  assert.strictEqual((await t.signup("second@anywhere.test")).status, 403);
});
