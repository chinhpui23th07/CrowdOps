/** Express 4 không tự bắt lỗi của hàm async; bọc lại để lỗi được chuyển tới exception filter. */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
