import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  newSessionToken,
} from "../src/password.ts";
// The provisioning CLI carries its own copy of the hashing routine, because
// scripts here are plain .mjs and do not import the TypeScript sources. These
// tests are what keep the two from drifting apart.
import { hashPassword as cliHashPassword } from "../scripts/create-user.mjs";

test("a password verifies against its own hash", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
});

test("a wrong password does not verify", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("Correct horse battery staple", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("hashes are salted, so the same password hashes differently", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same", a), true);
  assert.equal(await verifyPassword("same", b), true);
});

test("the stored format is scrypt$N$r$p$salt$hash", async () => {
  const parts = (await hashPassword("x")).split("$");
  assert.equal(parts.length, 6);
  assert.equal(parts[0], "scrypt");
  assert.equal(parts[1], "16384");
  assert.equal(parts[2], "8");
  assert.equal(parts[3], "1");
});

test("a malformed or missing hash reads as a wrong password, never a throw", async () => {
  for (const bad of [
    null,
    "",
    "not-a-hash",
    "scrypt$16384$8$1$onlyfourparts",
    "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
    "scrypt$16384$8$1$c2FsdA==$",
    "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==",
  ]) {
    assert.equal(await verifyPassword("anything", bad), false, `input: ${bad}`);
  }
});

test("the CLI and the app agree on the hash format", async () => {
  // A hash written by create-user.mjs must be readable by the login path,
  // or provisioning silently produces accounts that cannot sign in.
  const fromCli = await cliHashPassword("shared-secret");
  assert.equal(await verifyPassword("shared-secret", fromCli), true);
  assert.equal(await verifyPassword("wrong", fromCli), false);
});

test("unicode passwords normalize, so the same keystrokes always match", async () => {
  // U+00E9 vs "e" + U+0301 combining acute. A phone keyboard and a desktop
  // keyboard can produce different bytes for the same visible password.
  const composed = "café";
  const decomposed = "café";
  assert.notEqual(composed, decomposed, "the two forms differ before normalizing");
  const stored = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, stored), true);
});

test("session tokens are unique and url safe", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newSessionToken();
    assert.match(t, /^[A-Za-z0-9_-]+$/);
    assert.ok(t.length >= 43, "at least 256 bits of entropy");
    assert.equal(seen.has(t), false);
    seen.add(t);
  }
});

test("token hashing is stable and depends on the pepper", () => {
  const original = process.env.AUTH_SECRET;
  try {
    process.env.AUTH_SECRET = "pepper-one";
    const a = hashToken("token");
    assert.equal(hashToken("token"), a, "same input and pepper is stable");
    assert.match(a, /^[0-9a-f]{64}$/);

    process.env.AUTH_SECRET = "pepper-two";
    assert.notEqual(hashToken("token"), a, "a different pepper gives a different hash");
  } finally {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  }
});
