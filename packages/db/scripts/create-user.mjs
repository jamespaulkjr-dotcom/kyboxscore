/**
 * Provisions an account. Phase one has no public signup, so this is the only
 * way a user comes into existence.
 *
 *   node packages/db/scripts/create-user.mjs \
 *     --email coach@school.k12.ky.us --name "Jane Doe" --role coach
 *
 * Omit --password and one is generated and printed once. Re-running for an
 * existing email resets that user's password rather than erroring, which is
 * the "coach is locked out" path.
 *
 * The stored format is scrypt$N$r$p$<salt_b64>$<hash_b64> and must stay
 * byte-compatible with verifyPassword in apps/web/lib/auth.ts. The test in
 * packages/db/test/password.test.ts pins that contract.
 */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scryptAsync = promisify(scrypt);

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Never print the connection string; it carries the database password. */
function redact(url) {
  return url.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@");
}

const ROLES = ["admin", "staff", "athletic_director", "coach"];

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = arg("role") ?? "coach";
  // A generated password is URL-safe so it survives being sent over chat.
  const password = arg("password") ?? randomBytes(12).toString("base64url");
  const generated = !arg("password");

  if (!email || !name) {
    console.error(
      "usage: create-user.mjs --email <email> --name <name> [--role <role>] [--password <pw>]"
    );
    process.exit(2);
  }
  if (!ROLES.includes(role)) {
    console.error(`role must be one of: ${ROLES.join(", ")}`);
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const hash = await hashPassword(password);
    const [row] = await sql`
      INSERT INTO app_user (email, name, role, password_hash, password_set_at)
      VALUES (${email}, ${name}, ${role}, ${hash}, now())
      ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            password_set_at = now(),
            is_active = true
      RETURNING id::int, email, role, (xmax = 0) AS created`;

    // A password reset must not leave old sessions alive.
    if (!row.created) {
      await sql`UPDATE user_session SET revoked_at = now()
                WHERE user_id = ${row.id} AND revoked_at IS NULL`;
    }

    console.log(`${row.created ? "created" : "updated"} ${row.email} (${row.role})`);
    if (generated) console.log(`password: ${password}`);
    else console.log("password set from --password");
    if (!row.created) console.log("existing sessions revoked");
  } catch (err) {
    console.error(`failed against ${redact(url)}`);
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Importable for tests without running the CLI.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const invokedDirectly = process.argv.some((a) => a.includes("create-user.mjs"));
  if (invokedDirectly) await main();
}
