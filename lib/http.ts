export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
export class PublicError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
export function apiError(error: unknown) {
  if (error instanceof PublicError)
    return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
  // Do not log payloads, customer details, bank details or credentials.
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json({ error: "Có lỗi xảy ra. Vui lòng thử lại sau." }, 500);
}
export async function readBody(request: Request, maxBytes = 16384) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new PublicError("Dữ liệu không hợp lệ.", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError("Thiếu dữ liệu.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new PublicError("Dữ liệu quá lớn.", 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new PublicError("Dữ liệu không hợp lệ.");
  }
}
export function requireSameOrigin(request: Request, siteUrl?: string) {
  const origin = request.headers.get("origin");
  if (!siteUrl || origin !== new URL(siteUrl).origin)
    throw new PublicError("Yêu cầu không được phép.", 403);
}
