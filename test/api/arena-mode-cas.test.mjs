import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createFallbackSafeCriteriaJudge } from '../../src/judge/criteria-judge.mjs';
import { voteDynamic } from '../../src/domain/arena-mode.mjs';

// A fila em memória (`pending`) serializa as escritas de UMA instalação. Duas
// instâncias do app — dois processos, dois contêineres, dois nós — não
// compartilham essa fila: as duas leem o mesmo JSON, cada uma muda o que quer e
// a última que grava apaga a outra. Estes testes criam DOIS despachantes sobre o
// MESMO banco (que é o que duas instâncias têm em comum) e exigem que nenhuma
// decisão se perca: a gravação passa a ser condicional ao que foi lido, e quem
// perde a corrida relê e reaplica.

let opened, repositories, clock, sequence, adminToken, adminAuth;
let despachanteA, despachanteB;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1_000_000;
  sequence = 0;
  adminAuth = createAdminAuth({
    password: 'senha-segura-123', secret: 'segredo-muito-longo-para-teste-123456',
    now: () => clock,
  });
  adminToken = adminAuth.login('senha-segura-123').token;
  const criar = () => createArenaApi({
    repositories,
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
  });
  despachanteA = criar();
  despachanteB = criar();
});
afterEach(() => opened.close());

const admin = () => ({ admin_token: adminToken });
const CRITERIA = [
  { criterion: 'objetivo', weight: 30 },
  { criterion: 'contexto', weight: 25 },
  { criterion: 'publico', weight: 20 },
  { criterion: 'formato', weight: 15 },
  { criterion: 'restricoes', weight: 10 },
];
const REFERENCE = 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato.';
const chaveDoModo = (roomId) => `arena.mode.${roomId}`;

/** Sala do modo Arena com a turma dentro, uma rodada respondida e o desafio aberto. */
async function salaComDesafioAberto({ players = 12, dynamic = 'prever' } = {}) {
  const api = despachanteA;
  await api('arena_set_open', { ...admin(), open: true });
  const { room } = await api('arena_create_room', {
    ...admin(), title: 'Turma Arena', preset: 'arena', expected_players: 40,
    arena_rounds: 3, arena_boss_health: 5, arena_damage_threshold: 60, arena_attacks_per_round: 2,
  });
  const { challenge } = await api('arena_save_challenge', {
    ...admin(), title: 'Cartaz da feira', modality: 'precisao',
    mission: 'Crie um cartaz para a feira de tecnologia.',
    context: 'Feira anual do ensino medio.', criteria: CRITERIA,
    duration_seconds: 300, speed_weight: 'none', reference_text: REFERENCE,
  });
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  const roster = [];
  for (let index = 0; index < players; index += 1) {
    const joined = await api('arena_join', { code: room.pin || room.code, name: `Aluno ${index + 1}` });
    roster.push({ ...joined.participant, token: joined.token });
  }
  await api('arena_start_round', { ...admin(), room_id: room.id });
  const detalhe = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  const roundId = detalhe.rounds.find((round) => round.status === 'open').id;
  for (const [index, participant] of roster.entries()) {
    await api('arena_submit', {
      participant_id: participant.id, token: participant.token, round_id: roundId,
      prompt: `${REFERENCE} variacao ${index}`,
    });
  }
  await api('arena_end_round', { ...admin(), room_id: room.id });
  await api('arena_mode_draw', { ...admin(), room_id: room.id, wildcard: false });
  await api('arena_mode_dynamic_open', { ...admin(), room_id: room.id, dynamic });
  const estado = await repositories.settings.get(chaveDoModo(room.id));
  return { roomId: room.id, roster, estado };
}

const votar = (despachante, participant, escolha, confianca) => despachante('arena_mode_vote', {
  participant_id: participant.id, token: participant.token, choice: escolha,
  ...(confianca === undefined ? {} : { confidence: confianca }),
});

test('votos simultâneos de dois despachantes chegam todos ao estado', async () => {
  const { roomId, roster, estado } = await salaComDesafioAberto({ players: 12 });
  const errado = estado.dynamic.options.find((option) => option.key !== estado.dynamic.correct).key;

  // Metade vota em cada despachante, todos no mesmo tique: as duas filas em
  // memória são independentes, então quem perde a corrida de gravação precisa
  // reler e reaplicar para o voto não sumir do resultado.
  const respostas = await Promise.all(roster.map((participant, index) => votar(
    index % 2 === 0 ? despachanteA : despachanteB,
    participant,
    index % 3 === 0 ? errado : estado.dynamic.correct,
  )));
  assert.equal(respostas.every((resposta) => resposta.ok), true);

  const depois = await repositories.settings.get(chaveDoModo(roomId));
  assert.equal(Object.keys(depois.dynamic.responses).length, roster.length, 'nenhum voto se perdeu');

  await despachanteA('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  const fechado = await repositories.settings.get(chaveDoModo(roomId));
  assert.equal(fechado.dynamic.result.total, roster.length, 'o resultado conta os doze votos');
});

/**
 * Um despachante que carrega uma escrita alheia entre o `getComBruto` e a
 * gravação condicional — a janela exata em que o defeito morava. A interferência
 * acontece de verdade (`gravar`), e a gravação de quem chamou é resolvida pelo
 * MESMO `setSeIntacto` de produção: é ele quem tem de perceber que o texto
 * mudou. Se a escrita fosse cega, este teste não veria nada — e é assim que ele
 * morde.
 */
function despachanteComVizinho(gravar, lerEstado) {
  let interferiu = false;
  return createArenaApi({
    repositories: {
      ...repositories,
      settings: {
        ...repositories.settings,
        async setSeIntacto(chave, valor, esperado, timestamp) {
          if (!interferiu) {
            interferiu = true;
            await gravar();
          }
          return repositories.settings.setSeIntacto(chave, valor, esperado, timestamp);
        },
      },
    },
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
  });
}

test('o outro processo fechando no meio não aplica o efeito duas vezes', async () => {
  const { roomId, roster, estado } = await salaComDesafioAberto({ players: 8 });
  for (const participant of roster) {
    await votar(despachanteA, participant, estado.dynamic.correct);
  }

  // O vizinho fecha de verdade entre a minha leitura e a minha gravação.
  const despachante = despachanteComVizinho(
    () => despachanteB('arena_mode_dynamic_close', { ...admin(), room_id: roomId }),
  );
  const resposta = await despachante('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  assert.equal(resposta.ok, true);
  assert.equal(resposta.already_closed, true, 'a minha ação encontra o desafio já fechado');

  const depois = await repositories.settings.get(chaveDoModo(roomId));
  assert.equal(depois.attacks.length, 1, 'o histórico tem um ataque, não dois');
  assert.equal(depois.boss.health, 4, 'um coração saiu, não dois');
  assert.equal(depois.phase, 'reveal');
});

test('dois despachantes fechando no mesmo tique deixam o estado de um fechamento só', async () => {
  // Sem interferência artificial: os dois pedidos saem juntos e a rede/event loop
  // decide a ordem. O invariante é o mesmo, e o compare-and-swap o mantém sem
  // depender de quem chegou primeiro.
  const { roomId, roster } = await salaComDesafioAberto({ players: 8 });
  const estado = await repositories.settings.get(chaveDoModo(roomId));
  for (const participant of roster) {
    await votar(despachanteA, participant, estado.dynamic.correct);
  }
  const respostas = await Promise.all([
    despachanteA('arena_mode_dynamic_close', { ...admin(), room_id: roomId }),
    despachanteB('arena_mode_dynamic_close', { ...admin(), room_id: roomId }),
  ]);
  assert.equal(respostas.every((resposta) => resposta.ok), true);

  const depois = await repositories.settings.get(chaveDoModo(roomId));
  assert.equal(depois.attacks.length, 1, 'o histórico tem um ataque, não dois');
  assert.equal(depois.boss.health, 4, 'um coração saiu, não dois');
  assert.equal(depois.phase, 'reveal');
});

// O caso mais difícil não é a rajada: é a gravação de OUTRO processo acontecendo
// entre a leitura e a gravação. Aqui isso é determinístico — a primeira tentativa
// perde de propósito, e o vizinho já gravou o voto dele quando a releitura
// acontece. As duas decisões têm de sobreviver.
test('a decisão que perde a corrida é reaplicada sobre o estado que o vizinho gravou', async () => {
  const { roomId, roster, estado } = await salaComDesafioAberto({ players: 4 });
  const vizinho = roster[0];
  const eu = roster[1];
  const errado = estado.dynamic.options.find((option) => option.key !== estado.dynamic.correct).key;

  // O "outro processo": escreve o voto dele entre a minha leitura e a minha
  // gravação. A minha gravação condicional tem de recusar; a releitura encontra
  // o voto dele, e o meu é reaplicado por cima.
  const despachante = despachanteComVizinho(async () => {
    const { value } = await repositories.settings.getComBruto(chaveDoModo(roomId));
    await repositories.settings.set(chaveDoModo(roomId), voteDynamic(value, vizinho.id, errado, { at: clock }), clock);
  });

  const resposta = await votar(despachante, eu, estado.dynamic.correct);
  assert.equal(resposta.ok, true);

  const depois = await repositories.settings.get(chaveDoModo(roomId));
  assert.equal(depois.dynamic.responses[vizinho.id], errado, 'o voto do vizinho não foi apagado');
  assert.equal(depois.dynamic.responses[eu.id], estado.dynamic.correct, 'e o meu foi reaplicado por cima');
});

// O sorteio é outro estado coletivo da mesma sala: dois cliques de "sortear" no
// mesmo banco não podem apagar o grupo que o vizinho acabou de fechar — é a
//í unica operação dele que PERDE informação (o vencedor escolhido).
test('fechar o grupo no sorteio não se perde para uma gravação concorrente', async () => {
  const { roomId } = await salaComDesafioAberto({ players: 6 });
  await despachanteA('arena_draw_setup', { ...admin(), room_id: roomId, mode: 'mata-mata', group_size: 2 });
  await despachanteA('arena_draw_next', { ...admin(), room_id: roomId });
  const estado = await repositories.settings.get(`arena.draw.${roomId}`);
  const vencedor = estado.current.ids[0];

  const despachante = despachanteComVizinho(
    () => despachanteB('arena_draw_settle', { ...admin(), room_id: roomId, winner_id: vencedor }),
  );
  await despachante('arena_draw_next', { ...admin(), room_id: roomId });

  const depois = await repositories.settings.get(`arena.draw.${roomId}`);
  assert.equal(depois.mode, 'mata-mata');
  assert.ok(
    depois.results.some((resultado) => resultado.ids.includes(vencedor) && resultado.winner_id === vencedor),
    'o grupo fechado pelo vizinho continua no histórico',
  );
  assert.ok(depois.current?.ids?.length > 0, 'e o meu sorteio seguinte também aconteceu');
});

test('quando a concorrência não para, a ação falha dizendo o que fazer em vez de gravar torto', async () => {
  const { roomId } = await salaComDesafioAberto({ players: 4 });
  const travado = createArenaApi({
    repositories: {
      ...repositories,
      settings: { ...repositories.settings, setSeIntacto: async () => false },
    },
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
  });
  const antes = await repositories.settings.get(chaveDoModo(roomId));
  await assert.rejects(
    travado('arena_mode_configure', { ...admin(), room_id: roomId, boss_max_health: 3 }),
    (error) => error.status === 409 && /alterada por outra pessoa/.test(error.message),
  );
  const depois = await repositories.settings.get(chaveDoModo(roomId));
  assert.deepEqual(depois, antes, 'nada foi gravado');
});
