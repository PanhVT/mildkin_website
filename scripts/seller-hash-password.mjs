import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

// Same versioned PBKDF2 format/cost as lib/auth/password.ts; append its salt.
export function sellerPasswordHash(password) {
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256");
  return `pbkdf2-sha256$100000$${hash.toString("hex")}$${salt.toString("hex")}`;
}
async function main() {
  let password = process.env.SELLER_PASSWORD;
  delete process.env.SELLER_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Use an interactive terminal or set SELLER_PASSWORD in the process environment.",
      );
    const muted = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const rl = createInterface({
      input: process.stdin,
      output: muted,
      terminal: true,
    });
    process.stdout.write("Seller password (hidden): ");
    password = await new Promise((resolve) => rl.question("", resolve));
    rl.close();
    process.stdout.write("\n");
  }
  if (password.length < 10 || password.length > 1024)
    throw new Error("Use a password between 10 and 1024 characters.");
  process.stdout.write(`${sellerPasswordHash(password)}\n`);
}
if (
  process.argv[1] &&
  import.meta.url ===
    (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
