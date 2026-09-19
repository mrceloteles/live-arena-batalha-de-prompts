import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const matrix = JSON.parse(fs.readFileSync(new URL('../../research/fidelity-matrix.json', import.meta.url), 'utf8'));
const requiredAreas = [
  'routes-pages','public-assets','api-contract','registration','heartbeat-sync','state-machine','timing','submission',
  'gemini-judge','fallback','retries','scoring','round-ranking','final-ranking','tie-break','reload-reconnect','timeout',
  'messages-modals','main-screen','player-screen','admin-observable','failure-recovery',
];

test('fidelity matrix covers every required classic area', () => {
  assert.deepEqual([...new Set(matrix.items.map((x) => x.area))].sort(), [...requiredAreas].sort());
});

test('every matrix item has auditable evidence and a valid status', () => {
  for (const item of matrix.items) {
    assert.ok(['IDENTICAL','EQUIVALENT','INFERRED','UNKNOWN'].includes(item.status));
    for (const key of ['behavior','referenceEvidence','implementationEvidence','test','knownDifference','decision']) {
      assert.equal(typeof item[key], 'string');
    }
  }
});
