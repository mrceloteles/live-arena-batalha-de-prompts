import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createApi } from '../../src/server/api.mjs';

/**
 * NOVA BATALHA NESTA SALA.
 *
 * A sala é reutilizável: o professor repete a aula com o MESMO código, o mesmo
 * preset, os mesmos ajustes e as mesmas missões, e o que zera é o JOGO
 * (tentativas e pontuação). O que NÃO pode acontecer é uma das duas pontas do
 * histórico se perder:
 *
 *   - a batalha anterior tem de continuar inteira (envios, notas, tentativas de
 *     juiz) e ser lida como uma batalha a parte pelo relatório;
 *   - a batalha nova não pode herdar nada da antiga — nem nota, nem tentativa
 *     gasta, nem o estado coletivo do Modo Arena, nem um envio sem nota que o
 *     vigia reavaliasse depois.
 *
 * Cada um desses é um teste aqui. O que este arquivo prende é a REGRA, não a
 * tela: o caminho do professor pela interface é o teste de navegador vizinho.
 */
async function fixture(t, { preset = 'personalizado', capacity = 35, missions = 2, duration = 120 } = {}) {
  const opened = openDatabase(':memory:');
  t.after(() => opened.close());
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let clock = 1000;
  const now = () => clock;
  const auth = createAdminAuth({ password: 'test-password', secret: 'test-secret-with-at-least-32-characters', now });
  const admin = { admin_token: auth.login('test-password').token };
  const api = createArenaApi({
    repositories, adminAuth: auth, now,
    judge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
  });
  const core = createApi({
    repositories, adminAuth: auth, now,
    judge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
  });
  await api('arena_set_open', { ...admin, open: true });
  const { room } = await api('arena_create_room', {
    ...admin, title: 'Sala reutilizável', preset, expected_players: capacity,
  });
  // Os presets de regras clássicas (classic/turma) nascem com as rodadas
  // oficiais e não aceitam acrescentar missão — a sala é montada com o que veio.
  for (let index = 0; index < missions; index += 1) {
    const { challenge } = await api('arena_save_challenge', {
      ...admin,
      title: `Missão ${index + 1}`,
      mission: `Escreva o prompt da missão ${index + 1}`,
      modality: 'precisao',
      duration_seconds: duration,
      speed_weight: index === 0 ? 'medium' : 'none',
      reference_text: 'Texto de referência com público, formato e restrições claras.',
    });
    if (preset === 'classic' || preset === 'turma') continue;
    await api('arena_add_round', { ...admin, room_id: room.id, challenge_id: challenge.id });
  }
  const join = async (name) => {
    const value = await api('arena_join', { code: room.code, name });
    return { participant_id: value.participant.id, token: value.token };
  };
  const detail = async (roomId = room.id) => (await api('arena_room_detail', { ...admin, room_id: roomId })).detail;
  const status = async (roomId = room.id) => (await api('arena_admin_status', admin)).rooms.find((entry) => entry.id === roomId);
  const rounds = (await detail()).rounds.map((entry) => ({ id: entry.id, challengeId: entry.challenge_id }));
  return {
    api, core, admin, room, rounds, repositories, join, detail, status,
    time: (value) => { clock = value; },
  };
}

/** A sala publicada, com a turma dentro e a primeira missão no ar. */
async function emJogo(f, names = ['Ana', 'Bia']) {
  await f.api('arena_publish_room', { ...f.admin, room_id: f.room.id });
  const people = [];
  for (const name of names) people.push(await f.join(name));
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  return people;
}

test('a batalha nova mantém código, ajustes e missões, e zera tentativas e pontuação', async (t) => {
  const f = await fixture(t);
  const [ana, bia] = await emJogo(f);
  await f.api('arena_submit', { ...ana, round_id: f.rounds[0].id, attempt: 1, prompt: 'Prompt da Ana' });
  f.time(1400);
  await f.api('arena_end_round', { ...f.admin, room_id: f.room.id });

  const antes = await f.status();
  const detalheAntes = await f.detail();
  assert.equal(antes.status, 'playing');
  assert.equal(antes.rounds_count, 2);
  assert.equal(detalheAntes.rounds[0].status, 'results', 'a missão 1 fechou com placar');

  const resposta = await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  assert.equal(resposta.ok, true);
  assert.equal(resposta.already, false);
  assert.equal(resposta.battle.cycle, 2, 'a batalha nova é o ciclo 2');

  const depois = await f.status();
  assert.equal(depois.code, antes.code, 'o código de entrada é o mesmo');
  assert.equal(depois.pin, antes.pin, 'o PIN é o mesmo');
  assert.equal(depois.preset, antes.preset, 'o preset é o mesmo');
  assert.equal(depois.expected_players, antes.expected_players, 'a capacidade é a mesma');
  assert.deepEqual(depois.settings, antes.settings, 'os ajustes são os mesmos');
  assert.equal(depois.rounds_count, antes.rounds_count, 'as missões são as mesmas');
  assert.equal(depois.status, 'open', 'a sala volta ao estado de espera do professor');
  assert.equal(depois.can_start, true, 'e o painel já oferece iniciar a batalha nova');

  const detalheDepois = await f.detail();
  assert.equal(detalheDepois.room.current_cycle, 2);
  assert.equal(detalheDepois.room.phase, 'lobby');
  assert.deepEqual(
    detalheDepois.rounds.map((entry) => entry.status),
    ['pending', 'pending'],
    'todas as missões voltam a aguardar — inclusive a que já tinha placar',
  );
  assert.deepEqual(
    detalheDepois.rounds.map((entry) => entry.position),
    [1, 2],
    'a numeração das missões recomeça',
  );
  const idsAntigos = detalheAntes.rounds.map((entry) => entry.id);
  assert.equal(
    detalheDepois.rounds.some((entry) => idsAntigos.includes(entry.id)), false,
    'as rodadas da batalha nova são OUTRAS rodadas (ids novos) — nenhuma nota antiga pode ser confundida com nota desta batalha',
  );
  assert.deepEqual(
    detalheDepois.participants.filter((entry) => entry.active).map((entry) => entry.name).sort(),
    ['Ana', 'Bia'],
    'a turma continua na sala',
  );

  // O aluno volta ao começo: nenhuma nota, nenhuma tentativa gasta.
  const lobby = (await f.api('arena_lobby', ana)).lobby;
  assert.equal(lobby.room.phase, 'lobby');
  assert.equal(lobby.current_round, null);
  assert.deepEqual(lobby.results, [], 'nenhum resultado da batalha anterior aparece');
  assert.equal(lobby.ranking.length, 0, 'o ranking da batalha nova começa vazio');
  assert.deepEqual(lobby.rounds.map((entry) => entry.attempts_used), [0, 0]);
  assert.deepEqual(lobby.rounds.map((entry) => entry.best_percent), [null, null]);

  // E o histórico da anterior continua inteiro, preso às rodadas dela.
  const antigas = await f.repositories.arena.rounds.listByRoomCycle(f.room.id, 1);
  assert.deepEqual(
    antigas.map((entry) => entry.status),
    ['closed', 'pending'],
    'a missão que tinha placar fecha; a que nunca abriu continua pendente, porque não havia nada para fechar',
  );
  // Dois envios na batalha 1: o da Ana e o vazio que o fechamento grava para
  // quem não enviou (é assim que a nota zero do tempo esgotado ganha linha).
  const enviosDaBatalha1 = await f.repositories.arena.submissions.listByRound(f.rounds[0].id);
  assert.equal(enviosDaBatalha1.length, 2);
  assert.equal(enviosDaBatalha1.filter((entry) => entry.prompt).length, 1, 'só um prompt de verdade foi escrito');
  const notasDaBatalha1 = await f.repositories.arena.scores.listByRound(f.rounds[0].id);
  assert.equal(notasDaBatalha1.length, 2, 'a nota da Ana e o zero da Bia ficam');
  assert.ok(
    notasDaBatalha1.some((entry) => entry.judgeStatus === 'timeout' && String(entry.participantId) === String(bia.participant_id)),
    'quem não enviou na batalha 1 continua com o zero do tempo esgotado',
  );
  assert.equal((await f.repositories.arena.submissions.listByRound(detalheDepois.rounds[0].id)).length, 0, 'a batalha 2 tem os seus próprios envios');
  assert.ok((await f.repositories.arena.participants.listByRoom(f.room.id)).some((entry) => String(entry.id) === String(bia.participant_id) && entry.active), 'a Bia continua sendo a mesma pessoa na sala');
});

test('a batalha nova devolve os mesmos desafios, na mesma ordem', async (t) => {
  const f = await fixture(t, { missions: 3 });
  await emJogo(f, ['Ana']);
  const antes = (await f.detail()).rounds.map((entry) => entry.challenge_id);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  const depois = (await f.detail()).rounds.map((entry) => entry.challenge_id);
  assert.deepEqual(depois, antes, 'as missões da batalha nova são as mesmas, na mesma ordem');
});

test('um segundo clique não cria uma terceira batalha', async (t) => {
  const f = await fixture(t);
  await emJogo(f, ['Ana']);
  const primeira = await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  assert.equal(primeira.battle.cycle, 2);

  // O painel manda o ciclo que VIU: o clique repetido (ou uma aba velha) não
  // pode gastar a batalha que o professor acabou de começar.
  const repetida = await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  assert.equal(repetida.ok, true);
  assert.equal(repetida.already, true);
  const ciclos = await f.repositories.arena.rounds.cycles(f.room.id);
  assert.deepEqual(ciclos.map((entry) => entry.cycle), [1, 2], 'não nasceu um ciclo 3');

  // Com o ciclo em dia, uma segunda batalha de verdade é permitida.
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  const terceira = await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 2 });
  assert.equal(terceira.battle.cycle, 3);
});

test('batalha nova no meio de uma rodada fecha a antiga como o professor a fecharia', async (t) => {
  // Duas salas idênticas: numa o professor encerra a rodada pelo caminho de
  // sempre; na outra ele começa uma batalha nova com a rodada ainda aberta. O
  // que fica guardado da batalha 1 tem de ser o MESMO — inclusive o zero de
  // quem não enviou.
  const desfecho = async (metodo) => {
    const f = await fixture(t, { missions: 1 });
    const [ana, bia] = await emJogo(f);
    f.time(1010);
    await f.api('arena_submit', { ...ana, round_id: f.rounds[0].id, attempt: 1, prompt: 'Prompt da Ana' });
    if (metodo === 'professor') {
      f.time(1400);
      await f.api('arena_end_round', { ...f.admin, room_id: f.room.id });
      await f.api('arena_close_round', { ...f.admin, room_id: f.room.id });
      await f.api('arena_end_room', { ...f.admin, room_id: f.room.id });
    } else {
      f.time(1400);
      await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
    }
    const rodadas = await f.repositories.arena.rounds.listByRoomCycle(f.room.id, 1);
    // Sem o id do participante: são duas salas diferentes, com pessoas
    // diferentes. O que tem de ser igual dos dois jeitos é a NOTA que ficou.
    const notas = (await f.repositories.arena.scores.listByRound(f.rounds[0].id))
      .map((entry) => ({ percent: entry.percent, status: entry.judgeStatus, points: entry.points }))
      .sort((a, b) => a.percent - b.percent);
    return { rodada: rodadas[0].status, notas, sala: (await f.repositories.arena.rooms.getById(f.room.id)).status };
  };

  const peloProfessor = await desfecho('professor');
  const pelaBatalhaNova = await desfecho('batalha');
  assert.deepEqual(pelaBatalhaNova.notas, peloProfessor.notas, 'a batalha 1 fecha com as mesmas notas dos dois jeitos');
  assert.equal(pelaBatalhaNova.rodada, 'closed', 'a rodada da batalha 1 fica encerrada, e não em exibição de resultado');
  assert.equal(pelaBatalhaNova.sala, 'open', 'e a sala volta para a espera da batalha nova');
  assert.deepEqual(pelaBatalhaNova.notas, [
    { percent: 0, status: 'timeout', points: null },
    { percent: 80, status: 'scored', points: pelaBatalhaNova.notas[1].points },
  ], 'quem não enviou leva o zero do tempo esgotado e quem enviou fica com a nota do juiz');
});

test('a rodada da batalha nova aceita envio e pontua do zero', async (t) => {
  const f = await fixture(t, { missions: 1, duration: 120 });
  const [ana] = await emJogo(f, ['Ana']);
  f.time(1010);
  await f.api('arena_submit', { ...ana, round_id: f.rounds[0].id, attempt: 1, prompt: 'Primeira batalha' });
  f.time(1400);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });

  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  const nova = (await f.detail()).rounds[0];
  f.time(1500);
  const envio = await f.api('arena_submit', { ...ana, round_id: nova.id, attempt: 1, prompt: 'Segunda batalha' });
  assert.equal(envio.ok, true, 'a tentativa 1 da batalha nova está livre de novo');
  assert.equal((await f.repositories.arena.submissions.listByRound(nova.id)).length, 1);
  assert.equal(envio.submission.percent, 80);

  // A tentativa gasta da batalha nova não conta para a antiga (e vice-versa).
  const lobby = (await f.api('arena_lobby', ana)).lobby;
  assert.equal(lobby.rounds[0].attempts_used, 1);
  assert.equal(lobby.ranking[0].rounds_completed, 1, 'o ranking da batalha nova só vê a batalha nova');
});

test('limpar a lista libera a sala para a próxima turma, sem apagar ninguém', async (t) => {
  const f = await fixture(t, { missions: 1 });
  const [ana] = await emJogo(f, ['Ana']);
  await f.api('arena_submit', { ...ana, round_id: f.rounds[0].id, attempt: 1, prompt: 'Prompt da Ana' });
  f.time(1400);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1, keep_participants: false });

  // A sessão de quem saiu morre junto com a batalha.
  await assert.rejects(f.api('arena_lobby', { ...ana }), (error) => error.status === 401);

  const volta = await f.api('arena_join', { code: f.room.code, name: 'Ana' });
  assert.notEqual(volta.participant.id, ana.participant_id, 'quem volta entra como identidade nova');

  const registros = await f.repositories.arena.participants.listByRoom(f.room.id);
  assert.equal(registros.filter((entry) => entry.active).length, 1, 'só a turma nova está na sala');
  assert.equal(registros.filter((entry) => !entry.active).length, 1, 'o registro de quem saiu continua no relatório');
  // E o envio da batalha antiga continua preso ao participante antigo.
  const envios = await f.repositories.arena.submissions.listByRound(f.rounds[0].id);
  assert.deepEqual(envios.map((entry) => String(entry.participantId)), [String(ana.participant_id)]);
});

test('o relatório lê cada batalha como uma batalha, sem duplicar o jogador', async (t) => {
  const f = await fixture(t, { missions: 1 });
  const [ana] = await emJogo(f, ['Ana']);
  await f.api('arena_submit', { ...ana, round_id: f.rounds[0].id, attempt: 1, prompt: 'Batalha 1' });
  f.time(1400);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  const nova = (await f.detail()).rounds[0];
  f.time(1500);
  await f.api('arena_submit', { ...ana, round_id: nova.id, attempt: 1, prompt: 'Batalha 2' });

  const { metrics } = await f.core('report_metrics', f.admin);
  const batalhas = metrics.tables.games.filter((entry) => String(entry.id).startsWith(`arena:${f.room.id}`));
  const codigo = f.room.pin || f.room.code;
  assert.equal(batalhas.length, 2, 'cada batalha tem a sua entrada');
  assert.deepEqual(
    batalhas.map((entry) => entry.cycle).sort(),
    [codigo, `${codigo} #2`].sort(),
    'e o rótulo diz qual é qual',
  );
  assert.equal(metrics.tables.players.length, 1, 'quem jogou as duas batalhas é UMA pessoa na tabela');
  assert.equal(metrics.tables.players[0].rounds_completed, 2, 'com as rodadas das duas somadas');
  assert.equal(metrics.tables.sessions.length, 1, 'e o cadastro também não é contado duas vezes');
  assert.equal(metrics.cards.total_sessions, 1);
});

test('a batalha nova não leva pendências da anterior para a fila do vigia', async (t) => {
  const f = await fixture(t, { missions: 1 });
  await emJogo(f, ['Ana']);
  // Um envio que ficou SEM nota (o provedor falhou e o pátio estava desligado
  // nesta instalação): é exatamente a linha que a retomada do boot iria buscar.
  const desafio = await f.repositories.arena.challenges.getById(f.rounds[0].challengeId);
  assert.ok(desafio);
  const orfao = await f.repositories.arena.submissions.create({
    id: 'submissao-sem-nota', roomId: f.room.id, participantId: (await f.repositories.arena.participants.listByRoom(f.room.id))[0].id,
    roundId: f.rounds[0].id, attempt: 1, prompt: 'Envio que ficou sem nota', submittedAt: 1010,
  });
  assert.equal(orfao.id, 'submissao-sem-nota');
  assert.equal((await f.repositories.arena.submissions.listAwaitingScore({ since: 0 })).length, 1, 'antes da batalha nova, a pendência é trabalho');

  f.time(1400);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  assert.equal(
    (await f.repositories.arena.submissions.listAwaitingScore({ since: 0 })).length, 0,
    'depois dela, a sala viva não sai reavaliando a batalha passada',
  );
});

test('o estado coletivo do Modo Arena e o sorteio são da batalha, e não da sala', async (t) => {
  const f = await fixture(t, { preset: 'arena', capacity: 10, missions: 1 });
  await emJogo(f, ['Ana', 'Bia', 'Carla']);
  // Duas ações reais gravam o estado coletivo da sala: o sorteio da vez e a
  // configuração da partida (é a chave que `readArenaMode` lê — o Boss, a
  // energia, os votos e os competidores moram nela).
  await f.api('arena_draw_setup', { ...f.admin, room_id: f.room.id, mode: 'livre', group_size: 3 });
  await f.api('arena_mode_configure', { ...f.admin, room_id: f.room.id, boss_max_health: 5 });
  assert.ok(await f.repositories.settings.get(`arena.draw.${f.room.id}`), 'o sorteio da vez está guardado');
  assert.ok(await f.repositories.settings.get(`arena.mode.${f.room.id}`), 'o estado do Boss está guardado');

  f.time(1400);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  assert.equal(await f.repositories.settings.get(`arena.draw.${f.room.id}`), undefined, 'a batalha nova começa sem sorteio');
  assert.equal(await f.repositories.settings.get(`arena.mode.${f.room.id}`), undefined, 'e sem nenhum estado da partida anterior');
  const detalhe = await f.detail();
  assert.equal(detalhe.arena.enabled, true);
  assert.equal(detalhe.arena.boss.health, detalhe.arena.boss.max_health, 'o Boss volta inteiro para a turma nova');
  assert.equal(detalhe.arena.competed_count, 0, 'e ninguém carrega a vez de ter competido na batalha antiga');
  assert.equal(detalhe.draw.mode !== undefined, true, 'o sorteio da tela volta ao estado inicial');
});

test('a recusa é explícita: rascunho, arquivada, sem missões e sem batalha jogada', async (t) => {
  const rascunho = await fixture(t, { missions: 1 });
  await assert.rejects(
    rascunho.api('arena_new_battle', { ...rascunho.admin, room_id: rascunho.room.id, cycle: 1 }),
    (error) => error.status === 409 && /rascunho/.test(error.message),
  );

  const semJogo = await fixture(t, { missions: 1 });
  await semJogo.api('arena_publish_room', { ...semJogo.admin, room_id: semJogo.room.id });
  await assert.rejects(
    semJogo.api('arena_new_battle', { ...semJogo.admin, room_id: semJogo.room.id, cycle: 1 }),
    (error) => error.status === 409 && /batalha para repetir/.test(error.message),
    'sala publicada e nunca jogada não tem o que repetir',
  );

  const semMissoes = await fixture(t, { missions: 1 });
  await emJogo(semMissoes, ['Ana']);
  await semMissoes.repositories.arena.rounds.remove(semMissoes.rounds[0].id);
  await assert.rejects(
    semMissoes.api('arena_new_battle', { ...semMissoes.admin, room_id: semMissoes.room.id, cycle: 1 }),
    (error) => error.status === 409 && /missões para jogar/.test(error.message),
  );

  const arquivada = await fixture(t, { missions: 1 });
  await emJogo(arquivada, ['Ana']);
  await arquivada.api('arena_end_room', { ...arquivada.admin, room_id: arquivada.room.id });
  await arquivada.api('arena_archive_room', { ...arquivada.admin, room_id: arquivada.room.id });
  await assert.rejects(
    arquivada.api('arena_new_battle', { ...arquivada.admin, room_id: arquivada.room.id, cycle: 1 }),
    (error) => error.status === 409 && /arquivada/.test(error.message),
  );
});

test('sala clássica de 3 lugares repete a batalha com o mesmo cadastro travado', async (t) => {
  const f = await fixture(t, { preset: 'classic' });
  assert.equal(f.rounds.length, 3, 'o preset clássico traz as 3 rodadas oficiais');
  await f.api('arena_publish_room', { ...f.admin, room_id: f.room.id });
  const ana = await f.join('Ana'), bia = await f.join('Bia'), carla = await f.join('Carla');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  f.time(1010);
  await f.api('arena_submit', { ...ana, round_id: f.rounds[0].id, attempt: 1, prompt: 'Prompt da Ana' });
  await f.api('arena_submit', { ...bia, round_id: f.rounds[0].id, attempt: 1, prompt: 'Prompt da Bia' });
  await f.api('arena_submit', { ...carla, round_id: f.rounds[0].id, attempt: 1, prompt: 'Prompt da Carla' });

  f.time(1400);
  await f.api('arena_new_battle', { ...f.admin, room_id: f.room.id, cycle: 1 });
  const status = await f.status();
  assert.equal(status.status, 'open');
  assert.equal(status.can_start, true, 'os 3 lugares continuam preenchidos e a batalha nova começa');
  assert.equal(status.expected_players, 3);
  const iniciada = await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  assert.equal(iniciada.ok, true, 'a sala clássica reinicia sem pedir cadastro de novo');
});
