export function extractOrderCode(content: string): string | null {
  const matches =
    content.toUpperCase().match(/(?<![A-Z0-9])MK[A-F0-9]{10}(?![A-Z0-9])/g) ??
    [];
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : null;
}
