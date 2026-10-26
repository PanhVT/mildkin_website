import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  verify: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.cookies.get(name);
      return value ? { value } : undefined;
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/env", () => ({ getEnv: async () => ({}) }));
vi.mock("@/lib/seller/auth", () => ({
  SELLER_COOKIE: "mildkin_seller_session",
  hasSellerSession: state.verify,
}));

import SellerLoginPage from "@/app/seller/login/page";
import RevenuePage from "@/app/seller/(dashboard)/revenue/page";
import OrdersPage from "@/app/seller/(dashboard)/orders/page";
import DeliveryPage from "@/app/seller/(dashboard)/delivery/page";

beforeEach(() => {
  state.cookies.clear();
  state.verify
    .mockReset()
    .mockImplementation(
      async (_env, token) => token === "valid-seller-session",
    );
});

it("protects direct delivery navigation from buyer sessions", async () => {
  state.cookies.set("mildkin_session", "customer-session");
  await expect(DeliveryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/seller/login");
});

it.each([false, true])(
  "shows seller login with customer login=%s and no seller session",
  async (customer) => {
    if (customer) state.cookies.set("mildkin_session", "customer-session");
    await expect(SellerLoginPage()).resolves.toBeTruthy();
    expect(state.verify).toHaveBeenCalledWith({}, undefined);
  },
);

it("redirects an authenticated seller from login to dashboard", async () => {
  state.cookies.set("mildkin_seller_session", "valid-seller-session");
  await expect(SellerLoginPage()).rejects.toThrow("redirect:/seller");
});

it.each([undefined, "expired-seller-session"])(
  "protects direct revenue navigation with seller token=%s",
  async (token) => {
    state.cookies.set("mildkin_session", "customer-session");
    if (token) state.cookies.set("mildkin_seller_session", token);
    await expect(
      RevenuePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/seller/login");
  },
);

it.each([undefined, "expired-seller-session"])("protects preparation summary page with seller token=%s", async token => {
  state.cookies.set("mildkin_session", "customer-session");
  if (token) state.cookies.set("mildkin_seller_session", token);
  await expect(OrdersPage({ searchParams: Promise.resolve({ status: "CANCELLED" }) })).rejects.toThrow("redirect:/seller/login");
});
