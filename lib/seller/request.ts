// Bound both response headers and body parsing: a stalled response must not keep
// seller controls disabled forever. A timeout does not prove a write was rolled back.
export const SELLER_REQUEST_TIMEOUT_MS = 20000;
export async function sellerMutation(url: string, input: unknown) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Máy chủ phản hồi quá lâu. Đang tải lại dữ liệu; hãy kiểm tra trạng thái đơn trước khi thử lại."));
      controller.abort();
    }, SELLER_REQUEST_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      (async () => {
        const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Không thể lưu thay đổi.");
      })(),
      timeout,
    ]);
  } finally { clearTimeout(timer); }
}
