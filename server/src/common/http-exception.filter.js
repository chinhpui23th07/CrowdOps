/**
 * Exception filter: nơi DUY NHẤT biến lỗi thành response. Controller/service chỉ việc ném HttpError.
 * Tương đương @Catch() ExceptionFilter của NestJS.
 */
// eslint-disable-next-line no-unused-vars
export function httpExceptionFilter(error, _req, res, _next) {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status === 413 ? "File vượt quá 25 MB" : error.message });
}
