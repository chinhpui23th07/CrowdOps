/** So sánh hai địa chỉ ví không phân biệt hoa thường (địa chỉ Ethereum có thể viết dạng checksum). */
export function sameAddress(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
}
