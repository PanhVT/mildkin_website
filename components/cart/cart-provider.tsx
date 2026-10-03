"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";
type CartItem = { productId: string; quantity: number };
const savedCart = z
  .array(
    z.object({
      productId: z.string().max(64),
      quantity: z.number().int().min(1).max(20),
    }),
  )
  .max(20);
const empty: CartItem[] = [];
let snapshot: CartItem[] | undefined;
const listeners = new Set<() => void>();
function readStoredCart(): CartItem[] {
  try {
    const parsed = savedCart.safeParse(
      JSON.parse(localStorage.getItem("mildkin-cart") || "[]"),
    );
    if (parsed.success)
      return parsed.data.filter(
        (item, i, all) =>
          all.findIndex((x) => x.productId === item.productId) === i,
      );
  } catch {
    /* Storage unavailable or invalid: keep an in-memory cart. */
  }
  return [];
}
function getSnapshot() {
  return (snapshot ??= readStoredCart());
}
function getServerSnapshot() {
  return null;
}
function emit() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === "mildkin-cart" || event.key === null) {
      snapshot = readStoredCart();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function update(items: CartItem[]) {
  snapshot = items;
  try {
    localStorage.setItem("mildkin-cart", JSON.stringify(items));
  } catch {
    /* In-memory cart remains usable. */
  }
  emit();
}
const CartContext = createContext<{
  items: CartItem[];
  ready: boolean;
  setQuantity: (id: string, quantity: number) => void;
  add: (id: string, quantity?: number) => void;
  clear: () => void;
  message: string;
} | null>(null);
export function CartProvider({ children }: { children: React.ReactNode }) {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const items = stored ?? empty;
  const ready = stored !== null;
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 2400);
    return () => clearTimeout(timer);
  }, [message]);
  const setQuantity = useCallback((id: string, quantity: number) => {
    const current = getSnapshot();
    update(
      quantity <= 0
        ? current.filter((i) => i.productId !== id)
        : current.map((i) =>
            i.productId === id ? { ...i, quantity: Math.min(20, quantity) } : i,
          ),
    );
  }, []);
  const add = useCallback((id: string, quantity = 1) => {
    const current = getSnapshot();
    update(
      current.some((i) => i.productId === id)
        ? current.map((i) =>
            i.productId === id
              ? { ...i, quantity: Math.min(20, i.quantity + quantity) }
              : i,
          )
        : [...current, { productId: id, quantity }].slice(0, 20),
    );
    setMessage("Đã thêm vào giỏ bánh của bạn ♡");
  }, []);
  return (
    <CartContext.Provider
      value={{
        items,
        ready,
        setQuantity,
        add,
        clear: () => update([]),
        message,
      }}
    >
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`toast ${message ? "visible" : ""}`}
      >
        {message}
      </div>
    </CartContext.Provider>
  );
}
export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("Missing cart provider");
  return cart;
}
