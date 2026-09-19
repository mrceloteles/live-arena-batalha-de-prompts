// O PÁTIO das avaliações que o provedor não conseguiu entregar.
//
// O defeito que isto corrige: quando o provedor falhava depois das repetições, o
// modo `gemini` gravava a nota HEURÍSTICA local — e a submissão do aluno ficava
// com uma nota que ninguém avaliou, com cara de avaliada. A turma inteira, no
// caso medido (projeto bloqueado, 403).
//
// O que passa a acontecer: a avaliação é ESTACIONADA aqui, com a submissão (id,
// tentativa) já criada no banco, e reprocessada depois com espera crescente. A
// nota que o aluno vê ou vem do provedor ou não existe — e enquanto não existe,
// a tela diz exatamente isso: "recebida, a nota vem".
//
// O que este módulo NÃO é: fila de trabalho genérica. Ele guarda um punhado de
// avaliações com prazo e teto de tentativas e não cria conexões nem threads:
// cada tentativa é a mesma tarefa assíncrona que o envio já usava.
//
// O que ele NÃO guarda: a fila. Ela é o BANCO — submissão sem linha em
// `arena_scores` é "ainda esperando nota" —, e este módulo é só o relógio de
// espera de quem está de pé agora. Por isso um reinício não descarta nada: a
// submissão continua sem nota e o próximo processo a retoma (`limits`,
// `attemptsSoFar` e `waitMs` existem para isso). Antes disto, a fila morava numa
// memória que morria no redeploy.
//
// Teto de tentativas existe para o caso patológico (provedor fora por horas):
// sem ele, uma instalação com chave revogada tentaria para sempre. As tentativas
// que passam do teto ficam registradas em `exhausted` — visível na prontidão e
// no log, nunca escondidas.
//
// O teto de um surto não é o teto da história: quem decide isso é `attemptsAllowed`
// na entrada, e quem o usa é o VIGIA da fila (`arena-api.mjs`), que rearma uma
// avaliação já esgotada depois de um resfriamento e dá a ela UMA tentativa. Assim
// o provedor que volta dez minutos depois é aproveitado sem que o pátio volte a
// martelar: uma tentativa por rearme, com teto de rearmes, e o teto de custo da
// instalação por cima disso.

export const JUDGE_PARK_LIMITS = Object.freeze({
  // Reprocessamentos depois da tentativa que já falhou no envio.
  maxAttempts: 4,
  // Primeira espera: curta o bastante para o provedor voltar dentro da aula,
  // longa o bastante para não virar laço de chamadas.
  baseDelayMs: 5_000,
  // Teto da espera entre tentativas: um provedor fora por meia hora não pode
  // segurar a memória nem prometer nota para o resto do dia.
  maxDelayMs: 60_000,
});

/**
 * Espera da tentativa `attempt` (1 = o primeiro reprocessamento).
 * A espera do provedor manda quando ela é maior — e o teto vale para as duas,
 * para um `Retry-After: 3600` não deixar a avaliação pendurada.
 */
export function waitBeforeReprocess({ attempt = 1, retryAfterMs = 0, baseDelayMs = JUDGE_PARK_LIMITS.baseDelayMs, maxDelayMs = JUDGE_PARK_LIMITS.maxDelayMs } = {}) {
  const exponencial = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(maxDelayMs, Math.max(exponencial, Number(retryAfterMs) || 0, 0));
}

/**
 * @param {{ maxAttempts?, baseDelayMs?, maxDelayMs?, now?, setTimeoutImpl?, clearTimeoutImpl?, log?, onSettled? }} opcoes
 *   `onSettled(entrada, erro)` roda a cada tentativa terminada — é por onde a
 *   sala é avisada de que o estado mudou (nota que chegou, ou tentativa que
 *   falhou de novo).
 */
export function createEvaluationParking({
  maxAttempts = JUDGE_PARK_LIMITS.maxAttempts,
  baseDelayMs = JUDGE_PARK_LIMITS.baseDelayMs,
  maxDelayMs = JUDGE_PARK_LIMITS.maxDelayMs,
  now = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  log = () => {},
  onSettled = () => {},
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('maxAttempts precisa ser inteiro >= 1');

  /** chave (= id da submissão) -> entrada. Uma avaliação por chave, sempre. */
  const patio = new Map();
  const contadores = { resolved: 0, exhausted: 0, cancelled: 0 };
  /** Quem espera o pátio esvaziar (teste e encerramento). */
  let ouvintes = [];

  const acordar = () => {
    if (patio.size > 0) return;
    const pendentes = ouvintes;
    ouvintes = [];
    for (const resolve of pendentes) resolve();
  };

  const proximaEspera = () => {
    let menor = null;
    for (const entrada of patio.values()) {
      if (entrada.timer === null) continue;
      if (menor === null || entrada.agendadoPara < menor) menor = entrada.agendadoPara;
    }
    return menor === null ? null : Math.max(0, menor - now());
  };

  function agendar(entrada, esperaMs) {
    entrada.agendadoPara = now() + esperaMs;
    entrada.timer = setTimeoutImpl(() => { entrada.timer = null; void tentar(entrada); }, esperaMs);
    // Nada aqui pode segurar o processo vivo: o pátio é trabalho de fundo, e um
    // encerramento não pode esperar a última espera vencer.
    entrada.timer?.unref?.();
  }

  const avisar = (entrada, erro) => {
    try {
      (entrada.aoTerminar || onSettled)(entrada, erro);
    } catch (falhaDoAviso) {
      log('judge_park_notify_failed', { key: entrada.key, error: String(falhaDoAviso?.message || falhaDoAviso).slice(0, 200) });
    }
  };

  /** Desistiu: a entrada sai da fila e a desistência fica CONTADA, não escondida. */
  const desistir = (entrada, error) => {
    patio.delete(entrada.key);
    contadores.exhausted += 1;
    log('judge_park_exhausted', {
      key: entrada.key,
      room_id: entrada.roomId,
      attempts: entrada.attempt,
      reason: entrada.reason,
      error: String(error?.message || error).slice(0, 200),
    });
    avisar(entrada, error);
    acordar();
  };

  async function tentar(entrada) {
    if (entrada.saindo) return;
    // Teto conferido ANTES de chamar: uma avaliação retomada de outro processo
    // pode chegar aqui já com as tentativas gastas (o número vem do banco) —
    // nesse caso não se chama o provedor de novo, desiste e conta.
    if (entrada.attempt >= entrada.attemptsAllowed) {
      desistir(entrada, new Error('tentativas esgotadas antes deste processo'));
      return undefined;
    }
    entrada.attempt += 1;
    try {
      const resultado = await entrada.task({ attempt: entrada.attempt });
      patio.delete(entrada.key);
      contadores.resolved += 1;
      log('judge_park_resolved', { key: entrada.key, room_id: entrada.roomId, attempts: entrada.attempt, reason: entrada.reason });
      avisar(entrada, null);
      acordar();
      return resultado;
    } catch (error) {
      entrada.reason = error?.reason || entrada.reason;
      const retryAfterMs = Number.isFinite(error?.retryAfterMs)
        ? error.retryAfterMs
        : Number.isFinite(error?.retryAfterSeconds) ? error.retryAfterSeconds * 1000
          : Number.isFinite(error?.retryAfter) ? error.retryAfter
            : Number.isFinite(error?.details?.retry_after) ? error.details.retry_after * 1000 : 0;
      // Cancelamento (encerramento) não se reprocessa: a fila vive neste
      // processo, que está saindo. Conta e sai, sem prometer nota.
      if (error?.cancelled === true) {
        patio.delete(entrada.key);
        contadores.cancelled += 1;
        log('judge_park_cancelled', { key: entrada.key, room_id: entrada.roomId, attempts: entrada.attempt });
        avisar(entrada, error);
        acordar();
        return undefined;
      }
      if (entrada.attempt >= entrada.attemptsAllowed) {
        desistir(entrada, error);
        return undefined;
      }
      const espera = waitBeforeReprocess({ attempt: entrada.attempt, retryAfterMs, baseDelayMs, maxDelayMs });
      entrada.lastError = String(error?.message || error).slice(0, 200);
      log('judge_park_retry', {
        key: entrada.key, room_id: entrada.roomId, attempts: entrada.attempt, wait_ms: espera, reason: entrada.reason,
      });
      agendar(entrada, espera);
      return undefined;
    }
  }

  /**
   * Estaciona uma avaliação. Repetir o mesmo `key` devolve a entrada que já
   * existe — nunca uma segunda tentativa em paralelo para a mesma submissão.
   *
   * O `onSettled` da ENTRADA existe porque quem sabe avisar as telas da sala é
   * quem estacionou (a API da Arena), não o pátio: o pátio é mecânica de espera,
   * não sabe o que é uma sala.
   *
   * `attemptsSoFar`/`waitMs` existem para a RETOMADA: quando a fila vem do banco
   * (submissão sem nota depois de um reinício), as tentativas já gastas têm de
   * continuar valendo — senão cada reinício daria ao provedor um punhado novo de
   * tentativas — e a espera pode ser ajustada ao tempo que já passou desde a
   * última, para um processo que acabou de subir não repetir um trabalho que já
   * esperou.
   *
   * `attemptsAllowed` é o teto DESTA entrada. O padrão é o teto do pátio (um
   * surto de tentativas seguidas), mas quem rearma uma avaliação já esgotada dá
   * uma tentativa só — o "de vez em quando" do vigia não pode virar surto novo.
   */
  function park({
    key, roomId = null, reason = null, retryAfterMs = 0, task, onSettled: aoTerminar,
    attemptsSoFar = 0, waitMs = null, attemptsAllowed = null,
  }) {
    if (typeof key !== 'string' || !key) throw new TypeError('park precisa de uma chave');
    if (typeof task !== 'function') throw new TypeError('park precisa de uma tarefa');
    if (!Number.isInteger(attemptsSoFar) || attemptsSoFar < 0) throw new TypeError('attemptsSoFar precisa ser inteiro >= 0');
    if (attemptsAllowed !== null && (!Number.isInteger(attemptsAllowed) || attemptsAllowed < attemptsSoFar)) {
      throw new TypeError('attemptsAllowed precisa ser inteiro >= attemptsSoFar');
    }
    const existente = patio.get(key);
    if (existente) {
      log('judge_park_duplicate', { key, room_id: roomId });
      return existente;
    }
    const entrada = {
      key, roomId, reason, task, attempt: attemptsSoFar, lastError: null, timer: null, agendadoPara: 0, saindo: false,
      attemptsAllowed: attemptsAllowed ?? maxAttempts,
      aoTerminar: typeof aoTerminar === 'function' ? aoTerminar : null,
    };
    patio.set(key, entrada);
    const espera = Number.isFinite(waitMs)
      ? Math.max(0, waitMs)
      : waitBeforeReprocess({ attempt: attemptsSoFar + 1, retryAfterMs, baseDelayMs, maxDelayMs });
    log('judge_parked', {
      key, room_id: roomId, reason, wait_ms: espera,
      ...(attemptsSoFar > 0 ? { attempts_so_far: attemptsSoFar } : {}),
    });
    agendar(entrada, espera);
    return entrada;
  }

  /**
   * O pátio, entrada por entrada — o que `state()` resume em números.
   *
   * Por que existe: a prontidão (`/readyz`) conta quantas esperam, e isso basta
   * para quem opera o servidor. A TELA do professor precisa dizer QUEM espera,
   * desde quando e por quê — sem isto, a fila só era visível para quem lê a
   * prontidão, e quem está dando aula não lê.
   *
   * O motivo sai daqui, e não do banco, porque aqui ele está fresco: o gravado
   * na tentativa de avaliação é o da última falha, e uma entrada que o vigia
   * rearmou já não é aquela falha.
   *
   * `nextRetryInMs` é `null` quando não há espera agendada (a tarefa está em voo
   * agora) — e é `null` que a tela lê como "em instantes", nunca como "nunca".
   */
  function pending() {
    return [...patio.values()].map((entrada) => ({
      key: entrada.key,
      roomId: entrada.roomId,
      reason: entrada.reason,
      attempt: entrada.attempt,
      attemptsAllowed: entrada.attemptsAllowed,
      nextRetryInMs: entrada.timer === null ? null : Math.max(0, entrada.agendadoPara - now()),
      lastError: entrada.lastError,
    }));
  }

  function state() {
    return {
      parked: patio.size,
      attempts: [...patio.values()].reduce((soma, entrada) => soma + entrada.attempt, 0),
      resolved: contadores.resolved,
      exhausted: contadores.exhausted,
      cancelled: contadores.cancelled,
      next_retry_ms: proximaEspera(),
    };
  }

  /** Espera o pátio esvaziar (nota entregue, desistência ou cancelamento). */
  function idle() {
    if (patio.size === 0) return Promise.resolve();
    return new Promise((resolve) => { ouvintes.push(resolve); });
  }

  /**
   * Para de agendar: usado quando o processo está encerrando. A tarefa em voo
   * segue até o fim (ela é quem recebe o cancelamento do provedor); o que morre
   * aqui é a espera seguinte.
   */
  function stop() {
    for (const entrada of patio.values()) {
      entrada.saindo = true;
      if (entrada.timer !== null) {
        clearTimeoutImpl(entrada.timer);
        entrada.timer = null;
      }
    }
    patio.clear();
    acordar();
  }

  return {
    park, pending, state, idle, stop,
    has: (key) => patio.has(key),
    // Os limites em vigor nesta instância (um teste cria o pátio com teto curto):
    // quem retoma do banco precisa deles para decidir o que ainda vale retomar.
    limits: { maxAttempts, baseDelayMs, maxDelayMs },
  };
}
