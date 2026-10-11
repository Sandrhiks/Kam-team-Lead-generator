"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { setup } = require("../test-support/helpers");

// ALLOWED_EMAILS=* opens sign-up to everyone.
const t = setup({ ALLOWED_EMAILS: "*" });

before(() => t.start());
after(() => t.stop());

test("anyone can create an account, but only once per email", async () => {
  assert.strictEqual((await t.signup("one@gmail.com")).status, 201);
  assert.strictEqual((await t.signup("two@yahoo.com")).status, 201);
  assert.strictEqual((await t.signup("one@gmail.com")).status, 409);
});
