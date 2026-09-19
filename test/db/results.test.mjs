import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-base-results-'));
  const connection = openDatabase(join(directory, 'game.sqlite'));
  await connection.migrate();
  // fechar a conexao antes de remover a pasta evita EBUSY no Windows
  t.after(() => connection.close());
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositories = createRepositories(connection.database);
  await repositories.rooms.createCycle({ id: 'g1', now: 1 });
  for (let stationId = 1; stationId <= 3; stationId += 1) {
    await repositories.sessions.register({
      id: `s${stationId}`, gameId: 'g1', stationId, token: `t${stationId}`,
      playerName: `P${stationId}`, consent: true, now: 2,
    });
  }
  await repositories.matches.create({ id: 'm1', gameId: 'g1', roundNumber: 1, startedAt: 10, deadlineAt: 70, now: 10 });
  return { connection, repositories };
}

const score = (id, submissionId, sessionId, stationId, points) => ({
  id, submissionId, sessionId, stationId, percent: points / 100,
  points, elapsedSeconds: stationId * 2, position: stationId,
  scoringVersion: 'v1', explanation: 'ok', now: 20,
});
test('submission idempotency key is unique', async (t) => {
  const { repositories } = await fixture(t);
  await repositories.results.record({
    submission: { id: 'sub1', matchId: 'm1', sessionId: 's1', idempotencyKey: 'once', prompt: 'one', submittedAt: 20 },
    scores: [score('score1', 'sub1', 's1', 1, 9000)],
  });
  await assert.rejects(() => repositories.results.record({
    submission: { id: 'sub2', matchId: 'm1', sessionId: 's2', idempotencyKey: 'once', prompt: 'two', submittedAt: 21 },
    scores: [score('score2', 'sub2', 's2', 2, 8000)],
  }), /UNIQUE/);
  assert.equal((await repositories.submissions.listByMatch('m1')).length, 1);
});

test('submission and ranking scores roll back atomically on any failure', async (t) => {
  const { repositories } = await fixture(t);
  await assert.rejects(() => repositories.results.record({
    submission: { id: 'sub1', matchId: 'm1', sessionId: 's1', idempotencyKey: 'atomic', prompt: 'candidate', submittedAt: 20 },
    scores: [
      score('duplicate', 'sub1', 's1', 1, 9000),
      score('duplicate', 'sub1', 's2', 2, 8000),
    ],
  }), /UNIQUE/);
  assert.equal((await repositories.submissions.listByMatch('m1')).length, 0);
  assert.equal((await repositories.scores.listByMatch('m1')).length, 0);
});

test('report reconstructs sessions, matches, submissions, scores and judge audit', async (t) => {
  const { repositories } = await fixture(t);
  await repositories.results.record({
    submission: { id: 'sub1', matchId: 'm1', sessionId: 's1', idempotencyKey: 'report', prompt: 'candidate', submittedAt: 20 },
    scores: [score('score1', 'sub1', 's1', 1, 9000)],
    judgeAttempt: {
      id: 'ja1', submissionId: 'sub1', attempt: 1, status: 'succeeded',
      model: 'gemini-x', rubricVersion: 'r1', responseJson: '{"percent":90}', now: 20,
    },
  });
  const report = await repositories.reports.forGame('g1');
  assert.equal(report.game.id, 'g1');
  assert.equal(report.sessions.length, 3);
  assert.equal(report.matches.length, 1);
  assert.equal(report.submissions[0].prompt, 'candidate');
  assert.equal(report.scores[0].points, 9000);
  assert.equal(report.judgeAttempts[0].model, 'gemini-x');
});

test('repository timestamps must be finite server values', async (t) => {
  const { repositories } = await fixture(t);
  await assert.rejects(() => repositories.events.append({ gameId: 'g1', type: 'bad', data: {}, now: 'client-date' }), /now/);
  await assert.rejects(() => repositories.clientLogs.append({ gameId: 'g1', level: 'info', message: 'bad', now: NaN }), /now/);
});

test('an idempotent submission accepts multiple judge attempts before final scoring', async (t) => {
  const { repositories } = await fixture(t);
  const submission = {
    id: 'sub-retry', matchId: 'm1', sessionId: 's1', idempotencyKey: 'retry-key',
    prompt: 'candidate', submittedAt: 20,
  };
  assert.equal((await repositories.results.submit(submission)).id, 'sub-retry');
  assert.equal((await repositories.results.submit(submission)).id, 'sub-retry');

  await repositories.results.recordJudgeAttempt({
    id: 'attempt-1', submissionId: 'sub-retry', attempt: 1, status: 'failed', error: 'timeout', now: 21,
  });
  await repositories.results.recordJudgeAttempt({
    id: 'attempt-2', submissionId: 'sub-retry', attempt: 2, status: 'succeeded',
    model: 'gemini-x', responseJson: '{"percent":90}', now: 22,
  });

  const attempts = await repositories.judgeAttempts.listBySubmission('sub-retry');
  assert.deepEqual(attempts.map(({ attempt, status }) => ({ attempt, status })), [
    { attempt: 1, status: 'failed' }, { attempt: 2, status: 'succeeded' },
  ]);
  assert.equal((await repositories.submissions.listByMatch('m1')).length, 1);
});

test('final round ranking is stored atomically after independent submissions and retries', async (t) => {
  const { repositories } = await fixture(t);
  for (let stationId = 1; stationId <= 3; stationId += 1) {
    await repositories.results.submit({
      id: `rank-sub-${stationId}`, matchId: 'm1', sessionId: `s${stationId}`,
      idempotencyKey: `rank-key-${stationId}`, prompt: `p${stationId}`, submittedAt: 20,
    });
  }
  const ranking = [
    score('rank-score-1', 'rank-sub-1', 's1', 1, 9000),
    score('rank-score-2', 'rank-sub-2', 's2', 2, 8000),
    score('rank-score-3', 'rank-sub-3', 's3', 3, 7000),
  ];
  await repositories.results.finalizeRound({ matchId: 'm1', scores: ranking });
  assert.deepEqual((await repositories.scores.listByMatch('m1')).map(({ points }) => points), [9000, 8000, 7000]);

  await assert.rejects(() => repositories.results.finalizeRound({
    matchId: 'm1',
    scores: [score('new-score', 'rank-sub-1', 's1', 1, 1), score('new-score', 'rank-sub-2', 's2', 2, 1)],
  }), /UNIQUE/);
  assert.equal((await repositories.scores.listByMatch('m1')).length, 3);
});