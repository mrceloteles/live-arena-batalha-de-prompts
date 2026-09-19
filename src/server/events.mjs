const DEFAULT_KEEPALIVE_MS = 15000;

/**
 * De quanto em quanto tempo a conexao prova DE NOVO que ainda pode seguir a
 * sala que ela pediu.
 *
 * Nao e o keepalive (que so mantem o cano aberto) nem o poll de estado (que
 * pergunta como esta a sala): e a reavaliacao da credencial. Sem ela, quem
 * perde a sala continua recebendo ate reconectar por conta propria — um aluno
 * removido pelo professor, por exemplo, so sairia do stream quando o navegador
 * caisse e voltasse.
 *
 * 10 s e o ponto entre perceber rapido e nao virar varredura: a conexao de
 * aluno paga duas leituras de banco por tique (o participante e a sala), a do
 * painel uma verificacao HMAC e a da TV uma leitura de configuracao — e a
 * conexao global nao paga nada, porque nao tem credencial para perder.
 */
const DEFAULT_REVALIDATE_MS = 10000;

/**
 * De onde sai o identificador da sala de um evento de tempo real.
 *
 * Sempre do RESULTADO que o proprio servidor montou (sala, detalhe, sessao do
 * participante) ou do `room_id` que o handler ja validou com `roomById` — nunca
 * de um campo arbitrario vindo do cliente. Acao global (abrir/fechar a entrada
 * da arena) devolve `null` de proposito: vale para todas as salas.
 */
export function roomIdFromOutcome(payload, result) {
  const candidate = result?.room?.id
    ?? result?.detail?.room?.id
    ?? result?.participant?.room?.id
    ?? result?.round?.roomId
    ?? result?.room_id
    ?? payload?.room_id;
  return candidate === undefined || candidate === null || candidate === '' ? null : String(candidate);
}

/** Escopo de uma conexao: a sala que ela provou poder seguir, ou nada. */
export function roomScope(roomId) {
  const value = roomId === undefined || roomId === null || roomId === '' ? null : String(roomId);
  return value ? Object.freeze({ kind: 'room', roomId: value }) : Object.freeze({ kind: 'global' });
}

/**
 * Dois escopos ainda sao o mesmo? `global` so casa com `global`, e a sala e
 * comparada como texto (o id vem de linhas de banco diferentes).
 */
export function sameScope(saved, current) {
  const antes = saved?.kind === 'room' && saved.roomId ? String(saved.roomId) : null;
  const agora = current?.kind === 'room' && current.roomId ? String(current.roomId) : null;
  return antes === agora;
}

/**
 * Hub de tempo real da sala.
 *
 * A entrega e POR ESCOPO: uma conexao de sala recebe o evento daquela sala mais
 * o que vale para a arena inteira; uma conexao global (sem prova de pertencer a
 * sala nenhuma) recebe so o global. Quem decide o escopo e `resolveEventsScope`
 * (ver `events-scope.mjs`) — o hub so confia no que recebe aqui.
 *
 * A autorizacao nao e um selo de entrada: quem provou a sala no inicio prova de
 * novo a cada `revalidateMs`, com a mesma pergunta, e a conexao cujo escopo
 * deixou de bater e fechada com o evento `revoked`. A credencial e reavaliada
 * por quem a emitiu (a funcao que a superficie passou), nunca por uma copia da
 * regra aqui dentro.
 *
 * `broadcast` continua anunciando a sala de origem no payload (`room_id`), agora
 * como trilha do que foi roteado: o cliente nao precisa mais descartar nada.
 */
export function createRoomEventHub({ keepaliveMs = DEFAULT_KEEPALIVE_MS, revalidateMs = DEFAULT_REVALIDATE_MS } = {}) {
  // Duas visoes do mesmo conjunto: o mapa por resposta responde "qual e o meu
  // escopo" (limpeza de socket morto, que acontece em qualquer caminho) e o
  // indice por sala responde "quem recebe esta sala" em O(conexoes da sala).
  const subscribers = new Map(); // response -> { roomId: string|null }
  const roomClients = new Map(); // roomId -> Set<response>
  const globalClients = new Set();
  // Desmonte de cada conexao, para o encerramento do processo conseguir fechar
  // todas de fora: sem isto, `server.close()` esperava o navegador de cada aluno.
  const teardowns = new Map(); // response -> revogar(reason)
  const intervaloDeReverificacao = Number(revalidateMs) > 0 ? Number(revalidateMs) : DEFAULT_REVALIDATE_MS;
  let revocations = 0;

  function forget(response) {
    const scope = subscribers.get(response);
    if (!scope) return;
    subscribers.delete(response);
    if (scope.roomId === null) {
      globalClients.delete(response);
      return;
    }
    const bucket = roomClients.get(scope.roomId);
    if (!bucket) return;
    bucket.delete(response);
    if (bucket.size === 0) roomClients.delete(scope.roomId);
  }

  function subscribe(request, response, { scope, revalidate } = {}) {
    const roomId = scope?.kind === 'room' && scope.roomId ? String(scope.roomId) : null;
    const autorizado = roomScope(roomId);
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.write('retry: 1000\n\n');
    subscribers.set(response, { roomId });
    if (roomId) {
      let bucket = roomClients.get(roomId);
      if (!bucket) { bucket = new Set(); roomClients.set(roomId, bucket); }
      bucket.add(response);
    } else {
      globalClients.add(response);
    }

    let encerrada = false;
    let guard = null;
    const keepalive = setInterval(() => {
      if (response.destroyed || response.writableEnded) return;
      response.write(': keepalive\n\n');
    }, keepaliveMs);
    keepalive.unref?.();

    const encerrar = () => {
      if (encerrada) return;
      encerrada = true;
      clearInterval(keepalive);
      if (guard) clearInterval(guard);
      forget(response);
      teardowns.delete(response);
      if (!response.writableEnded && !response.destroyed) response.end();
    };

    const revogar = (reason) => {
      if (encerrada) return;
      // O cliente precisa saber que a saida foi decisao do servidor: sem este
      // aviso o EventSource reconectaria sozinho, agora em escopo global, e a
      // tela ficaria "ao vivo" sem receber nada da propria sala.
      if (!response.destroyed && !response.writableEnded) {
        response.write(`event: revoked\ndata: ${JSON.stringify({ reason })}\n\n`);
      }
      revocations += 1;
      encerrar();
    };
    teardowns.set(response, revogar);

    // Conexao global nao ganha relogio: nao ha credencial nenhuma para perder,
    // e sem prova o escopo devolvido seria `global` em todo tique — trabalho de
    // banco para confirmar o obvio.
    if (roomId && typeof revalidate === 'function') {
      guard = setInterval(async () => {
        if (encerrada) return;
        try {
          if (!sameScope(autorizado, await revalidate())) revogar('scope_lost');
        } catch {
          // Falha de LEITURA nao revoga: derrubar a turma de quem esta assistindo
          // a aula por causa de um banco que piscou seria pior que o atraso de um
          // tique. O intervalo seguinte tenta de novo, e quem perdeu a sala de
          // verdade e fechado na primeira rechecagem que responder.
        }
      }, intervaloDeReverificacao);
      guard.unref?.();
    }

    request.once('close', encerrar);
    response.once('close', encerrar);
    return encerrar;
  }

  function broadcast(action, { serverNow = Date.now() / 1000, roomId = null } = {}) {
    // `room_id` so entra quando existe: evento global mantem o payload antigo,
    // e o cliente trata a ausencia como "vale para a sala que eu estou vendo".
    const data = JSON.stringify(roomId ? { action, server_now: serverNow, room_id: roomId } : { action, server_now: serverNow });
    const event = `event: room\ndata: ${data}\n\n`;
    // Evento de sala vai SO para quem provou seguir aquela sala. Evento global
    // (abrir/fechar a entrada da arena) vai para todos, inclusive para a conexao
    // que nao provou nada — e o unico que ela recebe.
    const targets = roomId === null || roomId === undefined || roomId === ''
      ? [...globalClients, ...[...roomClients.values()].flatMap((bucket) => [...bucket])]
      : [...(roomClients.get(String(roomId)) ?? [])];
    for (const response of targets) {
      if (response.destroyed || response.writableEnded) {
        forget(response);
        continue;
      }
      response.write(event);
    }
  }

  /**
   * Fecha TODAS as conexoes vivas, avisando o cliente do motivo.
   *
   * E o passo que faltava no encerramento: sem ele, o `server.close()` de um
   * redeploy ficava preso no stream da TV e da turma ate o host forcar a saida.
   * O aviso e o mesmo `revoked` da reverificacao, entao o cliente ja sabe que a
   * saida foi decisao do servidor e nao reconecta em laco.
   */
  function closeAll(reason = 'server_shutdown') {
    const abertas = [...teardowns.values()];
    for (const revogar of abertas) revogar(reason);
    return abertas.length;
  }

  return {
    subscribe,
    broadcast,
    closeAll,
    /** Conexoes vivas no total — as tres superficies e nada mais. */
    get size() {
      return subscribers.size;
    },
    /** Conexoes vivas presas a uma sala (0 quando ninguem provou pertencer). */
    sizeFor(roomId) {
      return roomClients.get(String(roomId))?.size ?? 0;
    },
    /** Conexoes sem prova de sala: recebem so o evento global. */
    get globalSize() {
      return globalClients.size;
    },
    /** Conexoes ja fechadas por perderem a autorizacao (instrumento do portao). */
    get revoked() {
      return revocations;
    },
  };
}
