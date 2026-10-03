import { afterEach, expect, it, vi } from "vitest";
import { fetchGeocoder } from "@/lib/geocoder-fetch";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("aborts after eight seconds and clears the timer even if fetch rejects with TypeError", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new TypeError("aborted")));
  })));
  const request = expect(fetchGeocoder(new URL("https://example.com/"))).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(8000);
  await request;
  expect(vi.getTimerCount()).toBe(0);
});

it("clears its timeout after a successful fetch", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));
  await fetchGeocoder(new URL("https://example.com/"));
  expect(vi.getTimerCount()).toBe(0);
});
