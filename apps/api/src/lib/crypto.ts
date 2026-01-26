import crypto from 'crypto';
import { env } from '../config/env';

const decodeBase64Key = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const decoded = Buffer.from(trimmed, 'base64');
  return decoded.length === 32 ? decoded : null;
};

const deriveKey = (value: string) =>
  Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(value, 'utf8'), Buffer.alloc(0), Buffer.from('app-encryption-key'), 32),
  );

const primaryKey = decodeBase64Key(env.ENCRYPTION_KEY) ?? deriveKey(env.ENCRYPTION_KEY);
const legacyKey = (() => {
  const raw = Buffer.from(env.ENCRYPTION_KEY, 'utf8');
  if (raw.length === 32 && !raw.equals(primaryKey)) {
    return raw;
  }
  return null;
})();

const encryptWithKey = (plain: string, key: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const decryptWithKey = (payload: string, key: Buffer) => {
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length < 28) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const text = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(text), decipher.final()]).toString('utf8');
};

export const encrypt = (plain: string) => encryptWithKey(plain, primaryKey);

export const decrypt = (payload: string) => {
  try {
    return decryptWithKey(payload, primaryKey);
  } catch (err) {
    if (legacyKey) {
      return decryptWithKey(payload, legacyKey);
    }
    throw err;
  }
};
