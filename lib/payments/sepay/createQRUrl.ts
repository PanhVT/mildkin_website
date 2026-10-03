import { getBank } from "./banks";
export function createQRUrl(
  bank: string,
  account: string,
  amount: number,
  orderCode: string,
) {
  if (
    !/^\d{6,30}$/.test(account) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !/^MK[A-F0-9]{10}$/.test(orderCode)
  )
    throw new Error("Invalid QR parameters");
  const url = new URL("https://qr.sepay.vn/img");
  url.search = new URLSearchParams({
    bank: getBank(bank).qr,
    acc: account,
    amount: String(amount),
    des: orderCode,
  }).toString();
  return url.toString();
}
