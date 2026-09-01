import { test } from "node:test";
import assert from "node:assert/strict";
import { roleFromCookies, isStaffRole } from "./who.ts";

test("finds the role among other cookies", () => {
  assert.equal(roleFromCookies("a=1; kbs_who=admin; b=2"), "admin");
  assert.equal(roleFromCookies("kbs_who=coach"), "coach");
  assert.equal(roleFromCookies("kbs_who=athletic_director"), "athletic_director");
});

test("no cookie means signed out", () => {
  assert.equal(roleFromCookies(""), null);
  assert.equal(roleFromCookies("session=abc"), null);
});

test("matches the whole name, not a suffix", () => {
  // The bug this guards: startsWith("kbs_who=") also matches "not_kbs_who=".
  assert.equal(roleFromCookies("not_kbs_who=admin"), null);
  assert.equal(roleFromCookies("xkbs_who=admin"), null);
});

test("refuses anything that is not a plain role", () => {
  assert.equal(roleFromCookies("kbs_who=<script>"), null);
  assert.equal(roleFromCookies("kbs_who=" + "a".repeat(40)), null);
  assert.equal(roleFromCookies("kbs_who="), null);
  assert.equal(roleFromCookies("kbs_who=ADMIN"), null);
});

test("survives a malformed percent escape", () => {
  assert.equal(roleFromCookies("kbs_who=%E0%A4%A"), null);
});

test("a forged role is still only a label", () => {
  // Nothing here grants anything; the server checks the real session. This
  // only decides which word the header shows.
  assert.equal(roleFromCookies("kbs_who=admin"), "admin");
  assert.equal(isStaffRole("admin"), true);
  assert.equal(isStaffRole("staff"), true);
  assert.equal(isStaffRole("coach"), false);
});
