import { ApiError, object } from './validation.mjs';
import { readAdminToken, readTvToken, buildAdminCookie, buildTvCookie, isSecureRequest } from './cookies.mjs';
import { createRequestId } from './log.mjs';

function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

const PAYLOAD_LIMITS = {
  arena_save_challenge: 2_200_000,
  arena_save_challenges: 32_000_000,
};

async function readJson(request, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new ApiError(413, 'Payload muito grande.');
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try { return body ? JSON.parse(body) : {}; } catch { throw new ApiError(400, 'Payload JSON invalido.'); }
}

// `clientAddress` e injetado pelo servidor: quem sabe se ha um proxy confiavel
// na frente é o modulo de ambiente, nao o handler. O padrao é o endereco da
// conexao — que é a unica coisa da requisicao que o cliente nao escolhe.
const enderecoDaConexao = (request) => request.socket?.remoteAddress;

export function createApiHttpHandler(dispatch, { clientAddress = enderecoDaConexao, log } = {}) {
  return async function apiHttpHandler(request, response) {
    // Uma requisicao, um id: ele sai no cabecalho `x-request-id` e vai na linha
    // de log da falha. Sem isso, "deu erro" nao tem como virar investigacao.
    const requestId = createRequestId();
    const inicio = Date.now();
    // Lido antes do try para que a falha MAIS CEDO possivel (URL invalida)
    // ainda tenha acao no log.
    const acaoDaUrl = (() => {
      try { return new URL(request.url, 'http://localhost').searchParams.get('action') || ''; } catch { return ''; }
    })();
    let status = 500;
    let erro = null;
    let payloadLido = null;
    const responder = (codigo, value, headers = {}) => {
      status = codigo;
      // Recusa de validacao (403/405/413/400) tambem e falha a registrar: o
      // motivo dela e o que existe de mais util no log. Excecao ja capturada
      // tem prioridade — ela tem o nome da classe do erro.
      if (codigo >= 400 && !erro && typeof value?.error === 'string') {
        erro = { name: 'ApiResponse', message: value.error };
      }
      return json(response, codigo, value, { 'x-request-id': requestId, ...headers });
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== '/api.php') return responder(404, { ok: false, error: 'Rota não encontrada.' });
      if (request.method !== 'POST') return responder(405, { ok: false, error: 'Metodo nao permitido.' });

      // Validacao de origem e protecao CSRF (padrao moderno Fetch Metadata / OWASP)
      const secFetchSite = request.headers['sec-fetch-site'];
      if (secFetchSite === 'cross-site') {
        return responder(403, { ok: false, error: 'Requisicao cross-origin nao permitida.' });
      }
      const origin = request.headers.origin;
      if (origin) {
        try {
          const originHost = new URL(origin).host;
          const requestHost = request.headers.host;
          if (requestHost && originHost !== requestHost) {
            return responder(403, { ok: false, error: 'Origem nao autorizada.' });
          }
        } catch {
          return responder(403, { ok: false, error: 'Origem invalida.' });
        }
      }
      const action = acaoDaUrl;
      // O lote da tela unica pode carregar varias imagens de uma vez (~1,9 MB
      // cada em base64); as demais acoes seguem no limite apertado.
      const payload = object(await readJson(request, PAYLOAD_LIMITS[action] ?? 64 * 1024));
      payloadLido = payload;
      // Autenticacao administrativa via cookie HttpOnly: o servidor injeta o
      // token no payload quando o cliente nao o envia explicitamente (usado
      // pelos testes em processo / drivers, que passam admin_token no corpo).
      const cookieToken = readAdminToken(request);
      if (cookieToken && typeof payload.admin_token !== 'string') {
        payload.admin_token = cookieToken;
      }
      // Projecao: o token de 8h da TV viaja so no cookie (sem ?tk= na URL).
      const tvCookieToken = readTvToken(request);
      if (tvCookieToken && typeof payload.tv_token !== 'string') {
        payload.tv_token = tvCookieToken;
      }
      const result = await dispatch(action, payload, {
        // Atras de um proxy, `remoteAddress` e o endereco DO PROXY: cinco PINs
        // errados de um aluno travavam a turma inteira. Quem resolve isso é
        // `clientAddress` (com lista de proxies confiaveis), nao um cabecalho
        // aceito de qualquer origem.
        ip: clientAddress(request),
        host: request.headers?.host,
        protocol: isSecureRequest(request) ? 'https' : 'http',
      });
      if (action === 'admin_login' && result && result.ok === true && typeof result.admin_token === 'string') {
        // O token nunca trafega no corpo para o JS: vai so pelo Set-Cookie.
        const { admin_token, max_age, ...rest } = result;
        return responder(200, rest, {
          'set-cookie': buildAdminCookie(request, admin_token, { maxAge: Number(max_age) || 3600 }),
        });
      }
      if (action === 'admin_logout') {
        return responder(200, result, { 'set-cookie': buildAdminCookie(request, '', { clear: true }) });
      }
      if ((action === 'arena_tv_token' || action === 'arena_tv_code') && result && result.ok === true && typeof result.tv_token === 'string') {
        // Sessao de projecao: o token nunca vai no corpo/URL — so no cookie.
        const { tv_token, max_age, ...rest } = result;
        return responder(200, rest, {
          'set-cookie': buildTvCookie(request, tv_token, { maxAge: Number(max_age) || 28_800 }),
        });
      }
      return responder(200, result);
    } catch (falha) {
      const codigo = falha instanceof ApiError ? falha.status : 500;
      erro = falha;
      // Recusa recuperavel (fila/cota do teto de avaliacoes) anuncia no
      // cabecalho padrao quanto esperar: o navegador e o proxy sabem o que
      // fazer sem ler o corpo.
      const esperar = Number(falha?.details?.retry_after);
      const cabecalhos = Number.isFinite(esperar) && esperar > 0
        ? { 'retry-after': String(Math.ceil(esperar)) }
        : {};
      return responder(codigo, {
        ok: false,
        error: falha instanceof ApiError ? falha.message : 'Erro interno.',
        ...(falha instanceof ApiError && falha.details ? { details: falha.details } : {}),
      }, cabecalhos);
    } finally {
      // Toda falha sai em UMA linha: id da requisicao, acao, status, duracao e
      // a causa. O payload NAO entra — ele carrega o PIN da sala, o token do
      // aluno e o prompt escrito (ver `log.mjs`).
      if (status >= 400 && log) {
        log.failure({
          requestId,
          action: acaoDaUrl,
          status,
          durationMs: Date.now() - inicio,
          error: erro,
          // A sala resolvida pelo servidor tem prioridade sobre a que veio no
          // payload: a primeira e a verdade, a segunda e o que o cliente disse.
          roomId: erro?.roomId ?? payloadLido?.room_id,
        });
      }
    }
  };
}
