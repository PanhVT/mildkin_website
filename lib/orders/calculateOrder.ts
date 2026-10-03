export function calculateOrderTotal(
  items: { price: number; quantity: number }[],
  shippingFee: number,
) {
  if (!items.length || !Number.isSafeInteger(shippingFee) || shippingFee < 0)
    throw new Error("Invalid order");
  const subtotal = items.reduce((sum, item) => {
    if (
      !Number.isSafeInteger(item.price) ||
      item.price <= 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    )
      throw new Error("Invalid item");
    return sum + item.price * item.quantity;
  }, 0);
  const total = subtotal + shippingFee;
  if (!Number.isSafeInteger(total)) throw new Error("Invalid total");
  return { subtotal, shippingFee, total };
}
