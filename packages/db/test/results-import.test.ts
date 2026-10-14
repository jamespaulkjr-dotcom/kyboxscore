/**
 * Resolving the school names in a results document.
 *
 * The bug these exist to prevent: a bare name is not unique across states.
 * One document held both "Franklin County", meaning Kentucky's, and "Franklin
 * County (TN)". Both were matched in one call, which reports only the name it
 * was given, and both were filed under that name - so the second overwrote the
 * first and four real games went looking for fixtures that do not exist. They
 * were reported as "not on the schedule", which is the worst kind of wrong: it
 * reads like missing data rather than a bug.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const opts = { skip: HAS_DB ? false : "DATABASE_URL is not set" };

after(async () => {
  if (!HAS_DB) return;
  const { sql } = await import("../src/index.ts");
  await sql.end();
});

// These need no database: `sql` is a lazy proxy, so importing does not connect.
test("a bare name is assumed to be Kentucky, and says so", async () => {
  const { schoolQueryFromName } = await import("../src/index.ts");

  assert.deepEqual(schoolQueryFromName("Franklin County"), {
    name: "Franklin County",
    state: "KY",
    stateIsAssumed: true,
  });
  // A two-letter parenthesis is a stated state.
  assert.deepEqual(schoolQueryFromName("Elder (OH)"), {
    name: "Elder",
    state: "OH",
  });
  // Any other parenthesis belongs to the name we store.
  assert.deepEqual(schoolQueryFromName("Trinity (Louisville)"), {
    name: "Trinity (Louisville)",
    state: "KY",
    stateIsAssumed: true,
  });
});

test("the same bare name in two states files under two keys", async () => {
  const { schoolMatchKey, schoolQueryFromName } = await import("../src/index.ts");

  // This is the collision itself. The matcher's own handling of two schools
  // with one name is covered by matching.test.ts, with its own fixtures; what
  // broke here was filing both answers under the same key.
  const ky = schoolMatchKey(schoolQueryFromName("Franklin County"));
  const tn = schoolMatchKey(schoolQueryFromName("Franklin County (TN)"));
  assert.notEqual(ky, tn);

  // And a name must still find its own entry.
  assert.equal(ky, schoolMatchKey(schoolQueryFromName("franklin county")));
  assert.equal(tn, schoolMatchKey(schoolQueryFromName("Franklin County (tn)")));

  // The St. Xavier pair, same shape.
  assert.notEqual(
    schoolMatchKey(schoolQueryFromName("St. Xavier")),
    schoolMatchKey(schoolQueryFromName("St. Xavier (OH)"))
  );
});

test("an alias outranks the assumption that a school is in Kentucky", opts, async () => {
  const { sql, matchSchoolNames, bindSchoolAlias } = await import("../src/index.ts");

  const [outOfState] = await sql<{ id: number; name: string }[]>`
    SELECT id::int, name FROM school
     WHERE is_active AND state <> 'KY' ORDER BY id LIMIT 1`;
  assert.ok(outOfState, "the seed should hold at least one out-of-state school");

  const alias = "Zzz Alias Precedence Test";
  await bindSchoolAlias({ alias, schoolId: outOfState.id, boundBy: "test" });
  try {
    // Assumed Kentucky, yet the alias points out of state: the alias wins,
    // because a person recorded it and the state was only a default.
    const [m] = await matchSchoolNames([
      { name: alias, state: "KY", stateIsAssumed: true },
    ]);
    assert.equal(m.schoolId, outOfState.id);

    // A STATED state is evidence, so it still vetoes a cross-border alias.
    const [vetoed] = await matchSchoolNames([{ name: alias, state: "KY" }]);
    assert.equal(vetoed.schoolId, null);
  } finally {
    await sql`DELETE FROM school_alias WHERE alias = ${alias}`;
  }
});

test("binding refuses the cases that would make a useless row", opts, async () => {
  const { sql, bindSchoolAlias } = await import("../src/index.ts");

  const [school] = await sql<{ id: number; name: string }[]>`
    SELECT id::int, name FROM school WHERE is_active ORDER BY id LIMIT 1`;

  assert.equal((await bindSchoolAlias({ alias: "   ", schoolId: school.id, boundBy: "t" })).ok, false);
  assert.equal((await bindSchoolAlias({ alias: school.name, schoolId: school.id, boundBy: "t" })).ok, false);
  assert.equal((await bindSchoolAlias({ alias: "Zzz Nowhere", schoolId: 2147483000, boundBy: "t" })).ok, false);
});
