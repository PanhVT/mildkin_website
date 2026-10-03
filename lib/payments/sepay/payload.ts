import { z } from "zod";
export const webhookSchema = z.object({
  id: z.number().int().positive().safe(),
  gateway: z.string().min(1).max(100),
  accountNumber: z.string().min(1).max(50),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().nonnegative().safe(),
  content: z.string().max(4000),
  code: z.string().max(100).nullish(),
  referenceCode: z.string().max(200).nullish(),
  transactionDate: z.string().max(100).optional(),
});
export function paymentAmountMatching(amount: number, total: number) {
  return Number.isSafeInteger(amount) && amount > 0 && amount === total;
}
