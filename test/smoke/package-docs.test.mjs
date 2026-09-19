import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('delivery documents declare runtime, provenance, limits and preserved base', async () => {
  const [readme, audit, notice] = await Promise.all([
    read('README.md'),
    read('AUDIT.md'),
    read('LICENSE-NOTICE.md'),
  ]);

  assert.match(readme, /Node\.js 24/);
  assert.match(readme, /base-original-v1/);
  assert.match(audit, /captura literal/);
  assert.match(audit, /implementa[cç][aã]o equivalente/i);
  assert.match(audit, /n[aã]o existe base\s+t[eé]cnica para afirmar c[oó]pia literal/i);
  assert.match(audit, /base-original-v1/);
  assert.match(notice, /n[aã]o concede licen[cç]a/i);
});

test('environment example contains no populated secrets and local env is ignored', async () => {
  const [example, ignore] = await Promise.all([
    read('.env.example'),
    read('.gitignore'),
  ]);

  for (const name of ['GEMINI_API_KEY', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET']) {
    assert.match(example, new RegExp(`^${name}=$`, 'm'));
  }
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^!\.env\.example$/m);
  assert.match(ignore, /^\*\.sqlite$/m);
});
