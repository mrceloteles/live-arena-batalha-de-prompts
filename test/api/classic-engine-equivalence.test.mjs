import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createApi } from '../../src/server/api.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createFallbackSafeCriteriaJudge } from '../../src/judge/criteria-judge.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';

// Uma unica bateria de prompts, identica nas duas engrenagens, com niveis de
// qualidade claramente diferentes para o juiz fake diferenciar os jogadores.
const PROMPTS = {
  ana: {
    1: 'Uma mulher sorridente de jaqueta vermelha tira uma selfie numa trilha de montanha com o cabelo loiro ao vento',
    2: 'Uma grande biblioteca subaquatica numa cupula de vidro, um polvo laranja de oculos redondos lendo livros antigos',
    3: 'Um pequeno robo branco rega uma grande orquidea azul bioluminescente numa estufa futurista a noite',
  },
  bia: {
    1: 'selfie de mulher na trilha da montanha com outra pessoa ao fundo',
    2: 'polvo laranja numa biblioteca subaquatica',
    3: 'robo branco com uma orquidea numa estufa',
  },
  caio: {
    1: 'uma foto de montanha',
    2: 'alguns animais no mar',
    3: 'uma planta numa sala',
  },
};

// Rodadas comecam em 5_00n_000 (n=1..3); submissões em +2..+4s de cada inicio.
const START = { 1: 5_001_000, 2: 5_002_000, 3: 5_003_000 };
const PLAYER_KEYS = ['ana', 'bia', 'caio'];

let opened, repositories, clock, legacyDispatch, arenaDispatch, adminToken, sequence;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 5_000_000;
  sequence = 0;
  const judge = createFakeJudge();

  legacyDispatch = createApi({
    repositories,
    judge,
    now: () => clock,
    id: () => `legacy-${++sequence}`,
  });

  const adminAuth = createAdminAuth({
    password: 'senha-segura-123', secret: 'segredo-muito-longo-para-teste-123456',
    now: () => clock,
  });
  adminToken = adminAuth.login('senha-segura-123').token;
  arenaDispatch = createArenaApi({
    repositories,
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    classicJudge: judge,
    now: () => clock,
    id: () => `unified-${++sequence}`,
    adminAuth,
  });
});

afterEach(() => opened.close());

async function runLegacyBattle() {
  clock = 5_000_000;
  const game = await repositories.rooms.createCycle({ id: 'legacy-game', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);

  const sessions = [];
  for (let station = 1; station <= 3; station += 1) {
    clock += 1;
    sessions.push((await legacyDispatch('register', {
      station_id: station,
      name: ['Ana', 'Bia', 'Caio'][station - 1],
      email: `j${station}@example.com`, role: 'Aluno', company: 'Escola', lgpd_accept: true,
      mode: 'wait_all',
    })).session);
  }

  for (let round = 1; round <= 3; round += 1) {
    clock = START[round];
    for (const session of sessions) {
      await legacyDispatch('start_match', { session_id: session.id, mode: 'wait_all' });
    }
    for (let index = 0; index < sessions.length; index += 1) {
      clock = START[round] + 2 + index;
      await legacyDispatch('submit_prompt', {
        match_id: `m-${game.cycle}-${round}-${index + 1}`,
        session_id: sessions[index].id,
        token: `legacy-r${round}-s${index + 1}`,
        prompt: PROMPTS[PLAYER_KEYS[index]][round],
      });
    }
    if (round < 3) {
      // Janela de 10s passa; o motor legado volta para "ready" no proximo poll.
      clock = START[round + 1];
      await legacyDispatch('room_status', {});
    }
  }
  return game;
}

async function runUnifiedBattle() {
  clock = 5_000_000;
  await arenaDispatch('arena_set_open', { admin_token: adminToken, open: true });
  const room = (await arenaDispatch('arena_create_room', {
    admin_token: adminToken, preset: 'classic', title: 'Batalha Equivalencia',
  })).room;
  const players = [];
  for (const name of ['Ana', 'Bia', 'Caio']) {
    clock += 1;
    const join = await arenaDispatch('arena_join', { code: room.pin, name });
    players.push({ ...join.participant, token: join.token });
  }

  let openRoundId = null;
  for (let round = 1; round <= 3; round += 1) {
    if (round === 1) {
      clock = START[round];
      const started = (await arenaDispatch('arena_start_round', { admin_token: adminToken, room_id: room.id })).room;
      openRoundId = started.rounds[0].id;
    } else {
      // A janela de 10s fecha o placar e a proxima rodada abre neste instante.
      clock = START[round];
      const lobby = (await arenaDispatch('arena_lobby', { participant_id: players[0].id, token: players[0].token })).lobby;
      openRoundId = lobby.current_round.id;
    }
    for (let index = 0; index < players.length; index += 1) {
      clock = START[round] + 2 + index;
      await arenaDispatch('arena_submit', {
        participant_id: players[index].id, token: players[index].token,
        round_id: openRoundId, prompt: PROMPTS[PLAYER_KEYS[index]][round],
      });
    }
  }
  return { room, players };
}

async function legacyScoreRows() {
  const rows = await opened.database.prepare(`SELECT
      matches.round_number AS round_number,
      sessions.station_id AS station_id,
      scores.percent AS percent,
      scores.points AS points,
      scores.position AS position,
      scores.elapsed_seconds AS elapsed
    FROM scores
    JOIN submissions ON submissions.id = scores.submission_id
    JOIN sessions ON sessions.id = submissions.session_id
    JOIN matches ON matches.id = submissions.match_id
    ORDER BY matches.round_number, sessions.station_id`).all();
  return rows.map((row) => ({
    round: Number(row.round_number), station: Number(row.station_id),
    percent: Number(row.percent), points: Number(row.points),
    position: Number(row.position), elapsed: Number(row.elapsed),
  }));
}

async function unifiedScoreRows() {
  const rows = await opened.database.prepare(`SELECT
      room_rounds.position AS round_number,
      arena_participants.station_number AS station_id,
      arena_scores.percent AS percent,
      arena_scores.points AS points,
      arena_scores.position AS position
    FROM arena_scores
    JOIN arena_submissions ON arena_submissions.id = arena_scores.submission_id
    JOIN arena_participants ON arena_participants.id = arena_submissions.participant_id
    JOIN room_rounds ON room_rounds.id = arena_submissions.round_id
    ORDER BY room_rounds.position, arena_participants.station_number`).all();
  return rows.map((row) => ({
    round: Number(row.round_number), station: Number(row.station_id),
    percent: Number(row.percent), points: Number(row.points),
    position: Number(row.position),
  }));
}

test('classic preset room reproduces the legacy engine score-for-score', async () => {
  await runLegacyBattle();
  const legacy = await legacyScoreRows();
  assert.equal(legacy.length, 9);

  await runUnifiedBattle();
  const unified = await unifiedScoreRows();
  assert.equal(unified.length, 9);

  for (let index = 0; index < legacy.length; index += 1) {
    const left = legacy[index];
    const right = unified[index];
    assert.equal(right.round, left.round, `round mismatch at ${index}`);
    assert.equal(right.station, left.station, `station mismatch at ${index}`);
    assert.equal(right.percent, left.percent, `percent mismatch at ${index}`);
    assert.equal(right.points, left.points, `points mismatch (round ${left.round} station ${left.station})`);
    assert.equal(right.position, left.position, `position mismatch (round ${left.round} station ${left.station})`);
  }
});

test('classic preset final podium matches the legacy final ranking', async () => {
  await runLegacyBattle();
  const legacyPodium = (await legacyDispatch('room_status', {})).room.final_ranking.map((row) => ({
    name: row.player_name, points: Number(row.total_points), position: Number(row.position),
  }));

  const { players } = await runUnifiedBattle();
  clock += 5;
  const lobby = (await arenaDispatch('arena_lobby', { participant_id: players[0].id, token: players[0].token })).lobby;
  const unifiedPodium = lobby.ranking.map((row) => ({
    name: row.name, points: Number(row.total_points), position: Number(row.position),
  }));

  assert.equal(unifiedPodium.length, legacyPodium.length);
  for (let index = 0; index < legacyPodium.length; index += 1) {
    assert.equal(unifiedPodium[index].name, legacyPodium[index].name);
    assert.equal(unifiedPodium[index].points, legacyPodium[index].points);
    assert.equal(unifiedPodium[index].position, legacyPodium[index].position);
  }
});
