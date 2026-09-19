import assert from 'node:assert/strict';
import test from 'node:test';
import { wrapRemoteDatabase } from '../../src/db/database.mjs';

test('remote adapter awaits the transaction and commits or rolls back on its stream', async () => {
  const events = [];
  const tx = {
    async execute(query) { events.push(typeof query === 'string' ? query : query.sql); return { rowsAffected: 1 }; },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    close() { events.push('close'); },
  };
  const db = wrapRemoteDatabase({ async transaction() { events.push('begin'); return tx; } });
  await db.transaction(async (connection) => connection.prepare('INSERT').run());
  assert.deepEqual(events, ['begin', 'PRAGMA foreign_keys = ON', 'INSERT', 'commit', 'close']);
  events.length = 0;
  await assert.rejects(db.transaction(async () => { throw new Error('write failed'); }), /write failed/);
  assert.deepEqual(events, ['begin', 'PRAGMA foreign_keys = ON', 'rollback', 'close']);
});
