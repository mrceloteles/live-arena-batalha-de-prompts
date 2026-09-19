import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function sameSecret(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

export function createAdminAuth({
  password,
  secret,
  now = () => Date.now() / 1000,
  ttlSeconds = 3600,
} = {}) {
  const configured = typeof password === 'string' && password.length >= 8
    && typeof secret === 'string' && secret.length >= 24;

  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');

  return {
    configured,
    login(candidate) {
      if (!configured || !sameSecret(candidate, password)) return null;
      const expiresAt = Math.floor(now()) + ttlSeconds;
      const payload = encode({ exp: expiresAt });
      return { token: `${payload}.${sign(payload)}`, expiresAt };
    },
    verify(token) {
      if (!configured || typeof token !== 'string') return false;
      const [payload, signature, extra] = token.split('.');
      if (!payload || !signature || extra) return false;
      const expected = sign(payload);
      if (!sameSecret(signature, expected)) return false;
      try {
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return Number.isFinite(decoded.exp) && decoded.exp >= now();
      } catch {
        return false;
      }
    },
  };
}

