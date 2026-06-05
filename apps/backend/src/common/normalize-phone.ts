/**
 * Pakistan phone number normalization utility.
 * 03xx -> +923xx
 * 923xx -> +923xx
 * +xxx -> passed through
 */
export function normalizePhone(raw: string): { normalized: string; valid: boolean } {
  if (!raw) return { normalized: '', valid: false };
  // Remove spaces, dashes, parentheses
  let phone = String(raw).replace(/[\s\-().]/g, '');

  // Already international format
  if (phone.startsWith('+')) {
    const valid = /^\+\d{7,15}$/.test(phone);
    return { normalized: phone, valid };
  }

  // Pakistan local format: 03xx... (11 digits)
  if (/^03\d{9}$/.test(phone)) {
    return { normalized: `+92${phone.slice(1)}`, valid: true };
  }

  // Pakistan local format with leading 0 dropped (10 digits starting with 3)
  // e.g. Leopards API returns consignment_phone as JSON int, dropping the leading 0
  if (/^3\d{9}$/.test(phone)) {
    return { normalized: `+92${phone}`, valid: true };
  }

  // Pakistan format with country code: 923xx (without +)
  if (/^923\d{9}$/.test(phone)) {
    return { normalized: `+${phone}`, valid: true };
  }

  // Generic: if starts with 0, try as local
  if (phone.startsWith('0') && phone.length >= 10) {
    phone = phone.slice(1);
    const valid = /^\d{7,14}$/.test(phone);
    return { normalized: `+${phone}`, valid };
  }

  // Bare digits — try as-is
  if (/^\d{7,15}$/.test(phone)) {
    return { normalized: `+${phone}`, valid: true };
  }

  return { normalized: phone, valid: false };
}
