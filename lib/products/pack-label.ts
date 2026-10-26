export const DEFAULT_PACK_LABEL = "3 cookies / pack";

export function displayPackLabel(value?: string | null) {
  return value?.trim() || DEFAULT_PACK_LABEL;
}
