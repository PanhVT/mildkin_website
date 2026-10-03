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
