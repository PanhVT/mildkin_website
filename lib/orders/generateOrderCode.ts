export function generateOrderCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return (
    "MK" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
