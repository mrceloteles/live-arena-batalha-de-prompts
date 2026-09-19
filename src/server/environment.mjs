// O que o processo precisa saber sobre ONDE ele esta rodando — e o que ele tem
// de recusar em producao.
//
// Duas decisoes moram aqui, e as duas nasceram de defeito medido:
//
// 1. Em producao, painel sem senha/segredo nao e "modo degradado": e implantacao
//    invalida. Antes, o servidor subia com o painel desabilitado, o `/healthz`
//    respondia 200 e o host marcava como pronta uma instalacao em que o professor
//    simplesmente nao conseguia entrar. Agora o boot recusa e a prontidao
//    (`/readyz`) diz o que esta faltando — sem nunca imprimir o valor secreto.
//
// 2. O limitador de tentativas usava `request.socket.remoteAddress`. Atras de um
//    proxy (Caddy, nginx, Render) esse endereco e o do PROXY: cinco PINs errados
//    de um aluno travavam a turma inteira. Cabecalho de IP encaminhado so vale
//    quando a conexao imediata esta na lista de proxies confiaveis; fora disso
//    ele e ignorado, porque qualquer um pode escrever `X-Forwarded-For`.

import { hostingProblems } from './hosting.mjs';

/** Piso de senha/segredo administrativo: o MESMO de `admin-auth.mjs`. */
export const ADMIN_MIN_PASSWORD = 8;
export const ADMIN_MIN_SECRET = 24;

/** Valores de `NODE_ENV` que contam como producao. */
const PRODUCTION_VALUES = new Set(['production', 'prod']);

export function isProduction(env = process.env) {
  return PRODUCTION_VALUES.has(String(env.NODE_ENV || '').trim().toLowerCase());
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** `::ffff:127.0.0.1` e `127.0.0.1` sao o mesmo par de sapatos. */
export function normalizeAddress(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped) return mapped[1];
  return value.toLowerCase();
}

function ipv4ToNumber(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

/**
 * Lista de proxies confiaveis: `TRUSTED_PROXIES=127.0.0.1,::1,172.17.0.0/16`.
 * Aceita endereco exato e faixa IPv4 em notacao CIDR. Nome de host nao entra:
 * resolver DNS no caminho da requisicao seria uma consulta de rede por chamada,
 * e o valor mudaria sem ninguem perceber.
 */
export function parseTrustedProxies(raw) {
  const entries = String(raw ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  const exact = new Set();
  const ranges = [];
  for (const entry of entries) {
    const [address, bits] = entry.split('/');
    const normalized = normalizeAddress(address);
    if (!normalized) continue;
    if (bits === undefined) {
      // Nome de host nao entra: nao resolvemos DNS no caminho da requisicao, e
      // comparar contra o endereco cru faria a entrada "confiavel" nunca casar
      // — pior: o operador pensaria que configurou.
      if (!IPV4.test(normalized) && !normalized.includes(':')) {
        throw new TypeError(`TRUSTED_PROXIES invalido em ${JSON.stringify(entry)}: use endereco IP ou faixa IPv4 (nome de host nao e resolvido).`);
      }
      exact.add(normalized);
      continue;
    }
    const width = Number(bits);
    const base = IPV4.test(normalized) ? ipv4ToNumber(normalized) : null;
    if (base === null || !Number.isInteger(width) || width < 0 || width > 32) {
      throw new TypeError(`TRUSTED_PROXIES invalido em ${JSON.stringify(entry)}: use endereco IP ou faixa IPv4 (ex.: 172.17.0.0/16).`);
    }
    const mask = width === 0 ? 0 : (0xffffffff << (32 - width)) >>> 0;
    ranges.push({ base: (base & mask) >>> 0, mask });
  }
  return { exact, ranges, size: exact.size + ranges.length };
}

export function isTrustedProxy(address, trusted) {
  const normalized = normalizeAddress(address);
  if (!normalized) return false;
  if (trusted.exact.has(normalized)) return true;
  const numeric = IPV4.test(normalized) ? ipv4ToNumber(normalized) : null;
  if (numeric === null) return false;
  return trusted.ranges.some(({ base, mask }) => ((numeric & mask) >>> 0) === base);
}

/**
 * Quem e o visitante desta requisicao.
 *
 * A regra e a dos proxies de verdade: o endereco da CONEXAO e a unica coisa que
 * o cliente nao escolhe. Se ele estiver na lista de proxies confiaveis, o
 * `X-Forwarded-For` que ELE anexou passa a valer — e a leitura vai da direita
 * para a esquerda, porque cada proxy anexa o endereco de quem falou com ele.
 * O primeiro que nao for proxy confiavel e o visitante; o que estiver a esquerda
 * dele foi escrito por quem nao estava la (o proprio cliente) e nao vale nada.
 */
export function clientAddress(request, trusted) {
  const socket = normalizeAddress(request?.socket?.remoteAddress);
  if (!trusted || !trusted.size) return socket;
  if (!isTrustedProxy(socket, trusted)) return socket;
  const chain = String(request?.headers?.['x-forwarded-for'] ?? '')
    .split(',')
    .map((part) => normalizeAddress(part))
    .filter(Boolean);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (!isTrustedProxy(chain[index], trusted)) return chain[index];
  }
  return socket;
}

/**
 * Problemas de configuracao de implantacao, em texto legivel e SEM valores:
 * a mensagem pode ir para o log e para o `/readyz`, e nem senha nem segredo
 * aparecem nela.
 */
export function deploymentProblems({
  env = process.env,
  adminConfigured = false,
  production = isProduction(env),
  hosting = {},
} = {}) {
  const problems = [];
  if (production && !adminConfigured) {
    problems.push(
      `painel administrativo desabilitado: defina ADMIN_PASSWORD (minimo ${ADMIN_MIN_PASSWORD} caracteres) `
      + `e ADMIN_SECRET (minimo ${ADMIN_MIN_SECRET}) no ambiente do servico`,
    );
  }
  if (String(env.JUDGE_MODE || '').trim().toLowerCase() === 'gemini-safe' && !String(env.GEMINI_API_KEY || '').trim()) {
    problems.push('JUDGE_MODE=gemini-safe exige GEMINI_API_KEY');
  }
  // A fatia de hospedagem entra pela MESMA pergunta: quem responde "esta
  // implantacao tem como funcionar?" e este modulo, e nao o boot de um lado e a
  // prontidao do outro (que era como uma instalacao sem painel passava por
  // pronta).
  problems.push(...hostingProblems({ env, production, ...hosting }));
  return problems;
}

/** Derruba o boot quando a implantacao nao tem como funcionar. */
export function assertDeployable(options) {
  const problems = deploymentProblems(options);
  if (!problems.length) return;
  throw new Error(`Configuracao de producao invalida:\n- ${problems.join('\n- ')}`);
}
