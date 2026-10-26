// Server-side Geoapify transport. Never log a URL containing an API key or address.
export function fetchErrorName(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return /^(?:Error|TypeError|DOMException|AbortError|TimeoutError|NetworkError|SecurityError|RangeError)$/.test(name) ? name : "UnknownError";
}

export async function fetchGeocoder(url: URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Workers does not support redirect: "error". Let callers reject 3xx
      // via response.ok without forwarding the address to a redirect target.
      signal: controller.signal, redirect: "manual", cache: "no-store",
    });
  } catch (error) {
    if (controller.signal.aborted) throw new DOMException("Geocoder request timed out", "AbortError");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const retryStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
export type GeocoderBudget = { attempts: number };

function retryAfterMs(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay >= 0 ? Math.min(5000, delay) : undefined;
}

export async function fetchGeocoderWithRetry(url: URL, budget: GeocoderBudget = { attempts: 0 }): Promise<Response> {
  for (let retryIndex = 0; budget.attempts < 3; retryIndex++) {
    const attempt = ++budget.attempts;
    let status: number | undefined;
    let reason: string;
    let retryAfter: number | undefined;
    try {
      const response = await fetchGeocoder(url);
      if (!retryStatuses.has(response.status) || attempt === 3) return response;
      status = response.status;
      if (status === 429) retryAfter = retryAfterMs(response.headers.get("Retry-After"));
      reason = "http";
      // Release discarded bodies without delaying the next attempt.
      void response.body?.cancel().catch(() => {});
    } catch (error) {
      // Only transport failures are retried. Parsing, configuration and address
      // selection happen outside this helper, as do all order mutations.
      const name = fetchErrorName(error);
      const retryable = ["TypeError", "NetworkError", "AbortError", "TimeoutError"].includes(name);
      if (!retryable || attempt === 3) throw error;
      reason = ["AbortError", "TimeoutError"].includes(name) ? "timeout" : "network";
    }
    console.warn("Geocoder retry", { provider: "geoapify", attempt, status, reason });
    const delay = retryAfter ?? 600 * 2 ** retryIndex + Math.floor(Math.random() * 251);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error("Geocoder attempts exhausted");
}
