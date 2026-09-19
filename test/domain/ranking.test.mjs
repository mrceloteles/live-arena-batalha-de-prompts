import assert from 'node:assert/strict';
import test from 'node:test';

import { rankFinal, rankRound } from '../../src/domain/ranking.mjs';

test('round ranking sorts by points, then percent, then lower elapsed time', () => {
  const rows = [
    { station_id: 3, points: 100, percent: 80, elapsed_seconds: 30 },
    { station_id: 1, points: 200, percent: 70, elapsed_seconds: 55 },
    { station_id: 2, points: 200, percent: 80, elapsed_seconds: 59 },
    { station_id: 4, points: 200, percent: 80, elapsed_seconds: 31 },
  ];

  assert.deepEqual(rankRound(rows).map(({ station_id, position }) => ({ station_id, position })), [
    { station_id: 4, position: 1 },
    { station_id: 2, position: 2 },
    { station_id: 1, position: 3 },
    { station_id: 3, position: 4 },
  ]);
  assert.deepEqual(rows.map((row) => row.station_id), [3, 1, 2, 4]);
});

test('round ties share a position and receive a deterministic station-id order', () => {
  const rows = [
    { station_id: 3, points: 500, percent: 90, elapsed_seconds: 10 },
    { station_id: 1, points: 500, percent: 90, elapsed_seconds: 10 },
    { station_id: 2, points: 400, percent: 100, elapsed_seconds: 1 },
  ];
  assert.deepEqual(rankRound(rows).map(({ station_id, position }) => ({ station_id, position })), [
    { station_id: 1, position: 1 },
    { station_id: 3, position: 1 },
    { station_id: 2, position: 3 },
  ]);
});

test('final ranking prioritizes total points, average percent, then lower total time', () => {
  const rows = [
    { station_id: 1, total_points: 2_000, avg_percent: 80, wins: 1, total_time: 130 },
    { station_id: 2, total_points: 2_000, avg_percent: 85, wins: 0, total_time: 180 },
    { station_id: 3, total_points: 2_000, avg_percent: 85, wins: 2, total_time: 240 },
    { station_id: 4, total_points: 2_000, avg_percent: 85, wins: 2, total_time: 120 },
  ];
  assert.deepEqual(rankFinal(rows).map(({ station_id, position }) => ({ station_id, position })), [
    { station_id: 4, position: 1 },
    { station_id: 2, position: 2 },
    { station_id: 3, position: 3 },
    { station_id: 1, position: 4 },
  ]);
});

test('final ties ignore wins, share a position, and invalid numeric values are rejected', () => {
  const tied = [
    { station_id: 2, total_points: 2_000, avg_percent: 80, wins: 99, total_time: 120 },
    { station_id: 1, total_points: 2_000, avg_percent: 80, wins: 0, total_time: 120 },
  ];
  assert.deepEqual(rankFinal(tied).map(({ station_id, position }) => ({ station_id, position })), [
    { station_id: 1, position: 1 },
    { station_id: 2, position: 1 },
  ]);
  assert.throws(() => rankRound([{ station_id: 1, points: -1, percent: 0, elapsed_seconds: 0 }]), /points/i);
  assert.throws(() => rankFinal([{ station_id: 1, total_points: 1, avg_percent: 101, wins: 0, total_time: 0 }]), /avg_percent/i);
});
