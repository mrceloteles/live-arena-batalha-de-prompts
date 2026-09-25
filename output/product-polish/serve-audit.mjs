// Local product audit only: in-memory DB and deterministic judge, no Gemini.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';

const base = 'http://localhost:3100';
const password = 'auditoria-local-2026';
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const classicJudge = createFakeJudge();
const criteriaJudge = async ({ candidatePrompt, criteria }) => {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const words = candidatePrompt.trim().split(/\s+/u).length;
  const percent = Math.min(96, 60 + words);
  const breakdown = Object.fromEntries(criteria.map(({ criterion }, index) => [criterion, Math.max(0, Math.min(100, percent + (index % 2 ? -4 : 4)))]));
  return { percent, breakdown, feedback: 'Você definiu o objetivo com clareza. Na próxima missão, torne o formato e as restrições ainda mais específicos.', metadata: { provider: 'audit-test', model: 'deterministic-local' } };
};
const handler = createApplication({
  repositories,
  judge: classicJudge,
  classicJudge,
  criteriaJudge,
  judges: { mode: 'fake', classicJudge, criteriaJudge },
  adminPassword: password,
  adminSecret: 'auditoria-local-secret-not-for-production-2026',
  deployment: { env: {}, production: false, databasePath: ':memory:' },
});
const server = createServer(handler);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3100, '127.0.0.1', resolve); });
let adminCookie = '';
const post = async (action, payload = {}, admin = true) => {
  const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(admin && adminCookie ? { cookie: adminCookie } : {}) }, body: JSON.stringify(payload) });
  if (action === 'admin_login') adminCookie = response.headers.get('set-cookie')?.split(';')[0] || '';
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(`${action}: ${JSON.stringify(body)}`);
  return body;
};
await post('admin_login', { password });
await post('arena_set_open', { open: true });
const { room } = await post('arena_create_room', { title: 'Batalha de Prompts · Turma Criativa', preset: 'personalizado', expected_players: 30 });
const criteria = [{ criterion: 'objetivo', weight: 40 }, { criterion: 'formato', weight: 30 }, { criterion: 'restricoes', weight: 30 }];
const definitions = [
  { title: 'Engenharia reversa da referência', modality: 'precisao', mission: 'Escreva o prompt que poderia gerar esta referência visual.', context: 'Observe a composição, as cores e os elementos da imagem.', reference_text: 'Uma composição ilustrada com pessoas reunidas, formas geométricas, fundo limpo e cores contrastantes.', reference_image: '/public/assets/figma/prompt-sample.png', expected_result: 'Um prompt visual claro que descreva a composição, os elementos principais, as cores e o estilo.', criteria, duration_seconds: 600, attempts: 1, speed_weight: 'none', category: 'Imagem' },
  { title: 'Uma ideia, instruções precisas', modality: 'precisao', mission: 'Crie um prompt para divulgar a feira de tecnologia da escola.', context: 'A feira acontece na sexta-feira, das 14h às 18h, no pátio da escola. A entrada é gratuita.', reference_text: 'Escreva uma divulgação para estudantes do ensino médio sobre a feira de tecnologia, sexta-feira das 14h às 18h no pátio da escola. Use até 80 palavras, título chamativo e convite final. Não invente atrações.', expected_result: 'Um prompt com público, objetivo, formato e restrições explícitos.', criteria, duration_seconds: 600, attempts: 1, speed_weight: 'none', category: 'Texto' },
];
const challenges = [];
for (const definition of definitions) {
  const { challenge } = await post('arena_save_challenge', definition);
  challenges.push(challenge);
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: room.id });
const participants = [];
for (const name of ['Ana Martins', 'Bruno Costa', 'Clara Souza']) {
  const joined = await post('arena_join', { code: room.code, name }, false);
  participants.push({ name, participant_id: joined.participant.id, token: joined.token });
}
const detail = await post('arena_room_detail', { room_id: room.id });
const fixture = { isolated: true, database: ':memory:', judge: 'deterministic-local', base, admin: { password, cookie: adminCookie }, room: { id: room.id, code: room.code, pin: room.pin, title: room.title }, challenges: challenges.map(({ id, title }) => ({ id, title })), rounds: detail.detail.rounds.map(({ id, position }) => ({ id, position })), participants, urls: { admin: `${base}/admin-arena.php`, student: `${base}/play?pin=${room.code}`, preview: `${base}/aluno-preview.php?room=${room.id}`, tvPreview: `${base}/tv-preview.php?room=${room.id}` } };
mkdirSync(fileURLToPath(new URL('.', import.meta.url)), { recursive: true });
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2));
// Keep only the seeded audit actors online; their answers remain untouched.
const heartbeat = setInterval(() => { for (const participant of participants) post('arena_lobby', participant, false).catch(() => {}); }, 10000);
console.log(JSON.stringify({ ready: true, base, room: fixture.room, password, fixture: fileURLToPath(new URL('./fixture.json', import.meta.url)) }));
const close = () => { clearInterval(heartbeat); server.closeAllConnections(); server.close(() => { opened.close(); process.exit(0); }); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
