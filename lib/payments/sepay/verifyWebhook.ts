import { constantTimeEqual } from "@/lib/security";
export async function verifyWebhook(
  headers: Headers,
  raw: string,
  secret: string,
  mode = "hmac",
  now = Date.now(),
) {
  if (!secret || secret.length < 24) return false;
  if (mode === "apikey")
    return constantTimeEqual(
      headers.get("authorization") || "",
      `Apikey ${secret}`,
    );
  if (mode !== "hmac") return false;
  const timestamp = headers.get("x-sepay-timestamp") || "";
  const signature = headers.get("x-sepay-signature") || "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^sha256=[a-fA-F0-9]{64}$/.test(signature)
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/.{2}/g)!, (b) =>
    parseInt(b, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(`${timestamp}.${raw}`),
  );
}
