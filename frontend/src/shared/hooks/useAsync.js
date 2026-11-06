import { useEffect, useState } from "react";

// RPC công khai trên testnet là nhiều node sau một load balancer: ngay sau khi giao dịch
// được xác nhận, có thể hỏi trúng node chưa nhận block mới (vd. "chiến dịch #7 chưa tồn tại").
// Vì vậy thử lại vài lần trước khi báo lỗi.
const RETRY_DELAYS_MS = [1500, 3000, 6000];

/**
 * Chạy một hàm async mỗi khi deps đổi, trả về { loading, data, error } cho component.
 * Tự thử lại khi lỗi và bỏ qua kết quả cũ nếu deps đã đổi giữa chừng.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const data = await loader();
          if (!cancelled) setState({ loading: false, data, error: null });
          return;
        } catch (error) {
          if (cancelled) return;
          if (attempt >= RETRY_DELAYS_MS.length) {
            console.error(error);
            setState({ loading: false, data: null, error });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          if (cancelled) return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
