const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

const pickCrypto = (alphabet: string) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return alphabet[buf[0] % alphabet.length];
};

const shuffle = (chars: string[]) => {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
};

export const generateStrongPassword = (length = 12) => {
  const targetLength = Math.max(10, Math.min(64, length));
  const chars = [
    pickCrypto(LOWER),
    pickCrypto(UPPER),
    pickCrypto(DIGITS),
    pickCrypto(SYMBOLS),
  ];
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  while (chars.length < targetLength) {
    chars.push(pickCrypto(all));
  }
  return shuffle(chars).join('');
};

export type PasswordChecks = {
  lengthMin8: boolean;
  lengthRecommended: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  score: number;
  meetsAll: boolean;
};

export const evaluatePassword = (password: string): PasswordChecks => {
  const lengthMin8 = password.length >= 8;
  const lengthRecommended = password.length >= 10 && password.length <= 14;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const checks = [lengthMin8, hasUpper, hasLower, hasNumber, hasSymbol];
  const score = checks.reduce((acc, ok) => acc + (ok ? 1 : 0), 0);
  const meetsAll = checks.every(Boolean);
  return { lengthMin8, lengthRecommended, hasUpper, hasLower, hasNumber, hasSymbol, score, meetsAll };
};

