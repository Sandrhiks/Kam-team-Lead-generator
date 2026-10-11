"use strict";

// One shared Postgres pool for every store (accounts, leads).
const pools = new Map();

function getPool(url) {
  if (!pools.has(url)) {
    const { Pool } = require("pg");
    // Managed databases need SSL; local ones and "?sslmode=disable" URLs don't.
    const noSsl = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /[?&]sslmode=disable\b/.test(url);
    pools.set(url, new Pool({ connectionString: url, ssl: noSsl ? false : { rejectUnauthorized: false }, max: 5 }));
  }
  return pools.get(url);
}

module.exports = { getPool };
