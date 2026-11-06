/**
 * Lỗi có kèm mã HTTP. Ném ở bất kỳ đâu (guard, dto, service), exception filter sẽ
 * chuyển thành response JSON { error }. Tương đương HttpException của NestJS.
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
