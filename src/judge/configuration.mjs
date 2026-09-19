// Politica de provedor dos juizes.
//
// O produto tem DUAS familias de avaliacao, com algoritmos e formatos
// proprios e que nao devem ser unificados:
//
//   - classica:  percentual unico (motor do pacote-base / formula historica);
//   - criterios: nota por criterio e feedback, usada nas missoes
//                personalizadas da Arena.
//
// O que este modulo unifica e a POLITICA DE PROVEDOR: as duas familias saem
// do mesmo JUDGE_MODE. Antes disso a Arena montava o juiz por criterios
// sozinha, lendo `process.env.GEMINI_API_KEY`, e por isso `JUDGE_MODE=fallback`
// podia continuar chamando Gemini quando havia chave configurada.
//
//   fallback    -> as duas familias sao locais e deterministicas; nenhuma
//                  chamada externa, mesmo com GEMINI_API_KEY preenchida;
//   gemini      -> as duas chamam Gemini; falha do provedor depois das
//                  repetições NAO vira nota heuristica: a avaliacao e
//                  estacionada para reprocessar (`parking.mjs`), porque uma nota
//                  que ninguem avaliou e pior que uma nota que ainda vem;
//   gemini-safe -> as duas usam saida estruturada e propagam falha invalida
//                  (sem fallback silencioso); exige chave no bootstrap.
//
// Em que a heuristica local SOBREVIVE, nos dois modos com provedor: quando nao
// ha chave (nao existe provedor para chamar) e quando o texto nao e avaliável
// (regra do produto: soco de teclado nao compra ponto). Falha do provedor deixou
// de ser um terceiro motivo.
import { createJudgeBudget } from './budget.mjs';
import { createFakeJudge } from './fake-judge.mjs';
import { createGeminiJudge } from './gemini-judge.mjs';
import { createSourceCompatibleJudge } from './source-compatible-judge.mjs';
import { createCriteriaJudge, createFallbackSafeCriteriaJudge } from './criteria-judge.mjs';

// Tetos de producao das avaliacoes externas. Sao folgados de proposito: uma
// turma de 50 alunos nao chega perto da fila, e o teto existe para o caso em que
// o provedor trava (a fila nao cresce sem fim e a cota da hora nao e queimada).
export const JUDGE_LIMITS = Object.freeze({ maxConcurrent: 4, perHour: 400, maxQueued: 64 });

export const JUDGE_MODES = Object.freeze(['fallback', 'gemini', 'gemini-safe']);
export const DEFAULT_JUDGE_MODE = 'fallback';

/**
 * Endpoint padrao do provedor. Existe como constante — e nao so como literal
 * dentro de cada adaptador — porque a prontidao precisa saber se o endpoint
 * configurado e o de fabrica para dizer ao operador quando nao e.
 */
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Le `GEMINI_BASE_URL` (opcional) do ambiente.
 *
 * Por que existe: os quatro adaptadores ja aceitavam `baseUrl`, mas o caminho
 * de producao so conseguia falar com o endpoint de fabrica. Isso tornava
 * impossivel a unica medicao de carga autorizada — a que roda contra um
 * provedor CONTROLADO, sem gastar cota nem mandar prompt de aluno para fora.
 * Com o override, o stub controlado passa pelo adaptador DE VERDADE (fetch,
 * headers, timeout, repeticao, parsing), e nao por uma funcao injetada no lugar
 * dele — que era o que o arnes anterior fazia.
 *
 * A validacao e sempre feita, mesmo em `fallback` (onde nada e chamado): um
 * typo em URL de operador e defeito de configuracao, e o bootstrap e o lugar de
 * descobrir isso, nao a primeira aula.
 */
export function resolveGeminiBaseUrl(raw) {
  const bruto = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!bruto) return undefined;
  let url;
  try {
    url = new URL(bruto);
  } catch {
    throw new TypeError(
      `GEMINI_BASE_URL invalido: ${JSON.stringify(bruto)}. Informe uma URL absoluta http(s) `
      + `(ex.: ${DEFAULT_GEMINI_BASE_URL}).`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(
      `GEMINI_BASE_URL invalido: ${JSON.stringify(bruto)}. So http/https sao aceitos.`,
    );
  }
  // Sem barra final: os adaptadores montam `${baseUrl}/models/...`.
  return bruto.replace(/\/+$/, '');
}

/**
 * Aviso (nao impedimento) quando o juiz nao aponta para o endpoint de fabrica.
 *
 * Nao bloqueia de proposito: o override e legitimo em homologacao e medicao, e
 * recusar a subida por causa dele impediria justamente a execucao que a
 * auditoria pede. O que nao pode e a instancia ficar redirecionando avaliacao
 * de aluno sem o operador ver. Imprime so a ORIGEM: o resto da URL pode carregar
 * credencial de terceiro e isto vai para o `/readyz`.
 */
export function judgeEndpointWarning(baseUrl) {
  if (!baseUrl || baseUrl === DEFAULT_GEMINI_BASE_URL) return null;
  let origem = baseUrl;
  try {
    origem = new URL(baseUrl).origin;
  } catch {
    // Ja validado por `resolveGeminiBaseUrl`; cai aqui so se o chamador inventar.
  }
  return `juiz apontando para um endpoint alternativo (${origem}): use isto so em homologacao/medicao, `
    + 'com um destino que voce controla. Em producao, remova GEMINI_BASE_URL para voltar ao provedor oficial.';
}
// Limites do juiz por criterios preservados do que a Arena usava antes de a
// politica virar um ponto unico (timeout de 12 s, uma repeticao). Nao sao
// ajuste novo: sem eles, o juiz da Arena passaria a repetir 2x com 15 s.
export const CRITERIA_JUDGE_LIMITS = Object.freeze({ timeoutMs: 12_000, retries: 1 });

/** Normaliza o modo; valor desconhecido e erro de configuracao, nao fallback. */
export function resolveJudgeMode(rawMode) {
  const omitted = rawMode === undefined || rawMode === null || String(rawMode).trim() === '';
  const mode = omitted ? DEFAULT_JUDGE_MODE : String(rawMode).trim().toLowerCase();
  if (!JUDGE_MODES.includes(mode)) {
    throw new TypeError(
      `JUDGE_MODE invalido: ${JSON.stringify(String(rawMode))}. Modos aceitos: ${JUDGE_MODES.join(', ')}.`,
    );
  }
  return mode;
}

/**
 * Carimba na resposta a politica que a produziu, para o relatorio distinguir
 * nota Gemini de nota local sem depender do prefixo do modelo. Nao altera
 * percentual, breakdown nem feedback: so completao de metadados.
 */
function stampPolicy(judge, mode) {
  return async function policyJudge(input) {
    const result = await judge(input);
    const metadata = { ...(result?.metadata || {}) };
    metadata.judge_mode = mode;
    if (metadata.provider === undefined) metadata.provider = 'local';
    if (typeof metadata.fallback_used !== 'boolean') metadata.fallback_used = metadata.provider !== 'gemini';
    return { ...result, metadata };
  };
}

/**
 * Ponto unico de construcao dos dois juizes.
 * Recebe a politica explicitamente ({ mode, apiKey, model, fetchImpl }) e
 * devolve { mode, classicJudge, criteriaJudge }. Nao le `process.env`.
 * `timeoutMs`/`retries` so existem para overrides de teste e de operacao: os
 * valores usados em producao sao os padroes de cada familia.
 */
/**
 * `signal` (opcional) é o cancelamento do encerramento do processo: chega aos
 * quatro adaptadores para que uma chamada externa em voo não segure a drenagem
 * nem seja confundida com tempo esgotado. Sem ele, nada muda.
 *
 * `budget` (opcional) é o teto de avaliações externas da instalação. Ele é
 * criado aqui quando o modo usa rede e não veio nenhum: o teto é do processo,
 * não de cada família de juiz. Em `fallback` não há teto — não há rede para
 * limitar — e o objeto devolvido diz isso (`budget: null`), para a prontidão
 * poder mostrar a diferença entre "sem teto" e "teto folgado".
 */
export function createJudges({
  mode, apiKey, model, fetchImpl, timeoutMs, retries,
  // Espera entre tentativas. Existem para operação e para teste: com delay 0,
  // um teste de contagem de tentativas não precisa esperar para provar nada.
  retryDelayMs, rateLimitDelayMs, maxRetryWaitMs,
  signal, budget, budgetLimits, baseUrl,
} = {}) {
  const resolved = resolveJudgeMode(mode);
  // Validado aqui, antes de qualquer adaptador existir: URL torta e erro de
  // configuracao e falha o boot, nao a primeira avaliacao da aula.
  const endpoint = resolveGeminiBaseUrl(baseUrl);
  const key = typeof apiKey === 'string' && apiKey.trim() ? apiKey : undefined;
  if (resolved === 'gemini-safe' && !key) {
    throw new TypeError('JUDGE_MODE=gemini-safe exige GEMINI_API_KEY: sem chave o juiz estruturado nao tem o que chamar.');
  }
  const overrides = {
    ...(Number.isFinite(timeoutMs) ? { timeoutMs } : {}),
    ...(Number.isFinite(retries) ? { retries } : {}),
    ...(Number.isFinite(retryDelayMs) ? { retryDelayMs } : {}),
    ...(Number.isFinite(rateLimitDelayMs) ? { rateLimitDelayMs } : {}),
    ...(Number.isFinite(maxRetryWaitMs) ? { maxRetryWaitMs } : {}),
  };
  const base = { model: model || undefined, fetchImpl, ...overrides, ...(signal ? { signal } : {}) };
  // O endpoint so entra nas opcoes dos adaptadores com rede; em `fallback` ele
  // fica so como informacao de configuracao (e nao ha avaliacao externa para
  // redirecionar).
  const options = { apiKey: key, ...base, ...(endpoint ? { baseUrl: endpoint } : {}) };
  // Nos modos com provedor, falha DELE nao vira heuristica: o adaptador sinaliza
  // a indisponibilidade (`failure.mjs`) e quem decide o que fazer com a
  // avaliacao e o servidor — que a estaciona em vez de inventar nota.

  if (resolved === 'fallback') {
    // A ausencia da chave e a trava que garante zero rede: `createCriteriaJudge`
    // devolve o resultado local antes de qualquer fetch quando nao ha chave.
    // Nao repassamos `apiKey` de proposito, nem que ela exista no ambiente.
    return {
      mode: resolved,
      baseUrl: endpoint ?? DEFAULT_GEMINI_BASE_URL,
      budget: null,
      classicJudge: stampPolicy(createFakeJudge(), resolved),
      criteriaJudge: stampPolicy(createFallbackSafeCriteriaJudge(base), resolved),
    };
  }

  const teto = budget || createJudgeBudget({ ...JUDGE_LIMITS, ...budgetLimits });
  /**
   * O teto cobre a avaliacao INTEIRA (uma submissao), nao cada tentativa HTTP
   * do adaptador: repetir por erro 500 do provedor nao consome dois lugares.
   * Ele fica por fora de `stampPolicy` para valer tambem quando o resultado sai
   * do fallback local — o lugar ja foi gasto.
   */
  const comTeto = (judge) => async (input) => teto.run(() => judge(input));

  if (resolved === 'gemini') {
    return {
      mode: resolved,
      baseUrl: endpoint ?? DEFAULT_GEMINI_BASE_URL,
      budget: teto,
      classicJudge: comTeto(stampPolicy(createSourceCompatibleJudge({ ...options, onProviderFailure: 'throw' }), resolved)),
      criteriaJudge: comTeto(stampPolicy(createFallbackSafeCriteriaJudge({ ...CRITERIA_JUDGE_LIMITS, ...options, onProviderFailure: 'throw' }), resolved)),
    };
  }

  return {
    mode: resolved,
    baseUrl: endpoint ?? DEFAULT_GEMINI_BASE_URL,
    budget: teto,
    classicJudge: comTeto(stampPolicy(createGeminiJudge(options), resolved)),
    criteriaJudge: comTeto(stampPolicy(createCriteriaJudge({ ...CRITERIA_JUDGE_LIMITS, ...options }), resolved)),
  };
}
