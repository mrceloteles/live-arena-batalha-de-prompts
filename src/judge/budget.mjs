// Orçamento de avaliações por instalação: quantas chamadas externas podem estar
// em voo ao mesmo tempo, quantas podem ser feitas por hora e o que responder
// quando o limite é atingido.
//
// O defeito medido (auditoria de prontidão): "várias avaliações simultâneas não
// têm teto global". Trinta e cinco alunos enviando ao mesmo tempo são trinta e
// cinco chamadas ao Gemini, cada uma com 12 s de timeout e uma repetição — sem
// teto de concorrência, sem teto de cota e sem nada que diga ao professor o que
// está acontecendo.
//
// A resposta quando o limite estoura NÃO é uma nota local: é uma recusa
// recuperável (`JudgeBudgetError`), porque a tentativa do aluno é preservada e
// repetir a mesma solicitação continua a MESMA avaliação (a submissão e a nota
// são únicas por tentativa no banco). Comprar uma nota do juiz heurístico por um
// pico passageiro de fila seria uma perda permanente em troca de um problema
// temporário.
//
// A contagem é por AVALIAÇÃO, não por requisição HTTP: uma avaliação que repete
// duas vezes por erro 500 do provedor gasta um lugar, não dois.

export class JudgeBudgetError extends Error {
  constructor(message, { reason, retryAfterSeconds } = {}) {
    super(message);
    this.name = 'JudgeBudgetError';
    // Marcador de máquina: quem despacha precisa distinguir "o teto da sala
    // chegou" de "o provedor falhou" sem ler a mensagem.
    this.code = 'judge_budget';
    this.reason = reason;
    this.retryAfterSeconds = Number.isFinite(retryAfterSeconds) ? Math.max(1, Math.ceil(retryAfterSeconds)) : 15;
  }
}

const JANELA_MS = 60 * 60 * 1000;

/**
 * Traduz a recusa do teto em resposta HTTP recuperável. Devolve `null` quando o
 * erro não é do teto — quem chama decide o que fazer com os outros.
 * A mensagem é para o aluno e diz as duas coisas que importam: por que não deu
 * agora e que a tentativa dele NÃO se perdeu.
 */
export function budgetRejection(error) {
  if (error?.code !== 'judge_budget') return null;
  const retryAfter = Number(error.retryAfterSeconds) || 15;
  const explicacao = error.reason === 'orcamento_esgotado'
    ? 'O limite de avaliacoes externas desta hora foi atingido.'
    : 'A fila de avaliacoes esta cheia neste instante.';
  return {
    status: 503,
    retryAfter,
    message: `${explicacao} Sua resposta foi recebida: tentar de novo continua esta mesma avaliacao.`,
  };
}

/**
 * @param {{ maxConcurrent?: number, perHour?: number, maxQueued?: number, now?: () => number, log?: Function }} opcoes
 */
export function createJudgeBudget({
  maxConcurrent = 4,
  perHour = 400,
  maxQueued = 64,
  now = () => Date.now(),
  log = () => {},
} = {}) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new TypeError('maxConcurrent precisa ser inteiro >= 1');
  if (!Number.isInteger(perHour) || perHour < 1) throw new TypeError('perHour precisa ser inteiro >= 1');
  if (!Number.isInteger(maxQueued) || maxQueued < 0) throw new TypeError('maxQueued precisa ser inteiro >= 0');

  /** Instantes de início das avaliações da última hora (só o que ainda vale). */
  let historico = [];
  let ativos = 0;
  const fila = [];

  const limpar = () => {
    const corte = now() - JANELA_MS;
    if (historico.length && historico[0] < corte) historico = historico.filter((instante) => instante >= corte);
  };

  const estado = () => {
    limpar();
    return {
      active: ativos,
      queued: fila.length,
      concurrency: maxConcurrent,
      per_hour: perHour,
      spent_last_hour: historico.length,
      remaining_last_hour: Math.max(0, perHour - historico.length),
    };
  };

  function recusarPorCota() {
    limpar();
    // Quanto falta para a avaliação mais antiga sair da janela: é o tempo
    // mínimo honesto para pedir "tente de novo".
    const maisAntiga = historico[0] ?? now();
    const espera = Math.max(1, Math.ceil((maisAntiga + JANELA_MS - now()) / 1000));
    log('budget_exhausted', { spent: historico.length, per_hour: perHour, retry_after: espera });
    return new JudgeBudgetError(
      `Orçamento de avaliações externas esgotado nesta hora (${historico.length}/${perHour}). `
      + 'A mesma tentativa fica preservada: repetir a solicitação continua esta avaliação.',
      { reason: 'orcamento_esgotado', retryAfterSeconds: espera },
    );
  }

  /**
   * Toma um lugar ou entra na fila. A contagem sobe AQUI, antes de qualquer
   * `await`: entre a pergunta e o incremento não pode existir ponto de
   * suspensão, senão seis chamadas simultâneas veem "há lugar" e todas entram
   * (foi exatamente assim que o primeiro teste deste módulo reprovou: pico 6
   * num teto de 2).
   */
  async function obterLugar() {
    if (ativos < maxConcurrent) { ativos += 1; return; }
    if (fila.length >= maxQueued) {
      log('budget_queue_full', { queued: fila.length, max_queued: maxQueued });
      throw new JudgeBudgetError(
        `Fila de avaliacoes cheia (${fila.length}). A mesma tentativa fica preservada: tente novamente em instantes.`,
        { reason: 'fila_cheia', retryAfterSeconds: 10 },
      );
    }
    await new Promise((resolve) => fila.push(resolve));
  }

  /**
   * Executa uma avaliação dentro do orçamento. Devolve o mesmo que a tarefa.
   */
  async function run(tarefa) {
    if (typeof tarefa !== 'function') throw new TypeError('tarefa precisa ser uma função');
    limpar();
    if (historico.length >= perHour) throw recusarPorCota();
    await obterLugar();
    historico.push(now());
    try {
      return await tarefa();
    } finally {
      ativos -= 1;
      const proximo = fila.shift();
      // O lugar é TRANSFERIDO para o primeiro da fila (sobe a contagem antes de
      // acordar a tarefa), e não reaberto: senão uma nova chamada fura a fila e
      // o teto vira sugestão.
      if (proximo) { ativos += 1; proximo(); }
    }
  }

  return { run, state: estado, limits: { maxConcurrent, perHour, maxQueued } };
}
