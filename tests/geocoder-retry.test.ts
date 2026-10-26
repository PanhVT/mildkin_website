import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchGeocoderWithRetry } from "@/lib/geocoder-fetch";
import { PublicError } from "@/lib/http";
const url = new URL("https://api.geoapify.com/v1/geocode/search?apiKey=secret&text=private");
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("fetch", fetchMock.mockReset());
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([0, 1, 2])("succeeds after %s failures and stops immediately", async failures => {
  for (let i = 0; i < failures; i++) fetchMock.mockRejectedValueOnce(new TypeError("network"));
  fetchMock.mockResolvedValue(new Response("ok"));
  const result = fetchGeocoderWithRetry(url);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  if (failures > 0) {
    await vi.advanceTimersByTimeAsync(599);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }
  if (failures > 1) {
    await vi.advanceTimersByTimeAsync(1199);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
  }
  expect((await result).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(failures + 1);
  expect(vi.getTimerCount()).toBe(0);
});
it("throws after three failed attempts and never logs private values", async () => {
  fetchMock.mockRejectedValue(new TypeError(String(url)));
  const result = expect(fetchGeocoderWithRetry(url)).rejects.toBeInstanceOf(TypeError);
  await vi.runAllTimersAsync();
  await result;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(vi.mocked(console.warn).mock.calls).toEqual([
    ["Geocoder retry", { provider: "geoapify", attempt: 1, status: undefined, reason: "network" }],
    ["Geocoder retry", { provider: "geoapify", attempt: 2, status: undefined, reason: "network" }],
  ]);
});
it.each([408, 425, 429, 500, 502, 503, 504])("retries HTTP %s", async status => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status })).mockResolvedValue(new Response("ok"));
  const result = fetchGeocoderWithRetry(url);
  await vi.runAllTimersAsync();
  expect((await result).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each([400, 401, 403, 404, 422, 501])("does not retry HTTP %s", async status => {
  fetchMock.mockResolvedValue(new Response(null, { status }));
  expect((await fetchGeocoderWithRetry(url)).status).toBe(status);
  expect(fetchMock).toHaveBeenCalledOnce();
});
it.each(["GEOCODER_CONFIG", "ADDRESS_NOT_FOUND"])("does not retry %s", async code => {
  fetchMock.mockRejectedValue(new PublicError("invalid", 422, code));
  await expect(fetchGeocoderWithRetry(url)).rejects.toMatchObject({ code });
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("returns the final HTTP failure after three attempts", async () => {
  fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));
  const result = fetchGeocoderWithRetry(url);
  await vi.runAllTimersAsync();
  expect((await result).status).toBe(503);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("creates a fresh controller for each timed-out attempt", async () => {
  const signals: AbortSignal[] = [];
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    signals.push(options.signal);
    expect(options.signal.aborted).toBe(false);
    options.signal.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")));
  }));
  const result = expect(fetchGeocoderWithRetry(url)).rejects.toMatchObject({ name: "AbortError" });
  await vi.runAllTimersAsync();
  await result;
  expect(new Set(signals).size).toBe(3);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([["2", 2000], ["99", 5000], ["invalid", 600], ["-1", 600]])("bounds Retry-After %s", async (header, delay) => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": header } })).mockResolvedValue(new Response("ok"));
  const result = fetchGeocoderWithRetry(url);
  await vi.advanceTimersByTimeAsync(Number(delay) - 1);
  expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect((await result).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("accepts an HTTP date Retry-After", async () => {
  vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "Sun, 04 Oct 2026 00:00:03 GMT" } })).mockResolvedValue(new Response("ok"));
  const result = fetchGeocoderWithRetry(url);
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect((await result).ok).toBe(true);
});
it("adds bounded jitter to normal backoff", async () => {
  vi.mocked(Math.random).mockReturnValue(0.999);
  fetchMock.mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(new Response("ok"));
  const result = fetchGeocoderWithRetry(url);
  await vi.advanceTimersByTimeAsync(849);
  expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect((await result).ok).toBe(true);
});
it("recovers from an aborted attempt", async () => {
  fetchMock.mockRejectedValueOnce(new DOMException("timeout", "AbortError")).mockResolvedValue(new Response("ok"));
  const result = fetchGeocoderWithRetry(url);
  await vi.runAllTimersAsync();
  expect((await result).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
