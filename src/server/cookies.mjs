// Utilitarios de cookie compartilhados entre o handler HTTP da API e o
// roteador de paginas. O token administrativo e transportado por cookie
// HttpOnly+SameSite (nunca via JS/URL), preparando o deploy publico com HTTPS.

export const ADMIN_COOKIE = 'arena_admin';
export const TV_COOKIE = 'arena_tv_session';

export function parseCookies(request) {
  const header = request.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    try { cookies[name] = decodeURIComponent(value); } catch { cookies[name] = value; }
  }
  return cookies;
}

export function readAdminToken(request) {
  return parseCookies(request)[ADMIN_COOKIE] || '';
}

export function readTvToken(request) {
  return parseCookies(request)[TV_COOKIE] || '';
}

export function isSecureRequest(request) {
  if (request.socket && request.socket.encrypted) return true;
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwarded === 'https';
}

function attribute(name, value) {
  return value === undefined ? name : `${name}=${value}`;
}

// Monta o valor do header Set-Cookie. Por padrao: HttpOnly + SameSite=Lax
// (bloqueia envio em POST cross-site, mitigando CSRF). `Secure` e adicionado
// quando a requisicao chegou por TLS ou via proxy com x-forwarded-proto https.
export function buildSetCookie({
  name,
  value,
  maxAge,
  expires,
  path = '/',
  httpOnly = true,
  sameSite = 'Lax',
  secure = false,
}) {
  const parts = [`${name}=${value}`];
  if (path) parts.push(`Path=${path}`);
  if (httpOnly) parts.push('HttpOnly');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (expires) parts.push(`Expires=${expires.toUTCString()}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildAdminCookie(request, token, { maxAge = 3600, clear = false } = {}) {
  return buildSetCookie({
    name: ADMIN_COOKIE,
    value: clear ? '' : token,
    maxAge: clear ? 0 : maxAge,
    expires: clear ? new Date(0) : undefined,
    secure: isSecureRequest(request),
  });
}

// Cookie da projecao: substitui o ?tk= da URL. E emitido quando o cockpit
// gera a tela da sala, vale 8h (mesmo TTL do token antigo) e viaja so no
// header — a URL de projecao fica apenas com o PIN da sala.
export function buildTvCookie(request, token, { maxAge = 28_800, clear = false } = {}) {
  return buildSetCookie({
    name: TV_COOKIE,
    value: clear ? '' : token,
    maxAge: clear ? 0 : maxAge,
    expires: clear ? new Date(0) : undefined,
    secure: isSecureRequest(request),
  });
}