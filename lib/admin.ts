import { headers } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getEnv } from "./env";
import { PublicError } from "./http";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function isAdmin() {
  const env = await getEnv();
  const domain = env.CF_ACCESS_TEAM_DOMAIN;
  if (
    !domain ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
    !env.CF_ACCESS_AUD
  )
    return false;
  const token = (await headers()).get("cf-access-jwt-assertion");
  if (!token) return false;
  try {
    const issuer = `https://${domain}`;
    let keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keySets.set(issuer, keys);
    }
    await jwtVerify(token, keys, {
      issuer,
      audience: env.CF_ACCESS_AUD,
      algorithms: ["RS256"],
    });
    return true;
  } catch {
    return false;
  }
}
export async function requireAdmin() {
  if (!(await isAdmin()))
    throw new PublicError("Bạn không có quyền truy cập.", 403);
}
