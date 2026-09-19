import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJudges,
  resolveJudgeMode,
  resolveGeminiBaseUrl,
  judgeEndpointWarning,
  JUDGE_MODES,
  DEFAULT_JUDGE_MODE,
  DEFAULT_GEMINI_BASE_URL,
  CRITERIA_JUDGE_LIMITS,
} from '../../src/judge/configuration.mjs';
import { judgeUnavailable } from '../../src/judge/failure.mjs';

/**
 * A superficie que SOBREVIVE ao erro: o que vai para o log, para a tentativa
 * registrada no banco e para o motivo que o professor le. A chave viaja na
 * chamada (é assim que o provedor é autenticado), mas não pode sobrar aqui.
 */
const superficieDaFalha = (error) => JSON.stringify({
  name: error?.name, reason: error?.reason, status: error?.status,
  cancelled: error?.cancelled, message: error?.message, cause: error?.cause?.message,
});

const KEY = 'chave-de-teste-que-nao-pode-vazar';
const CRITERIA = [
  { criterion: 'objetivo', weight: 50 },
  { criterion: 'contexto', weight: 50 },
];

const classicInput = {
  referencePrompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
  rubric: 'Compare assunto, composicao e detalhes.',
  candidatePrompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
};

const criteriaInput = {
  mission: 'Crie um cartaz para a feira de tecnologia.',
  context: 'Feira anual do ensino medio.',
  referenceText: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
  criteria: CRITERIA,
  candidatePrompt: 'Crie um cartaz A3 para a feira de tecnologia, com data, local e contato.',
};

/** fetch espião: registra cada chamada e responde o que o roteiro mandar. */
function spyFetch(handler) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return handler({ url: String(url), init, index: calls.length });
    },
  };
}

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const geminiText = (text) => jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });

test('modo omitido e fallback: os dois juizes sao locais e nao ha rede nem com chave presente', async () => {
  const spy = spyFetch(() => { throw new Error('a rede nao deveria ser chamada'); });
  const judges = createJudges({ apiKey: KEY, fetchImpl: spy.fetchImpl });

  assert.equal(judges.mode, DEFAULT_JUDGE_MODE);
  assert.equal(DEFAULT_JUDGE_MODE, 'fallback');

  const classic = await judges.classicJudge(classicInput);
  assert.ok(classic.percent > 0);
  assert.equal(classic.metadata.provider, 'fallback');
  assert.equal(classic.metadata.judge_mode, 'fallback');
  assert.equal(classic.metadata.fallback_used, true);

  const criteria = await judges.criteriaJudge(criteriaInput);
  assert.equal(criteria.metadata.provider, 'fallback');
  assert.equal(criteria.metadata.judge_mode, 'fallback');
  assert.equal(criteria.metadata.fallback_used, true);
  assert.equal(criteria.metadata.model, 'arena-fallback-v1');
  assert.ok(criteria.feedback.length > 0);

  assert.equal(spy.calls.length, 0, 'JUDGE_MODE=fallback nao pode tocar a rede, mesmo com GEMINI_API_KEY preenchida');
});

test('modo desconhecido e erro de configuracao, nao fallback silencioso', () => {
  assert.deepEqual(JUDGE_MODES, ['fallback', 'gemini', 'gemini-safe']);
  for (const bad of ['typo', 'fake', 'gemini-safe2', 'fallback+']) {
    assert.throws(() => resolveJudgeMode(bad), (error) => {
      assert.equal(error.name, 'TypeError');
      assert.match(error.message, /JUDGE_MODE invalido/);
      for (const mode of JUDGE_MODES) assert.match(error.message, new RegExp(mode));
      return true;
    });
    assert.throws(() => createJudges({ mode: bad }), /JUDGE_MODE invalido/);
  }
  // Espaco e caixa nao sao erro: o valor e normalizado.
  assert.equal(resolveJudgeMode(' GEMINI '), 'gemini');
  assert.equal(resolveJudgeMode(''), 'fallback');
  assert.equal(resolveJudgeMode(undefined), 'fallback');
});

test('gemini: classico usa o adaptador source-compatible e criterios usam saida estruturada', async () => {
  const classicSpy = spyFetch(() => geminiText('78.5'));
  const classic = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: classicSpy.fetchImpl });
  const classicResult = await classic.classicJudge(classicInput);

  assert.equal(classicResult.percent, 78.5);
  assert.equal(classicResult.metadata.provider, 'gemini');
  assert.equal(classicResult.metadata.judge_mode, 'gemini');
  assert.equal(classicResult.metadata.fallback_used, false);
  assert.match(classicSpy.calls[0].url, /models\/gemini-3\.6-flash:generateContent\?key=/);
  const classicBody = JSON.parse(classicSpy.calls[0].init.body);
  assert.equal(classicBody.generationConfig.maxOutputTokens, 10);
  assert.equal(classicBody.generationConfig.responseSchema, undefined);

  const criteriaSpy = spyFetch(() => geminiText(JSON.stringify({
    scores: [{ criterion: 'objetivo', points: 18 }, { criterion: 'contexto', points: 16 }],
    feedback: 'Objetivo claro.',
  })));
  const criteria = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: criteriaSpy.fetchImpl });
  const criteriaResult = await criteria.criteriaJudge(criteriaInput);

  assert.equal(criteriaResult.feedback, 'Objetivo claro.');
  assert.deepEqual(criteriaResult.breakdown, { objetivo: 18, contexto: 16 });
  assert.equal(criteriaResult.metadata.provider, 'gemini');
  assert.equal(criteriaResult.metadata.fallback_used, false);
  assert.match(criteriaSpy.calls[0].url, /models\/gemini-3\.6-flash:generateContent$/);
  assert.equal(criteriaSpy.calls[0].init.headers['x-goog-api-key'], KEY);
  assert.equal(JSON.parse(criteriaSpy.calls[0].init.body).generationConfig.responseMimeType, 'application/json');
});

test('gemini: falha do provedor NAO vira nota local nas duas familias — o servidor estaciona', async () => {
  // Medido em 17/09/2026: com o projeto bloqueado (403), o modo `gemini` deu 6 de
  // 6 notas heurísticas com cara de avaliadas. A heurística deixou de ser prêmio
  // de consolação por falha do provedor: quem falha sai daqui como
  // indisponibilidade, e o servidor ESTACIONA a avaliação para reprocessar.
  const failing = spyFetch(() => { throw new Error('rede fora do ar'); });
  const judges = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: failing.fetchImpl });

  await assert.rejects(judges.classicJudge(classicInput), (error) => {
    assert.equal(error.name, 'JudgeUnavailableError');
    assert.equal(error.code, 'judge_unavailable');
    assert.match(error.reason, /gemini_/);
    assert.equal(judgeUnavailable(error)?.parkable, true, 'e uma falha que se reprocessa depois');
    return true;
  });
  await assert.rejects(judges.criteriaJudge(criteriaInput), (error) => {
    assert.equal(error.code, 'judge_unavailable');
    assert.equal(judgeUnavailable(error)?.parkable, true);
    return true;
  });
  assert.ok(failing.calls.length >= 2, 'as duas familias tentaram o provedor antes de desistir da tentativa');
});

test('gemini: HTTP 429 e timeout tambem saem como indisponibilidade, com motivo registrado', async () => {
  const limited = spyFetch(() => jsonResponse({ error: 'quota' }, 429));
  // Espera zerada: o teste mede o DESFECHO (sinal com motivo), nao a espera.
  const judges = createJudges({
    mode: 'gemini', apiKey: KEY, fetchImpl: limited.fetchImpl, model: 'modelo-de-teste',
    retryDelayMs: 0, rateLimitDelayMs: 0, maxRetryWaitMs: 0,
  });

  await assert.rejects(judges.classicJudge(classicInput), (error) => {
    assert.equal(error.reason, 'gemini_http_429');
    assert.equal(error.status, 429);
    assert.equal(error.cancelled, false);
    return true;
  });
  await assert.rejects(judges.criteriaJudge(criteriaInput), (error) => {
    assert.equal(error.reason, 'gemini_http_429');
    return true;
  });

  // Isto CONTINUA valendo: o local nao era o primeiro recurso — as duas familias
  // gastam as repeticoes antes de qualquer desfecho (ver `src/judge/retry.mjs`).
  assert.ok(limited.calls.length >= 4, `as duas familias repetiram antes de desistir (chamadas: ${limited.calls.length})`);

  // E a chave nunca sobra na falha: motivo, mensagem e causa saem daqui para o
  // log e para a tentativa registrada no banco.
  await judges.criteriaJudge(criteriaInput).catch((error) => {
    assert.doesNotMatch(superficieDaFalha(error), new RegExp(KEY));
  });
});

test('gemini-safe: exige chave no bootstrap e propaga resposta invalida sem fallback silencioso', async () => {
  assert.throws(() => createJudges({ mode: 'gemini-safe' }), /GEMINI_API_KEY/);
  assert.throws(() => createJudges({ mode: 'gemini-safe', apiKey: '   ' }), /GEMINI_API_KEY/);

  const garbage = spyFetch(() => geminiText('nao sou json'));
  const judges = createJudges({ mode: 'gemini-safe', apiKey: KEY, fetchImpl: garbage.fetchImpl });
  assert.equal(judges.mode, 'gemini-safe');
  await assert.rejects(judges.classicJudge(classicInput), (error) => {
    assert.equal(error.name, 'JudgeResponseError');
    return true;
  });
  await assert.rejects(judges.criteriaJudge(criteriaInput), (error) => {
    assert.equal(error.name, 'ArenaJudgeResponseError');
    return true;
  });

  const structured = spyFetch(() => geminiText(JSON.stringify({
    scores: [{ criterion: 'objetivo', points: 20 }, { criterion: 'contexto', points: 20 }],
    feedback: 'Otimo.',
  })));
  const safe = createJudges({ mode: 'gemini-safe', apiKey: KEY, fetchImpl: structured.fetchImpl });
  const result = await safe.criteriaJudge(criteriaInput);
  assert.equal(result.percent, 100);
  assert.equal(result.metadata.provider, 'gemini');
  assert.equal(result.metadata.judge_mode, 'gemini-safe');
  assert.equal(result.metadata.fallback_used, false);
});

test('chave ausente: fallback nos dois juizes sem tocar a rede; gemini-safe recusa antes de tentar', async () => {
  const spy = spyFetch(() => { throw new Error('sem chave nao se chama a rede'); });
  const judges = createJudges({ mode: 'gemini', fetchImpl: spy.fetchImpl });

  const classic = await judges.classicJudge(classicInput);
  assert.equal(classic.metadata.fallback_reason, 'gemini_api_key_missing');
  const criteria = await judges.criteriaJudge(criteriaInput);
  assert.equal(criteria.metadata.fallback_used, true);
  assert.equal(criteria.metadata.fallback_reason, 'gemini_api_key_missing');
  assert.equal(spy.calls.length, 0);
});

test('gemini: HTTP 5xx e timeout tambem saem como indisponibilidade, nas duas familias', async () => {
  const boom = spyFetch(() => jsonResponse({ error: 'indisponivel' }, 503));
  const judges = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: boom.fetchImpl, retries: 0 });
  await assert.rejects(judges.classicJudge(classicInput), (error) => error.reason === 'gemini_http_503');
  await assert.rejects(judges.criteriaJudge(criteriaInput), (error) => error.reason === 'gemini_http_503');

  // fetch que só responde ao abort: sem escutar o sinal, o teste penduraria.
  const hanging = spyFetch(({ init }) => new Promise((resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })));
  }));
  const slow = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: hanging.fetchImpl, timeoutMs: 20, retries: 0 });
  await assert.rejects(slow.classicJudge(classicInput), (error) => error.reason === 'gemini_timeout');
  await assert.rejects(slow.criteriaJudge(criteriaInput), (error) => error.reason === 'gemini_timeout');
});

// A heurística local não sumiu — ela só deixou de responder por "o provedor
// falhou": continua sendo a resposta para CONFIGURAÇÃO (sem chave) e para REGRA
// (texto ilegível). Estes dois casos existem para que a próxima pessoa não leia
// "sem fallback" onde o contrato diz outra coisa.
test('a heuristica continua respondendo por configuracao e por regra, nos dois modos com provedor', async () => {
  const semChave = spyFetch(() => { throw new Error('sem chave nao se chama a rede'); });
  // `gemini-safe` recusa a subida sem chave (caso proprio, mais acima): o que se
  // mede aqui e o modo em que a ausencia de chave significa "o juiz e local".
  const judges = createJudges({ mode: 'gemini', fetchImpl: semChave.fetchImpl });
  const criteria = await judges.criteriaJudge(criteriaInput);
  assert.equal(criteria.metadata.fallback_reason, 'gemini_api_key_missing');
  assert.equal(semChave.calls.length, 0);

  // Texto ilegivel: zero direto, sem chamar o provedor nem estacionar nada.
  const teclado = spyFetch(() => { throw new Error('texto ilegivel nao vai ao provedor'); });
  const comTeclado = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: teclado.fetchImpl });
  const resultado = await comTeclado.criteriaJudge({ ...criteriaInput, candidatePrompt: 'asdasdasd kkkkkkkk qqqqqqqq' });
  assert.equal(resultado.percent, 0);
  assert.equal(resultado.metadata.unreadable_text, true);
  assert.equal(teclado.calls.length, 0);
});

test('os limites do juiz por criterios preservam o que a Arena ja usava (12 s, 1 repeticao)', () => {
  assert.deepEqual(CRITERIA_JUDGE_LIMITS, { timeoutMs: 12_000, retries: 1 });
});

test('JUDGE_MODE=fallback sem chave nao inventa provedor nem motivo de queda', async () => {
  const judges = createJudges({ mode: 'fallback' });
  const criteria = await judges.criteriaJudge(criteriaInput);
  assert.equal(criteria.metadata.provider, 'fallback');
  assert.equal(criteria.metadata.fallback_used, true);
  assert.equal(criteria.metadata.judge_failed, undefined);
  assert.equal(criteria.metadata.fallback_reason, 'gemini_api_key_missing');
});

// ---------------------------------------------------------------------------
// Endpoint do provedor (GEMINI_BASE_URL)
//
// O que isto sustenta: o unico jeito autorizado de medir carga e um provedor
// CONTROLADO — sem cota e sem mandar prompt de aluno para fora. Isso so e
// possivel se o endpoint configurado chegar aos adaptadores de verdade; a
// alternativa era injetar uma funcao no lugar do adaptador, o que mediria o
// desenho e nao o caminho real (fetch, headers, timeout, repeticao, parsing).
// ---------------------------------------------------------------------------

test('o endpoint configurado chega aos dois adaptadores de verdade', async () => {
  const endpoint = 'http://127.0.0.1:9/v1beta';

  const classicSpy = spyFetch(() => geminiText('50'));
  const classic = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: classicSpy.fetchImpl, baseUrl: endpoint });
  const resultado = await classic.classicJudge(classicInput);
  assert.equal(resultado.metadata.provider, 'gemini', 'a resposta do endpoint controlado e a nota: nao houve queda para o juiz local');
  assert.match(classicSpy.calls[0].url, /^http:\/\/127\.0\.0\.1:9\/v1beta\/models\//);
  assert.equal(classic.baseUrl, endpoint, 'a prontidao le o endpoint efetivo daqui');

  // Barra final nao pode virar `//models`: o adaptador concatena o caminho.
  const criteriaSpy = spyFetch(() => geminiText(JSON.stringify({
    scores: [{ criterion: 'objetivo', points: 10 }, { criterion: 'contexto', points: 10 }],
    feedback: 'Nota do endpoint controlado.',
  })));
  const criteria = createJudges({ mode: 'gemini', apiKey: KEY, fetchImpl: criteriaSpy.fetchImpl, baseUrl: `${endpoint}/` });
  const criterios = await criteria.criteriaJudge(criteriaInput);
  assert.equal(criterios.metadata.provider, 'gemini');
  assert.match(criteriaSpy.calls[0].url, /^http:\/\/127\.0\.0\.1:9\/v1beta\/models\/gemini-3\.6-flash:generateContent$/);
  assert.equal(criteriaSpy.calls[0].url.includes('/v1beta//'), false);
});

test('URL torta de endpoint falha no boot, em qualquer modo — e o aviso nao carrega credencial', () => {
  assert.equal(resolveGeminiBaseUrl(undefined), undefined);
  assert.equal(resolveGeminiBaseUrl('   '), undefined);
  assert.equal(resolveGeminiBaseUrl('http://127.0.0.1:8080/v1beta/'), 'http://127.0.0.1:8080/v1beta');
  for (const ruim of ['nao-e-url', 'ftp://exemplo.invalido/v1', '/v1beta', 'exemplo.invalido/v1beta']) {
    assert.throws(() => resolveGeminiBaseUrl(ruim), /GEMINI_BASE_URL invalido/);
    // Mesmo em `fallback`, onde nada e chamado: typo de operador e erro de
    // configuracao, e o boot e o lugar de descobrir.
    assert.throws(() => createJudges({ mode: 'fallback', baseUrl: ruim }), /GEMINI_BASE_URL invalido/);
  }

  assert.equal(judgeEndpointWarning(undefined), null);
  assert.equal(judgeEndpointWarning(DEFAULT_GEMINI_BASE_URL), null, 'o endpoint de fabrica nao gera aviso');
  const aviso = judgeEndpointWarning('http://127.0.0.1:8080/v1beta?token=segredo-na-url');
  assert.match(aviso, /endpoint alternativo/);
  assert.match(aviso, /127\.0\.0\.1:8080/);
  assert.equal(aviso.includes('segredo-na-url'), false, 'o aviso vai para o /readyz: so a origem, nunca credencial');
});

test('em fallback o endpoint e informativo e nao ha teto — o que a prontidao mostra', () => {
  const judges = createJudges({ mode: 'fallback', baseUrl: 'http://127.0.0.1:8080/v1beta' });
  assert.equal(judges.budget, null);
  assert.equal(judges.baseUrl, 'http://127.0.0.1:8080/v1beta');
  assert.equal(createJudges({ mode: 'fallback' }).baseUrl, DEFAULT_GEMINI_BASE_URL);
});
