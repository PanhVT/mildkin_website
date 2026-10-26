import { z } from "zod";
import { displayPackLabel } from "@/lib/products/pack-label";

export const packLabelSchema = z.string().trim().max(50)
  .refine((value) => !/[<>\u0000-\u001f\u007f]/.test(value), "Quy cách chỉ nhận văn bản thuần, tối đa 50 ký tự.")
  .transform(displayPackLabel);

export const unitsPerPackSchema = z.number().int().min(1).max(10000);
