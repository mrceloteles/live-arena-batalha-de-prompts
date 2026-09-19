import { openDatabase } from '../../../src/db/database.mjs';
import { createRepositories } from '../../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../../src/judge/fake-judge.mjs';
import { createApi } from '../../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../../src/server/start.mjs';

const ACTIONS = ['status', 'register_all', 'accept_all', 'submit_all', 'advance_window'];

function registration(station) {
  return {
    station_id: station,
    name: `Jogador Teste ${station}`,
    email: `jogador-${station}@example.invalid`,
    role: 'Aluno',
    company: 'Laboratorio de fidelidade',
    lgpd_accept: true,
    mode: 'wait_all',
  };
}

function normalizedRoom(room) {
  return {
    phase: room.phase,
    expected_stations: room.expected_stations,
    registered: room.registered,
    playing_stations: room.playing_stations,
    submitted: room.submitted,
    scored: room.scored,
    all_registered: room.all_registered,
    all_submitted: room.all_submitted,
    all_scored: room.all_scored,
    round_number: room.round?.round_number ?? 0,
    total_rounds: room.game?.total_rounds ?? 3,
  };
}

export async function createClassicHarness() {
  let opened;
  let repositories;
  let dispatch;
  let sessions = [];
  let matches = [];
  let clock = 1000;
  let sequence = 0;

  async function initialize() {
    opened = openDatabase(':memory:');
    await opened.migrate();
    repositories = createRepositories(opened.database);
    const game = await repositories.rooms.createCycle({ id: 'aalpy-classic', now: clock });
    await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
    dispatch = createApi({
      repositories,
      judge: createFakeJudge(),
      now: () => clock,
      id: () => `aalpy-id-${++sequence}`,
    });
  }

  async function status() {
    return normalizedRoom((await dispatch('room_status', { room_id: 'main' })).room);
  }

  await initialize();

  return {
    actions: () => [...ACTIONS],
    async reset() {
      opened.close();
      sessions = [];
      matches = [];
      clock = 1000;
      sequence = 0;
      await initialize();
      return status();
    },
    async step(action) {
      try {
        if (action === 'status') return status();
        if (action === 'register_all') {
          const nextSessions = [];
          for (let station = 1; station <= 3; station += 1) {
            nextSessions.push((await dispatch('register', registration(station))).session);
          }
          sessions = nextSessions;
          return status();
        }
        if (action === 'accept_all') {
          const nextMatches = [];
          for (const session of sessions) {
            nextMatches.push((await dispatch('start_match', { session_id: session.id, mode: 'wait_all' })).match);
          }
          matches = nextMatches;
          return status();
        }
        if (action === 'submit_all') {
          for (let index = 0; index < matches.length; index += 1) {
            clock += 1;
            await dispatch('submit_prompt', {
              match_id: matches[index].id,
              session_id: sessions[index].id,
              token: `aalpy-${matches[index].round_number}-${index + 1}`,
              prompt: `astronauta no espaço resposta ${index + 1}`,
            });
          }
          return status();
        }
        if (action === 'advance_window') {
          const before = (await dispatch('room_status', { room_id: 'main' })).room;
          if (before.phase === 'results') clock = Number(before.round.results_at) + 10;
          if (before.phase === 'final_results') clock = Number(before.game.finished_at) + 30;
          return status();
        }
        return { error: 'unknown_action' };
      } catch (error) {
        return {
          error: error?.code || error?.name || 'operation_rejected',
          status: Number(error?.status || error?.statusCode || 0),
          phase: (await status()).phase,
        };
      }
    },
    close() {
      opened.close();
    },
  };
}
