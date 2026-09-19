// A falha do provedor como um FATO nomeado, num lugar só.
//
// Por que existe: até 17/09/2026 o modo `gemini` tratava qualquer erro do
// provedor — cota estourada, projeto sem acesso, timeout, resposta ilegível —
// como "hora de usar a heurística local". Medido, isso significava uma aula
// inteira de notas heurísticas com cara de avaliadas quando o projeto estava
// bloqueado (6 de 6 submissões), e o aluno não tinha como perceber.
//
// A heurística local não sumiu, mas deixou de ser prêmio de consolação por
// falha: ela responde por CONFIGURAÇÃO (não há provedor para chamar) e por
// REGRA (texto ilegível). Falha do provedor é outra coisa, e agora sai daqui
// como um erro reconhecível para o servidor ESTACIONAR a avaliação e
// reprocessar depois — nenhuma nota é inventada, e nenhuma submissão perde a
// nota só porque o provedor piscou.
//
// O vocabulário do motivo (`gemini_http_429`, `gemini_timeout`,
// `gemini_invalid_response`…) nasceu na família por critérios e é o texto que o
// professor lê no detalhe da sala. Ele mora aqui para as duas famílias não
// batizarem a mesma falha de dois jeitos.

/**
 * Erro de indisponibilidade do provedor. É o sinal de máquina que o servidor
 * lê para estacionar — e não uma frase para o aluno.
 */
export class JudgeUnavailableError extends Error {
  constructor(message, {
    reason, status = null, retryAfterMs = 0, cancelled = false, cause,
  } = {}) {
    // O motivo entra na MENSAGEM quando ninguem passou uma: esta mensagem é o
    // que fica registrado na tentativa de avaliação do banco e no log — e
    // "O provedor nao entregou a avaliacao" sozinho não distingue cota esgotada
    // (429) de projeto sem acesso (403), que é o que a operação precisa saber.
    super(message || `O provedor nao entregou a avaliacao (${reason || 'gemini_error'})`, { cause });
    this.name = 'JudgeUnavailableError';
    this.code = 'judge_unavailable';
    this.reason = reason || 'gemini_error';
    this.status = Number.isFinite(status) ? Number(status) : null;
    this.retryAfterMs = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
    // Cancelamento de fora (encerramento do processo) NÃO é falha do provedor e
    // não se estaciona NESTE processo, que está saindo — a avaliação não se
    // perde por isso: a submissão continua sem nota no banco e a próxima subida
    // a retoma (`retomarEstacionadas`).
    this.cancelled = Boolean(cancelled);
  }
}

/** Nomes dos erros dos adaptadores que contam como falha do provedor. */
const NOMES_DE_FALHA = new Set([
  'ArenaJudgeResponseError',
  'JudgeResponseError',
  'ArenaJudgeTimeoutError',
  'JudgeTimeoutError',
]);

/**
 * Traduz o erro em `{ reason, status, retryAfterMs, parkable }`, ou `null` quando
 * NÃO é falha do provedor.
 *
 * A regra é conservadora de propósito: um erro que não se reconhece (um bug, um
 * `TypeError` de contrato) não é estacionado — ele falha explícito, como antes,
 * porque repetir não consertaria. Estacionar o que não se entende só adiaria o
 * mesmo defeito e esconderia a causa.
 */
export function judgeUnavailable(error) {
  if (!error) return null;
  if (error.code === 'judge_unavailable') {
    return {
      reason: error.reason,
      status: error.status ?? null,
      retryAfterMs: Number(error.retryAfterMs) || 0,
      parkable: !error.cancelled,
    };
  }
  if (error.cancelled === true || NOMES_DE_FALHA.has(error.name)) {
    return {
      reason: failureReason(error),
      status: error.status ?? null,
      retryAfterMs: Number.isFinite(error.retryAfter) ? Math.max(0, Number(error.retryAfter)) : 0,
      parkable: error.cancelled !== true,
    };
  }
  return null;
}

/**
 * O nome da falha. É este texto que o professor lê, então ele diz o que
 * aconteceu (`gemini_http_429`) e não o nome da classe de erro
 * (`gemini_ArenaJudgeResponseError`), que não distingue cota de resposta
 * malformada.
 */
export function failureReason(error) {
  if (!error) return 'gemini_error';
  if (error.cancelled === true) return 'gemini_cancelled';
  if (typeof error.reason === 'string' && error.reason) return error.reason;
  if (Number.isFinite(error.status)) return `gemini_http_${error.status}`;
  const nome = String(error.name || '');
  if (nome === 'ArenaJudgeTimeoutError' || nome === 'JudgeTimeoutError') return 'gemini_timeout';
  if (nome === 'ArenaJudgeResponseError' || nome === 'JudgeResponseError') return 'gemini_invalid_response';
  return `gemini_${nome || 'error'}`;
}
