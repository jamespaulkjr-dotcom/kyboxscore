/**
 * Password hashing and session tokens.
 *
 * This lives in @kyboxscore/db rather than in the web app because three
 * callers need it: the app, the provisioning CLI, and the test suite. It has
 * no Next.js imports on purpose - anything touching next/headers cannot be
 * unit tested under `node --test`.
 */
import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Hand-wrapped rather than promisify(scrypt): the promisified overload drops
 * the options argument, which is exactly where N, r and p live.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

// 128 * N * r = 16 MB, comfortably under Node's 32 MB scrypt default.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/**
 * scrypt from node:crypto rather than bcrypt or argon2. Both of those are
 * native builds, and a native build in a multi-stage Docker image is a
 * recurring source of broken deploys. scrypt is memory-hard, in the standard
 * library, and good enough for a login form that is rate limited anyway.
 *
 * Format: scrypt$N$r$p$<salt_b64>$<hash_b64>. The parameters travel with the
 * hash so they can be raised later without invalidating existing passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Returns false rather than throwing on a malformed stored value: a corrupt
 * hash must read as "wrong password", never as a 500 that distinguishes this
 * account from any other.
 */
export async function verifyPassword(
  password: string,
  stored: string | null
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    if (expected.length === 0) return false;
    const key = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * Burns roughly one password verification worth of time. Called when the email
 * does not exist, so "no such user" and "wrong password" take the same wall
 * clock time and cannot be told apart by an enumeration script.
 */
export async function burnVerifyTime(): Promise<void> {
  await scryptAsync("dummy", randomBytes(16), KEYLEN, { N, r: R, p: P });
}

/**
 * The cookie carries a raw random token; the database stores only this hash.
 * AUTH_SECRET is mixed in as a pepper, so stolen database rows are not enough
 * to forge a session without also having the application secret.
 */
export function hashToken(token: string): string {
  const pepper = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${token}${pepper}`).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
