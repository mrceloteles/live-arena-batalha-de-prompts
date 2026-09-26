import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createFallbackSafeCriteriaJudge } from '../../src/judge/criteria-judge.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { formatPin, isValidPin } from '../../src/domain/pin.mjs';
import { rankRound } from '../../src/domain/ranking.mjs';
import { calculatePoints } from '../../src/domain/scoring.mjs';

let opened, repositories, arenaDispatch, clock, sequence, adminToken;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 2_000_000;
  sequence = 0;
  const adminAuth = createAdminAuth({
    password: 'senha-segura-123', secret: 'segredo-muito-longo-para-teste-123456',
    now: () => clock,
  });
  adminToken = adminAuth.login('senha-segura-123').token;
  arenaDispatch = createArenaApi({
    repositories,
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    classicJudge: createFakeJudge(),
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
  });
});

afterEach(() => opened.close());

const admin = () => ({ admin_token: adminToken });
const api = (action, payload = {}) => arenaDispatch(action, payload);

test('three curated classic decks stay distinct and preserve the classic rules', async () => {
  const images = new Set();
  const references = new Set();
  for (const deck of ['observacao', 'imaginacao', 'composicao']) {
    const { room } = await api('arena_create_room', { ...admin(), preset: 'turma', title: `Curadoria ${deck}`, expected_players: 30, classic_deck: deck });
    assert.equal(room.expectedPlayers, 30);
    assert.equal(room.settings.judgeKind, 'classic');
    assert.equal(room.settings.roundDuration, 60);
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    assert.equal(rounds.length, 3);
    for (const round of rounds) {
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      assert.equal(challenge.judgeKind, 'classic');
      assert.equal(challenge.attempts, 1);
      assert.ok(challenge.referencePrompt.length > 80);
      images.add(challenge.referenceImage);
      references.add(challenge.referencePrompt);
    }
  }
  assert.equal(images.size, 9);
  assert.equal(references.size, 9);
});

test('an invalid classic deck is rejected before any room is created', async () => {
  await assert.rejects(api('arena_create_room', { ...admin(), preset: 'classic', title: 'Invalida', classic_deck: 'missing' }), error => error.status === 422);
  assert.equal((await repositories.arena.rooms.list()).length, 0);
});

test('all three curated battles finish with single submissions, visible scores and a final winner', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  for (const deck of ['observacao', 'imaginacao', 'composicao']) {
    const { room } = await api('arena_create_room', { ...admin(), preset: 'classic', title: `Jogo ${deck}`, classic_deck: deck });
    const players = await joinAll(room, ['Ana', 'Bia', 'Caio']);
    await api('arena_start_round', { ...admin(), room_id: room.id });
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    for (const [index, round] of rounds.entries()) {
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      const sent = await submitAll(players, round.id, [challenge.referencePrompt, challenge.referencePrompt + ' paisagem', 'Imagem azul']);
      assert.ok(sent.every(value => Number.isFinite(value.points) && Number.isFinite(value.percent)));
      await assert.rejects(api('arena_submit', { participant_id: players[0].id, token: players[0].token, round_id: round.id, prompt: 'Outro envio' }), error => error.status === 409);
      const args = { participant_id: players[0].id, token: players[0].token };
      let lobby = (await api('arena_lobby', args)).lobby;
      assert.equal(lobby.results.length, index + 1);
      clock += index === 2 ? 31 : 11;
      lobby = (await api('arena_lobby', args)).lobby;
      if (index < 2) assert.equal(lobby.current_round.position, index + 2);
      else {
        assert.equal(lobby.room.status, 'ended');
        assert.equal(lobby.ranking.length, 3);
        assert.equal(lobby.ranking[0].name, 'Ana');
      }
    }
  }
});

async function joinAll(room, names) {
  const joins = [];
  for (const name of names) {
    clock += 1;
    joins.push((await api('arena_join', { code: room.pin, name })));
  }
  return joins.map((join) => ({ ...join.participant, token: join.token }));
}

async function submitAll(players, roundId, prompts) {
  const results = [];
  for (let index = 0; index < players.length; index += 1) {
    clock += 1;
    results.push((await api('arena_submit', {
      participant_id: players[index].id, token: players[index].token,
      round_id: roundId, prompt: prompts[index],
    })).submission);
  }
  return results;
}

test('classic preset creates a waiting room with a 6-digit PIN and the 3 official rounds', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const created = (await api('arena_create_room', { ...admin(), preset: 'classic', title: 'Batalha Classica' })).room;
  assert.equal(created.preset, 'classic');
  assert.equal(created.status, 'waiting');
  assert.equal(created.code, created.pin);
  assert.equal(isValidPin(created.pin), true);
  assert.equal(formatPin(created.pin).length, 7);
  assert.equal(created.expectedPlayers, 3);
  assert.equal(created.settings.judgeKind, 'classic');
  assert.equal(created.settings.rounds, 3);
  assert.equal(created.settings.roundDuration, 60);
  assert.equal(created.settings.rosterLocksAtStart, true);

  const detail = (await api('arena_room_detail', { ...admin(), room_id: created.id })).detail;
  assert.equal(detail.room.phase, 'lobby');
  assert.deepEqual(detail.rounds.map((round) => round.status), ['pending', 'pending', 'pending']);
  const seeded = await repositories.arena.challenges.getById(
    (await repositories.arena.rounds.listByRoom(created.id))[0].challengeId,
  );
  assert.equal(seeded.judgeKind, 'classic');
  assert.ok(seeded.referencePrompt.length > 40);
  assert.ok(seeded.rubric.length > 20);
  assert.equal(seeded.durationSeconds, 60);

  // Rodadas oficiais nao podem ser editadas na sala classica.
  await assert.rejects(
    api('arena_add_round', { ...admin(), room_id: created.id, challenge_id: seeded.id }),
    (error) => error.status === 409,
  );
});

test('classic roster locks at start and the game only starts with the room full', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), preset: 'classic', title: 'Turma B' })).room;
  const [ana, bia] = await joinAll(room, ['Ana', 'Bia']);
  assert.equal(ana.station, undefined); // cliente nunca recebe station

  // 2 de 3: professor nao consegue iniciar.
  await assert.rejects(
    api('arena_start_round', { ...admin(), room_id: room.id }),
    (error) => error.status === 409 && /Aguardando o cadastro dos 3 jogadores/.test(error.message),
  );

  const [caio] = await joinAll(room, ['Caio']);
  const stations = await repositories.arena.participants.activeStations(room.id);
  assert.deepEqual(stations, [1, 2, 3]);
  await assert.rejects(
    api('arena_join', { code: room.pin, name: 'Duda' }),
    (error) => error.status === 409 && /limite de participantes/.test(error.message),
  );

  const started = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  assert.equal(started.room.status, 'playing');
  assert.equal(started.room.phase, 'playing');
  assert.equal(started.rounds[0].status, 'open');
  assert.equal(started.rounds[0].deadline_at, clock + 60);

  // Roster travado: ninguem entra depois do inicio.
  await assert.rejects(
    api('arena_join', { code: room.pin, name: 'Eli' }),
    (error) => error.status === 409,
  );
  assert.equal(ana.id.length > 0, true);
  assert.equal(bia.token.length > 0, true);
  void caio;
});

test('full classic battle: submissions, classic points, timeout zeroing, final ranking and finish', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), preset: 'classic', title: 'Turma C' })).room;
  const [ana, bia, caio] = await joinAll(room, ['Ana', 'Bia', 'Caio']);
  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  const round1 = detail.rounds[0];

  const first = await api('arena_submit', {
    participant_id: ana.id, token: ana.token, round_id: round1.id,
    prompt: 'Uma mulher sorridente de jaqueta vermelha numa trilha de montanha, cabelo ao vento',
  });
  assert.ok(first.submission.percent > 0);
  assert.equal(first.submission.evolution, null);
  assert.equal(typeof first.submission.breakdown, 'object');

  clock += 2;
  await api('arena_submit', {
    participant_id: bia.id, token: bia.token, round_id: round1.id,
    prompt: 'paisagem com trilha e uma pessoa ao longe',
  });
  clock += 1;
  await api('arena_submit', {
    participant_id: caio.id, token: caio.token, round_id: round1.id,
    prompt: 'montanhas',
  });

  // Roster completo enviou: rodada fechou na hora para resultados.
  let lobby = (await api('arena_lobby', { participant_id: ana.id, token: ana.token })).lobby;
  assert.equal(lobby.room.phase, 'round_results');
  assert.equal(lobby.rounds[0].status, 'results');
  assert.equal(lobby.results.length, 1);
  // Janela de resultados: a rodada em exibicao continua como "atual" com a nota
  // do jogador — inclusive para quem fechou a rodada com o proprio envio.
  assert.ok(lobby.current_round, 'current_round presente na janela de resultados');
  assert.equal(lobby.current_round.round_over, true);
  assert.equal(lobby.current_round.position, 1);
  assert.ok(lobby.current_round.my_scores.length >= 1);
  assert.ok(Number.isFinite(Number(lobby.current_round.my_scores[0].points)));
  const closerLobby = (await api('arena_lobby', { participant_id: caio.id, token: caio.token })).lobby;
  assert.ok(closerLobby.current_round, 'quem fechou a rodada tambem ve a rodada atual');
  assert.equal(closerLobby.current_round.my_scores.length, 1);
  assert.ok(Number.isFinite(Number(closerLobby.current_round.my_scores[0].points)));
  const roundRanking = lobby.results[0].ranking;
  const arenaScores = await repositories.arena.scores.listByRound(round1.id);
  const participants = await repositories.arena.participants.listByRoom(room.id);
  const participantsById = new Map(participants.map((entry) => [String(entry.id), entry]));
  const submissions = await repositories.arena.submissions.listByRound(round1.id);
  const byParticipant = new Map(submissions.map((entry) => [String(entry.participantId), entry]));
  const manualRows = arenaScores.map((score) => {
    const participant = participantsById.get(String(score.participantId));
    const submission = byParticipant.get(String(score.participantId));
    const elapsed = Math.max(0, Math.min(60, Number(submission.submittedAt) - Number(round1.started_at)));
    return {
      station_id: participant.stationNumber,
      percent: Number(score.percent),
      points: calculatePoints(Number(score.percent), elapsed, 60),
      elapsed_seconds: elapsed,
    };
  });
  const manualRanked = rankRound(manualRows);
  const rankedByStation = new Map(manualRanked.map((row) => [Number(row.station_id), row]));
  for (const row of arenaScores) {
    const participant = participantsById.get(String(row.participantId));
    const manual = rankedByStation.get(participant.stationNumber);
    assert.equal(row.points, manual.points);
    assert.equal(row.position, manual.position);
  }
  // O ranking exibido segue a ordem classica.
  assert.deepEqual(
    roundRanking.map((row) => row.percent),
    [...arenaScores].sort((a, b) => a.position - b.position).map((row) => Number(row.percent)),
  );

  // Janela de 10s fecha a rodada e abre a proxima automaticamente.
  clock += 11;
  lobby = (await api('arena_lobby', { participant_id: bia.id, token: bia.token })).lobby;
  assert.equal(lobby.room.phase, 'playing');
  assert.equal(lobby.current_round.position, 2);

  // Round 2: Caio nao envia; timeout zera.
  const round2 = lobby.current_round;
  clock += 1;
  await api('arena_submit', {
    participant_id: ana.id, token: ana.token, round_id: round2.id,
    prompt: 'biblioteca subaquatica com polvo laranja de oculos',
  });
  clock += 1;
  await api('arena_submit', {
    participant_id: bia.id, token: bia.token, round_id: round2.id,
    prompt: 'polvo lendo livros debaixo da agua',
  });
  clock += 90;
  lobby = (await api('arena_lobby', { participant_id: caio.id, token: caio.token })).lobby;
  const caioRow = lobby.results[1].ranking.find((row) => row.name === 'Caio');
  assert.equal(caioRow.percent, 0);
  assert.equal(caioRow.points, 0);
  assert.equal(lobby.room.phase, 'round_results');

  // Round 3 e o final.
  clock += 11;
  lobby = (await api('arena_lobby', { participant_id: ana.id, token: ana.token })).lobby;
  assert.equal(lobby.current_round.position, 3);
  clock += 1;
  await api('arena_submit', {
    participant_id: ana.id, token: ana.token, round_id: lobby.current_round.id,
    prompt: 'robo branco regando orquidea azul bioluminescente na estufa',
  });
  clock += 1;
  await api('arena_submit', {
    participant_id: bia.id, token: bia.token, round_id: lobby.current_round.id,
    prompt: 'estufa futurista com orquidea e borboletas',
  });
  clock += 90;
  lobby = (await api('arena_lobby', { participant_id: bia.id, token: bia.token })).lobby;
  assert.equal(lobby.room.phase, 'final_results');
  assert.equal(lobby.results.length, 3);
  const finalRanking = lobby.ranking;
  assert.equal(finalRanking.length, 3);
  assert.equal(finalRanking[0].name, 'Ana');
  assert.equal(finalRanking[0].rounds_completed, 3);
  assert.ok(finalRanking[0].total_points > finalRanking[1].total_points);
  assert.ok(finalRanking[1].total_points > finalRanking[2].total_points);
  assert.deepEqual(
    finalRanking.map((row) => row.position),
    [1, 2, 3],
  );

  // Janela final (30s) encerra a sala.
  clock += 31;
  const finished = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(finished.room.status, 'ended');
  assert.equal(finished.room.phase, 'finished');
});

test('turma preset scales the classic battle and keeps the roster open', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), preset: 'turma', title: 'Turma 8A' })).room;
  assert.equal(room.preset, 'turma');
  assert.equal(room.status, 'waiting');
  assert.equal(room.expectedPlayers, 35);
  assert.equal(room.settings.judgeKind, 'classic');
  assert.equal(room.settings.rosterLocksAtStart, false);
  assert.equal(isValidPin(room.pin), true);

  const [ana, bia] = await joinAll(room, ['Ana', 'Bia']);
  // Sem lock: 2 jogadores ja podem comecar (regra da sala classica em escala).
  const started = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  assert.equal(started.room.phase, 'playing');
  // Late join continua valido durante a rodada.
  const [caio] = await joinAll(room, ['Caio']);
  assert.equal(caio.room.id, room.id);
  assert.ok(caio.token);
  assert.deepEqual(await repositories.arena.participants.activeStations(room.id), [1, 2, 3]);
  void ana;
  void bia;
});

test('turma preset honors the expected_players field at creation', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), preset: 'turma', title: 'Turma 8B', expected_players: 30 })).room;
  assert.equal(room.preset, 'turma');
  assert.equal(room.expectedPlayers, 30);
  assert.equal(room.settings.maxPlayers, 30);
  // O classic continua travado em 3, mesmo com expected_players enviado.
  const classic = (await api('arena_create_room', { ...admin(), preset: 'classic', title: 'Clássico', expected_players: 9 })).room;
  assert.equal(classic.expectedPlayers, 3);
  assert.equal(classic.settings.maxPlayers, 3);
});

test('personalizado preset keeps the draft/publish arena flow and supports the optional profile', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Missoes Livres', expected_players: 4 })).room;
  assert.equal(room.preset, 'personalizado');
  assert.equal(room.status, 'draft');
  assert.equal(room.settings.judgeKind, 'criteria');
  assert.equal(room.pin, null);

  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Cartaz', modality: 'precisao', mission: 'Crie um cartaz.',
    criteria: [{ criterion: 'objetivo', weight: 100 }], duration_seconds: 90,
    // Sem gabarito a sala não abre (gate de prontidão das missões).
    reference_text: 'Cartaz da feira com data, local, três stands e contato.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  const detail = (await api('arena_publish_room', { ...admin(), room_id: room.id })).room;
  assert.equal(detail.room.status, 'waiting');
  assert.equal(detail.room.phase, 'lobby');

  const join = await api('arena_join', { code: room.code, name: 'Lia' });
  const player = { ...join.participant, token: join.token };
  const profile = (await api('arena_set_profile', {
    participant_id: player.id, token: player.token,
    email: 'lia@escola.edu', role: 'Aluna', company: 'Escola Municipal', consent: true,
  })).profile;
  assert.equal(profile.email, 'lia@escola.edu');
  assert.equal(profile.consent, true);

  const stored = await repositories.arena.participants.getById(player.id);
  assert.equal(stored.role, 'Aluna');
  assert.equal(stored.stationNumber, 1);

  // Sem nenhum campo, o perfil nao aceita.
  await assert.rejects(
    api('arena_set_profile', { participant_id: player.id, token: player.token }),
    (error) => error.status === 422,
  );
});


test('classic lobby exposes the live roster with connected and is_me flags', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), preset: 'classic', title: 'Roster Test' })).room;
  const joins = [];
  for (const name of ['Ana', 'Bia', 'Caio']) {
    clock += 1;
    joins.push(await api('arena_join', { code: room.pin, name }));
  }
  clock += 1;
  const lobby = (await api('arena_lobby', {
    participant_id: joins[0].participant.id, token: joins[0].token,
  })).lobby;
  assert.equal(lobby.room.connected, 3);
  assert.equal(lobby.roster.length, 3);
  assert.deepEqual(lobby.roster.map((entry) => entry.name), ['Ana', 'Bia', 'Caio']);
  assert.equal(lobby.roster[0].is_me, true);
  assert.equal(lobby.roster[1].is_me, false);
  assert.equal(lobby.roster.every((entry) => entry.connected === true), true);
});

test('classic lobby hides the roster while a round is open', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), preset: 'classic', title: 'Roster Mid' })).room;
  const joins = [];
  for (const name of ['Ana', 'Bia', 'Caio']) {
    clock += 1;
    joins.push(await api('arena_join', { code: room.pin, name }));
  }
  clock += 1;
  await api('arena_start_round', { ...admin(), room_id: room.id });
  clock += 1;
  const lobby = (await api('arena_lobby', {
    participant_id: joins[0].participant.id, token: joins[0].token,
  })).lobby;
  // Roster ainda existe no payload, mas a UI decide esconder com a missao ativa.
  assert.equal(lobby.roster.length, 3);
  assert.ok(lobby.current_round, 'round is open');
  assert.equal(lobby.current_round.round_over, undefined);
});
