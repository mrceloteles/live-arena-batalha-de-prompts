/**
 * Quanto tempo uma missão merece — sempre como SUGESTÃO, para o professor
 * aceitar ou ajustar. Nada aqui é aplicado sozinho.
 *
 * A regra é curta de propósito, para o professor conseguir prever a resposta:
 *
 * 1. a MODALIDADE dá a base — uma engenharia reversa (descrever uma imagem por
 *    escrito) pede mais tempo que um prompt essencial;
 * 2. o TAMANHO do que o aluno lê (missão + contexto, em palavras) empurra a
 *    base para cima (briefing longo) ou para baixo (missão de uma linha);
 * 3. o resultado é arredondado em 15 s e limitado a [30 s, 5 min]: sugestão
 *    fora dessa faixa não ajuda ninguém no meio de uma aula.
 */

const BASE_SECONDS = Object.freeze({
  essencial: 60,
  sprint: 60,
  resgate: 90,
  diagnostico: 90,
  precisao: 120,
  refinamento: 120,
  livre: 120,
  contexto: 150,
  briefing: 150,
  reversa: 180,
  completo: 180,
  boss: 240,
});

const DEFAULT_BASE_SECONDS = 120;
const MIN_SUGGESTION_SECONDS = 30;
const MAX_SUGGESTION_SECONDS = 300;

// Piso de palavras -> ajuste em segundos (o primeiro que couber vence). Abaixo
// do menor piso a missão é lida em segundos, e o tempo sugerido cai.
const LENGTH_STEPS = Object.freeze([
  [60, 45],
  [40, 30],
  [24, 15],
  [10, 0],
]);
const SHORT_MISSION_EXTRA = -15;

const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;
const roundTo15 = (seconds) => Math.round(seconds / 15) * 15;

/** A conta crua: base da modalidade + tamanho, já arredondada e limitada. */
export function suggestedDuration({ modality, mission = '', context = '' } = {}) {
  const base = BASE_SECONDS[modality] ?? DEFAULT_BASE_SECONDS;
  const words = countWords(`${mission} ${context}`);
  const extra = (LENGTH_STEPS.find(([floor]) => words >= floor) || [0, SHORT_MISSION_EXTRA])[1];
  const seconds = Math.min(
    MAX_SUGGESTION_SECONDS,
    Math.max(MIN_SUGGESTION_SECONDS, roundTo15(base + extra)),
  );
  return { seconds, base, extra, words };
}

/**
 * A sugestão como o painel mostra: os segundos e a razão em uma linha, para o
 * professor saber de onde saiu o número antes de aceitar.
 */
export function suggestTiming(entry = {}) {
  const { seconds, extra, words } = suggestedDuration(entry);
  const reason = extra > 0
    ? `missão longa (${words} palavras)`
    : extra < 0
      ? `missão curta (${words} palavras)`
      : 'missão no tamanho típico';
  return { seconds, reason };
}

export const TIMING_SUGGESTION_BOUNDS = Object.freeze({
  min: MIN_SUGGESTION_SECONDS,
  max: MAX_SUGGESTION_SECONDS,
});
