export const banks = {
  VCB: { name: "Vietcombank", qr: "VCB", gateway: "Vietcombank" },
  TCB: { name: "Techcombank", qr: "TCB", gateway: "Techcombank" },
  MB: { name: "MB Bank", qr: "MB", gateway: "MBBank" },
} as const;
export function getBank(value: string) {
  const aliases: Record<string, keyof typeof banks> = {
    vietcombank: "VCB",
    techcombank: "TCB",
    mbbank: "MB",
    vcb: "VCB",
    tcb: "TCB",
    mb: "MB",
  };
  const key = aliases[value.toLowerCase().replace(/\s/g, "")];
  if (!key) throw new Error("Unsupported bank");
  return { code: key, ...banks[key] };
}
