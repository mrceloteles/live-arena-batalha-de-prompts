import { createJudge } from './judge.mjs';
import { sourceFallbackPercent } from './fake-judge.mjs';
import { isUnreadableText, UNREADABLE_FEEDBACK } from './criteria-judge.mjs';
import {
  CLASSIC_DEADLINE_MS, JUDGE_RETRY_LIMITS,
  retryableStatus, retryAfterMs, waitBeforeRetry, hasTimeForRetry,
} from './retry.mjs';
import { JudgeUnavailableError } from './failure.mjs';

export const SOURCE_COMPATIBLE_CONFIG = Object.freeze({
  model: 'gemini-3.6-flash',
  temperature: 0.1,
  maxOutputTokens: 10,
  timeoutMs: 8000,
  // Repetição (ver `retry.mjs`): a espera curta é para 5xx/timeout; a de 429 é
  // de segundo porque cota POR MINUTO volta em segundos.
  retries: JUDGE_RETRY_LIMITS.retries,
  baseDelayMs: JUDGE_RETRY_LIMITS.baseDelayMs,
  rateLimitDelayMs: JUDGE_RETRY_LIMITS.rateLimitDelayMs,
  maxWaitMs: JUDGE_RETRY_LIMITS.maxWaitMs,
  // O fluxo clássico é síncrono: o navegador aborta em 12 s (`app.js`), então
  // cada tentativa (e a espera) tem de caber nesse prazo.
  deadlineMs: CLASSIC_DEADLINE_MS,
});

function packageInstruction({ referencePrompt, candidatePrompt }) {
  return `Você é um juiz de precisão semântica para uma Batalha de Prompts de IA.
Compare o prompt de referência (original) com o prompt escrito pelo jogador.
Avalie a proximidade semântica, elementos descritivos (sujeito, estilo, iluminação, ambiente, câmera, detalhes).
Responda EXCLUSIVAMENTE com um número de 0 a 100 representando a porcentagem de precisão/acerto (exemplo: 78.5). Não inclua nenhum outro texto ou símbolo.

Prompt Original: "${referencePrompt}"
Prompt do Jogador: "${candidatePrompt}"`;
}

function parsePercent(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) return null;
  const match = text.trim().match(/(\d+(?:\.\d+)?)/u);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.min(Math.max(value, 0), 100) * 10_000) / 10_000;
}

function fallbackResult(input, reason, status = null) {
  return {
    percent: sourceFallbackPercent(input.referencePrompt, input.candidatePrompt),
    explanation: 'Fallback local do pacote-base: 40% similaridade textual + 60% cobertura de palavras.',
    metadata: {
      provider: 'fallback',
      model: 'source-fallback-v1',
      fallback_used: true,
      fallback_reason: reason,
      gemini_status: status,
    },
  };
}

const sleep = (ms) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export function createSourceCompatibleJudge({
  apiKey,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  model = SOURCE_COMPATIBLE_CONFIG.model,
  timeoutMs = SOURCE_COMPATIBLE_CONFIG.timeoutMs,
  retries = SOURCE_COMPATIBLE_CONFIG.retries,
  retryDelayMs = SOURCE_COMPATIBLE_CONFIG.baseDelayMs,
  rateLimitDelayMs = SOURCE_COMPATIBLE_CONFIG.rateLimitDelayMs,
  maxRetryWaitMs = SOURCE_COMPATIBLE_CONFIG.maxWaitMs,
  deadlineMs = SOURCE_COMPATIBLE_CONFIG.deadlineMs,
  // Sinal de fora (encerramento do servidor): derruba a chamada em voo. Sem
  // sinal, nada muda.
  signal,
  // O que fazer quando o provedor falha DEPOIS das repetições:
  //   'throw' (padrão desde 17/09/2026): sinaliza indisponibilidade do provedor,
  //     para quem chamou (o servidor) ESTACIONAR a avaliação e reprocessar
  //     depois — nenhuma nota que ninguém avaliou;
  //   'fallback': grava a nota heurística local marcada (o que este módulo fazia
  //     até 17/09/2026, quando era o padrão).
  // O padrão virou `'throw'` porque, com o antigo, esquecer o parâmetro já
  // bastava para a heurística voltar a ser prêmio de consolação por falha do
  // provedor — exatamente o defeito medido (projeto bloqueado, turma inteira com
  // nota local com cara de avaliada). O comportamento antigo é opt-in explícito.
  // O ponto único de política (`configuration.mjs`) escolhe; aqui só se executa.
  // A heurística continua respondendo por CONFIGURAÇÃO (sem chave) e por REGRA
  // (texto ilegível) — as duas de propósito, e nos dois modos.
  onProviderFailure = 'throw',
} = {}) {
  if (fetchImpl !== undefined && typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  // Toda saída de falha do provedor passa por aqui: é o único lugar que escolhe
  // entre a nota heurística marcada e o sinal de indisponibilidade.
  const indisponivel = (input, motivo, { status = null, retryAfterMs = 0, cancelled = false } = {}) => {
    if (onProviderFailure !== 'throw') return fallbackResult(input, motivo, status);
    throw new JudgeUnavailableError(undefined, {
      reason: motivo, status, retryAfterMs, cancelled,
    });
  };

  return createJudge(async (input) => {
    // Texto ilegivel nao e avaliado pelo modelo nem herda o piso do fallback:
    // zero direto, sem gastar cota.
    if (isUnreadableText(input.candidatePrompt)) {
      return {
        percent: 0,
        explanation: UNREADABLE_FEEDBACK,
        metadata: {
          provider: 'fallback',
          model: 'source-fallback-v1',
          fallback_used: true,
          fallback_reason: 'unreadable_text',
          unreadable_text: true,
        },
      };
    }

    if (typeof apiKey !== 'string' || !apiKey) {
      return fallbackResult(input, 'gemini_api_key_missing');
    }

    if (signal?.aborted) return indisponivel(input, 'gemini_cancelled', { cancelled: true });

    // Repetição ANTES do fallback. Antes disto este adaptador não repetia NADA:
    // o primeiro 429 ou 500 já virava nota heurística. Medido em 17/09/2026, um
    // 429 dava 6 de 6 notas locais sem o aluno ver diferença. A política (o que
    // se repete, quanto se espera) está em `retry.mjs`, compartilhada com o juiz
    // por critérios — as duas famílias não podem discordar sobre isto.
    let ultimoMotivo = 'gemini_error:sem_tentativa';
    let ultimoStatus;
    const inicio = Date.now();
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal?.aborted) return indisponivel(input, 'gemini_cancelled', { cancelled: true });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const cancelar = () => controller.abort();
      signal?.addEventListener('abort', cancelar, { once: true });
      try {
        const response = await fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: packageInstruction(input) }] }],
            generationConfig: {
              temperature: SOURCE_COMPATIBLE_CONFIG.temperature,
              maxOutputTokens: SOURCE_COMPATIBLE_CONFIG.maxOutputTokens,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          ultimoMotivo = `gemini_http_${response.status}`;
          ultimoStatus = response.status;
          const esperaDoProvedor = retryAfterMs(response);
          // A espera acontece com o relógio da tentativa ainda armado (o
          // `finally` só roda ao sair do laço): o abort do próprio timeout não
          // afeta uma resposta já recebida, e a tentativa seguinte tem relógio
          // novo.
          if (retryableStatus(response.status) && attempt < retries) {
            const espera = waitBeforeRetry({
              attempt,
              status: response.status,
              retryAfter: esperaDoProvedor,
              baseDelayMs: retryDelayMs,
              rateLimitDelayMs,
              maxWaitMs: maxRetryWaitMs,
            });
            // Sem tempo para outra tentativa, a nota local sai agora: quem
            // chamou já esperou o bastante, e uma repetição que estoura o prazo
            // é pior que não repetir (`hasTimeForRetry`).
            if (hasTimeForRetry({
              attempt,
              retries,
              elapsedMs: Date.now() - inicio,
              waitMs: espera,
              attemptTimeoutMs: timeoutMs,
              deadlineMs,
            })) {
              await sleep(espera);
              continue;
            }
          }
          return indisponivel(input, ultimoMotivo, { status: ultimoStatus, retryAfterMs: esperaDoProvedor });
        }

        const payload = await response.json();
        const percent = parsePercent(payload);
        // Saída numérica inválida com HTTP 200 não se repete: o provedor
        // respondeu, e repetir a mesma pergunta tende a devolver o mesmo lixo.
        if (percent === null) return indisponivel(input, 'gemini_invalid_numeric_output', { status: response.status ?? 200 });

        return {
          percent,
          explanation: 'Juiz semântico compatível com o pacote-base Gemini 2.0 Flash.',
          metadata: {
            provider: 'gemini',
            model,
            modelVersion: payload?.modelVersion ?? null,
            fallback_used: false,
            temperature: SOURCE_COMPATIBLE_CONFIG.temperature,
            maxOutputTokens: SOURCE_COMPATIBLE_CONFIG.maxOutputTokens,
            attempt: attempt + 1,
          },
        };
      } catch (error) {
        // O sinal de indisponibilidade atravessa: reembrulhar aqui trocaria o
        // motivo que o professor lê pelo nome da classe de erro.
        if (error?.code === 'judge_unavailable') throw error;
        // Ordem importa: cancelamento de fora nao pode ser reportado como tempo
        // esgotado — sao causas diferentes no relatorio.
        if (signal?.aborted) return indisponivel(input, 'gemini_cancelled', { cancelled: true });
        const timedOut = controller.signal.aborted || error?.name === 'AbortError';
        ultimoMotivo = timedOut ? 'gemini_timeout' : `gemini_error:${String(error?.message || error)}`;
        if (attempt < retries) {
          const espera = waitBeforeRetry({
            attempt,
            baseDelayMs: retryDelayMs,
            rateLimitDelayMs,
            maxWaitMs: maxRetryWaitMs,
          });
          if (hasTimeForRetry({
            attempt,
            retries,
            elapsedMs: Date.now() - inicio,
            waitMs: espera,
            attemptTimeoutMs: timeoutMs,
            deadlineMs,
          })) {
            await sleep(espera);
            continue;
          }
        }
        return indisponivel(input, ultimoMotivo);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancelar);
      }
    }
    return indisponivel(input, ultimoMotivo, { status: ultimoStatus });
  });
}

