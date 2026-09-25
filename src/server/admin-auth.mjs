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

  /**
   * A CAUSA da recusa, e nao so o sim/nao.
   *
   * `verify` responde se a credencial vale, e para o servidor isso basta: as
   * tres recusas viram a mesma resposta. Quem explica ao professor precisa da
   * causa — "sua sessao venceu, entre de novo" e uma frase, "este cookie nao e
   * desta instalacao" e outra, e "voce nao mandou credencial nenhuma" e uma
   * terceira. E o mesmo status 401 nos tres casos: o servidor nao muda de
   * comportamento por causa do motivo, so o texto.
   *
   * `not_configured` existe porque sem senha/segredo nao ha login possivel: a
   * administracao responde 503 nesse caso (ver `admin_login`), e tratar isso
   * como "sessao ausente" mandaria o professor entrar com uma senha que nao
   * existe.
   */
  const check = (token) => {
    if (!configured) return { ok: false, reason: 'not_configured' };
    if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'session_missing' };
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return { ok: false, reason: 'session_invalid' };
    if (!sameSecret(signature, sign(payload))) return { ok: false, reason: 'session_invalid' };
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, reason: 'session_invalid' };
    }
    if (!Number.isFinite(decoded?.exp)) return { ok: false, reason: 'session_invalid' };
    if (decoded.exp < now()) return { ok: false, reason: 'session_expired', expiresAt: decoded.exp };
    return { ok: true, expiresAt: decoded.exp };
  };

  return {
    configured,
    check,
    login(candidate) {
      if (!configured || !sameSecret(candidate, password)) return null;
      const expiresAt = Math.floor(now()) + ttlSeconds;
      const payload = encode({ exp: expiresAt });
      return { token: `${payload}.${sign(payload)}`, expiresAt };
    },
    verify: (token) => check(token).ok,
  };
}

