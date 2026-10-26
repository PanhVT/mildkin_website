import { getEnv } from "@/lib/env";
import { imageKeyPattern } from "@/lib/seller/product-write";
import { apiError } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!imageKeyPattern.test(key)) return new Response(null, { status: 404 });
  try {
    const object = await (await getEnv()).PRODUCT_IMAGES.get(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".png") ? "image/png" : "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return apiError(error); }
}
