import { constantTimeEqual } from "@/lib/security";
// Workers' deployed PBKDF2 cap is 100,000 per derivation. Version and cost are
// encoded so stored credentials can be upgraded when the runtime permits it.
export const PASSWORD_ITERATIONS = 100_000;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function derive(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = Uint8Array.from(salt.match(/../g)!, (x) => parseInt(x, 16));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: bytes, iterations },
    key,
    256,
  );
  return hex(new Uint8Array(bits));
}
export async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await derive(password, salt, PASSWORD_ITERATIONS);
  return { hash: `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${hash}`, salt };
}
export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
) {
  const [algorithm, cost, hash] = storedHash.split("$");
  const iterations = Number(cost);
  if (
    algorithm !== "pbkdf2-sha256" ||
    iterations !== PASSWORD_ITERATIONS ||
    !/^[a-f0-9]{64}$/.test(hash || "") ||
    !/^[a-f0-9]{64}$/.test(salt)
  )
    return false;
  return constantTimeEqual(await derive(password, salt, iterations), hash);
}
export async function dummyPasswordCheck(password: string) {
  await verifyPassword(
    password,
    `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${"0".repeat(64)}`,
    "0".repeat(64),
  );
}
