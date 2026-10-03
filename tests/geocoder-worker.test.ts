import { readFile } from "node:fs/promises";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, it } from "vitest";

it("runs the actual geocoder transport on Workers and never follows redirects", async () => {
  const source = await readFile(new URL("../lib/geocoder-fetch.ts", import.meta.url), "utf8");
  const script = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
  const requests: string[] = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: "2026-09-01",
    script: `${script}\nexport default { async fetch() {
      const response = await fetchGeocoder(new URL('https://api.geoapify.com/v1/geocode/search?text=public-test&apiKey=test-only'));
      return Response.json({ status: response.status, ok: response.ok });
    } };`,
    outboundService: async (request) => {
      requests.push(request.url);
      return new Response(null, { status: 302, headers: { Location: "https://redirect.example/" } });
    },
  }));
  try {
    const response = await mf.dispatchFetch("http://localhost/");
    expect(await response.json()).toEqual({ status: 302, ok: false });
    expect(requests).toEqual(["https://api.geoapify.com/v1/geocode/search?text=public-test&apiKey=test-only"]);
  } finally {
    await mf.dispose();
  }
});
