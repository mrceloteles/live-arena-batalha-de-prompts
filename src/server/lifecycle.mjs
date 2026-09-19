// Encerramento gracioso: a ordem importa, e cada passo existe por um defeito
// concreto.
//
// O problema medido: `server.close()` so resolve quando TODAS as conexoes
// morrem, e um stream de SSE é uma conexao viva por definicao. Com o hub
// transmitindo para a turma, o `SIGTERM` de um redeploy ficava esperando os
// navegadores fecharem sozinhos — ate o host perder a paciencia e matar o
// processo no meio de uma avaliacao. Alem disso, o banco so era fechado no
// callback do `server.close()`, entao nada garantia que uma operacao em voo
// tivesse terminado antes.
//
// A ordem daqui e a do plano de producao:
//   1. prontidao sai do ar (`draining`) — o proxy/host para de mandar gente nova;
//   2. novas operacoes sao recusadas (quem decide isso é o handler, lendo o
//      portao antes de despachar);
//   3. o que depende de rede EXTERNA é cancelado (`cancel`) — uma chamada ao
//      juiz em voo nao pode segurar a drenagem: os limites do adaptador (12 a
//      15 s) sao maiores que o prazo combinado com o host, e sem cancelar a
//      instancia so sai quando o host a mata no meio de uma avaliacao;
//   4. as conexoes de tempo real sao REVOGADAS e fechadas (`closeAll`);
//   5. as operacoes em voo terminam, com prazo menor que o timeout do host;
//   6. o que sobrar de conexao e derrubado, o banco é fechado e o processo sai.
//
// O `cancel` é opcional e o padrao é nao ter o que cancelar: quem sobe os
// juizes é que passa o sinal (`startServer`). O `parking` (o patio das
// avaliacoes que o provedor nao entregou) também é opcional, e para as ESPERAS
// dele: uma tentativa em voo recebe o cancelamento acima, mas nada agenda uma
// nova depois que o processo ja esta saindo.

/** Prazo padrao de drenagem: menor que o timeout tipico do host (10-30 s). */
export const SHUTDOWN_TIMEOUT_MS = 9000;

/**
 * Portao de drenagem: conta operacoes em voo e sabe quando a casa esta vazia.
 * Nasce fechado (nada drena) para que quem nao o injeta — os testes, a maior
 * parte deles — nao mude de comportamento.
 */
export function createDrainGate() {
  let draining = false;
  let inflight = 0;
  let esperando = [];

  const begin = () => { inflight += 1; };
  const end = () => {
    inflight -= 1;
    if (inflight > 0) return;
    const pendentes = esperando;
    esperando = [];
    for (const resolve of pendentes) resolve();
  };
  const idle = () => (inflight <= 0
    ? Promise.resolve(true)
    : new Promise((resolve) => { esperando.push(resolve); }));

  return {
    get draining() { return draining; },
    get inflight() { return inflight; },
    begin,
    end,
    idle,
    startDraining: () => { draining = true; },
  };
}

function comPrazo(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    timer.unref?.();
    const concluir = (valor) => { clearTimeout(timer); resolve(valor); };
    promise.then(() => concluir(true), () => concluir(false));
  });
}

/**
 * Executa a ordem de encerramento e devolve o que aconteceu. Quem chama cuida do
 * processo (sair com 0, ou nao sair quando o prazo estourou de vez).
 */
export async function shutdownGracefully({
  gate, hub, server, opened, cancel, parking,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  log = () => {},
  now = () => Date.now(),
} = {}) {
  const inicio = now();
  gate?.startDraining();
  log('shutdown: prontidao fora do ar e novas operações recusadas');

  // 3. Rede externa: cancelar aqui (e nao depois) é o que faz uma avaliacao em
  // voo virar conclusao local rapida em vez de tempo esgotado. O cancelamento é
  // best-effort: falha ao cancelar nao impede o resto do encerramento.
  let cancelado = false;
  if (typeof cancel === 'function') {
    try { cancel(); cancelado = true; } catch (error) {
      log(`shutdown: falha ao cancelar pendencias externas: ${error?.message || error}`);
    }
  }

  // 3b. As esperas do patio: o cancelamento acima derruba a tentativa em voo, e
  // ninguem pode agendar a proxima (esta instancia esta saindo). O que estava
  // esperando sai da MEMORIA, mas nao se perde: a fila e o banco (submissao sem
  // nota), entao a proxima subida retoma as avaliacoes — por isso a linha diz
  // para onde elas vao, e nao que foram descartadas.
  const patio = parking?.state?.();
  if (patio?.parked) log(`shutdown: ${patio.parked} avaliacao(oes) estacionada(s) deixam a memoria com o processo; a proxima subida as retoma do banco`);
  try { parking?.stop?.(); } catch (error) {
    log(`shutdown: falha ao parar o patio de avaliacoes: ${error?.message || error}`);
  }

  // 4. Tempo real em seguida: e ele que impede o `server.close()` de resolver.
  const revogadas = hub?.closeAll?.('server_shutdown') ?? 0;
  if (revogadas) log(`shutdown: ${revogadas} conexão(ões) de tempo real revogadas`);

  const fechou = new Promise((resolve) => server.close(() => resolve('fechado')));
  // Conexao keep-alive sem nada em voo nao tem por que segurar a saida.
  server.closeIdleConnections?.();

  // 5. Operacoes em voo terminam dentro do prazo.
  const drenou = await comPrazo(gate?.idle?.() ?? Promise.resolve(true), timeoutMs);
  if (!drenou) {
    log(`shutdown: prazo de ${timeoutMs}ms esgotado com ${gate?.inflight ?? 0} operação(ões) em voo`);
  }
  server.closeAllConnections?.();
  await fechou;

  // 6. Banco por ultimo: nenhuma escrita pode chegar depois do fechamento.
  await opened?.close?.();
  return {
    drenou,
    cancelado,
    operacoesEmVoo: gate?.inflight ?? 0,
    conexoesRevogadas: revogadas,
    duracaoMs: now() - inicio,
  };
}
