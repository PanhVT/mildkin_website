import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ refresh: vi.fn(), effect: undefined as (() => (() => void)) | undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("react", () => ({ useEffect: (effect: () => (() => void)) => { state.effect = effect; } }));
import { OrdersRefresh } from "@/components/seller/orders-refresh";
beforeEach(() => { vi.useFakeTimers(); state.refresh.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("refreshes visible orders after external writes, resumes on focus and cleans up", () => {
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const window = new EventTarget();
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  OrdersRefresh();
  const cleanup = state.effect!();
  vi.advanceTimersByTime(15000);
  expect(state.refresh).toHaveBeenCalledTimes(1);
  document.visibilityState = "hidden";
  vi.advanceTimersByTime(30000);
  expect(state.refresh).toHaveBeenCalledTimes(1);
  document.visibilityState = "visible";
  window.dispatchEvent(new Event("focus"));
  expect(state.refresh).toHaveBeenCalledTimes(2);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(state.refresh).toHaveBeenCalledTimes(3);
  cleanup();
  vi.advanceTimersByTime(15000);
  window.dispatchEvent(new Event("focus"));
  expect(state.refresh).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
