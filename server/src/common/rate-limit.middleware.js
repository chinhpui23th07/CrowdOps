/** Giới hạn số lần gọi mỗi IP trong một khoảng thời gian (dùng cho upload để không bị spam hết quota Pinata). */
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return (req, res, next) => {
    const t = now();
    const recent = (hits.get(req.ip) || []).filter((time) => t - time < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: "Upload quá nhiều, hãy thử lại sau" });
    recent.push(t);
    hits.set(req.ip, recent);
    next();
  };
}
