// Quem pode receber o que no stream de tempo real (/events).
//
// O EventSource nao tem cabecalho proprio nem corpo: o navegador manda o que ja
// manda em qualquer requisicao — os cookies do dominio — e o resto viaja na
// query string. Por isso cada superficie entra com o que JA tem:
//
//   painel do professor -> cookie HttpOnly `arena_admin` (assina qualquer sala)
//   TV / projecao       -> cookie HttpOnly `arena_tv_session`, atado a sala
//   aluno               -> a propria sessao (`participant_id` + `token`), a
//                          mesma que ele ja manda no corpo de toda chamada
//
// Sem prova, a conexao entra em escopo GLOBAL: recebe o que vale para a arena
// inteira (abrir/fechar a entrada) e nada de sala nenhuma. Nao existe caminho
// anonimo para o evento de uma sala.
//
// Duas regras que valem a pena escrever, porque sao o que impede isto de virar
// um vazamento:
//
//   1. A sala do ALUNO vem da sessao validada, nunca do `room` que ele pediu.
//      Se a sessao diz sala A, a conexao e da sala A — pedir sala B nao muda
//      nada. E o mesmo principio de `roomIdFromOutcome`: identidade ganha da
//      declaracao.
//   2. A resposta e sempre 200. Uma conexao sem prova nao recebe erro: ela
//      recebe menos. Recusar com 403 daria um oraculo de existencia de sala e,
//      pior, o EventSource retentaria para sempre (`retry: 1000`) em cada aba.
//
// A ordem das provas e admin -> TV -> aluno de proposito: o navegador do
// professor pode ter uma sessao de aluno sobrando no `localStorage` de uma
// visita anterior, e e o cookie do painel que diz "esta conexao pode seguir a
// sala que eu pedi".
import { readAdminToken, readTvToken } from './cookies.mjs';
import { liveTvTokens, participantForSession } from './arena-api.mjs';

// Um id de sala e um UUID; o limite existe so para nao carregar lixo vindo da
// URL para dentro de um mapa do processo.
const MAX_ROOM_ID_CHARS = 64;

const GLOBAL_SCOPE = Object.freeze({ kind: 'global' });

export function createEventsScopeResolver({ repositories, adminAuth, now = () => Date.now() / 1000 } = {}) {
  return async function resolveEventsScope(request, url) {
    const params = url?.searchParams;
    const pedido = String(params?.get('room') ?? params?.get('room_id') ?? '').trim();
    const room = pedido.length > MAX_ROOM_ID_CHARS ? '' : pedido;
    const timestamp = Number(now());

    // 1. Painel do professor: cookie HttpOnly assinado. Vale para qualquer sala.
    const adminToken = readAdminToken(request);
    if (room && adminToken && adminAuth?.verify(adminToken)) return { kind: 'room', roomId: room };

    // 2. Projecao: token de 8h da sala, que so existe para a sala que o cockpit
    //    gerou. O pedido e conferido contra ele — a TV nao passeia por salas.
    const tvToken = readTvToken(request);
    if (room && tvToken) {
      const tokens = await liveTvTokens(repositories, room, timestamp);
      if (Number(tokens[tvToken] || 0) >= timestamp) return { kind: 'room', roomId: room };
    }

    // 3. Aluno: sessao validada; a sala sai dela.
    const participantId = String(params?.get('participant_id') ?? '').trim();
    const token = String(params?.get('token') ?? '');
    if (participantId && token) {
      const participant = await participantForSession(repositories, participantId, token);
      if (participant) return { kind: 'room', roomId: String(participant.roomId) };
    }

    return GLOBAL_SCOPE;
  };
}
