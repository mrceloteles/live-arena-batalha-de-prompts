import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// Isolated visual QA fixtures: no production database or credentials.
const opened = openDatabase(':memory:', { url: '' });
await opened.migrate();
const repositories = createRepositories(opened.database);
const now = () => 10000;
await repositories.settings.set('arena.global_open', true, now());
const scenes = [
  { code: '460120', modality: 'resgate', title: 'Resgate: apresentação de IA', mission: 'Faça uma apresentação sobre inteligência artificial.', context: 'Este é o ponto de partida. Defina o público, o objetivo, o formato e o nível de detalhe para melhorar o resultado.' },
  { code: '460121', modality: 'reversa', title: 'Um olhar, muitas possibilidades', mission: 'Descreva a composição, a luz e os detalhes da imagem para orientar sua recriação.', context: 'Observe a referência com atenção e escreva uma instrução visual precisa.', image: '/public/assets/figma/manual-instructions-illustration.svg' },
  { code: '460122', modality: 'completo', title: 'Uma apresentação que explica de verdade', mission: 'Crie um prompt para uma apresentação de cinco slides sobre inteligência artificial.', context: 'A apresentação será usada por alunos do ensino médio. Considere exemplos do cotidiano e explique os limites da tecnologia.', duration: null },
];
for (const scene of scenes) {
  const room = await repositories.arena.rooms.create({ id: scene.code, code: scene.code, title: 'Oficina de prompts', status: 'playing', expectedPlayers: 12, now: now() });
  for (let position = 1; position <= 4; position++) {
    const challenge = await repositories.arena.challenges.save({ id: randomUUID(), title: scene.title, modality: scene.modality, mission: scene.mission, context: scene.context,
      referenceImage: scene.image || '', durationSeconds: scene.duration === null ? null : 180, attempts: 2,
      criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'clareza', weight: 50 }], now: now() });
    const round = await repositories.arena.rounds.add({ id: randomUUID(), roomId: room.id, position, challengeId: challenge.id, modality: scene.modality, now: now() });
    if (position === 1) await repositories.arena.rounds.updateStatus({ id: round.id, status: 'open', startedAt: now(), deadlineAt: scene.duration === null ? null : now() + 180, now: now() });
  }
}
const handler = createApplication({ repositories, judge: createFakeJudge(), now,
  arenaJudge: async () => ({ percent: 84, breakdown: { objetivo: 18, clareza: 16 }, feedback: 'O objetivo está claro. Especifique o formato da resposta e o público para tornar a instrução mais precisa.' }),
  adminPassword: randomUUID(), adminSecret: randomUUID() });
const server = createServer(handler);
server.listen(3147, '127.0.0.1', () => console.log('Preview da rodada: http://127.0.0.1:3147/play?pin=460120'));
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => { opened.close(); process.exit(); }); });

