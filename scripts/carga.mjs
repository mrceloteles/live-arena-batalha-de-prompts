#!/usr/bin/env node
// Carga sintética com JUIZ STUB — a medição que dá para fazer sem gastar cota.
//
//   node scripts/carga.mjs                (35 alunos, 3 missões, latência do stub 120 ms)
//   node scripts/carga.mjs --alunos 50 --missoes 12 --latencia 300
//
// O que ele mede, e por que assim:
//   - latência p50/p95 do ENVIO do aluno, que é o que a turma sente;
//   - quantos envios responderam "pendente" (a avaliação continuou) em vez de
//     esperar o provedor;
//   - quantas avaliações o PROVIDER recebeu (aqui é o stub que conta) — é a
//     medida do custo, e ela tem de ser uma por submissão, nunca duas;
//   - conexões de tempo real abertas ao mesmo tempo;
//   - bytes da resposta do lobby (a leitura mais frequente da aula).
//
// O stub NÃO é o provedor: ele mede o desenho (fila, teto, resposta) e não a
// latência do Gemini. As metas de latência/bytes contra o provedor real e contra
// a hospedagem continuam exigindo uma execução em homologação.
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJudgeBudget } from '../src/judge/budget.mjs';
import { createFakeJudge } from '../src/judge/fake-judge.mjs';
import { bootstrap } from '../src/server/start.mjs';

const argumento = (nome, padrao) => {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? Number(process.argv[indice + 1]) : padrao;
};

const ALUNOS = argumento('alunos', 35);
const MISSOES = argumento('missoes', 3);
const LATENCIA = argumento('latencia', 120);
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentil(valores, fração) {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.floor(ordenados.length * fração));
  return Math.round(ordenados[indice]);
}

const diretorio = mkdtempSync(join(tmpdir(), 'carga-'));
const databasePath = join(diretorio, 'carga.sqlite');
const budget = createJudgeBudget({ maxConcurrent: 4, perHour: 400, maxQueued: 64 });
let chamadasAoProvedor = 0;
const stub = async () => {
  chamadasAoProvedor += 1;
  if (LATENCIA > 0) await dormir(LATENCIA);
  return { percent: 75, breakdown: { objetivo: 12 }, feedback: 'Nota do stub.', metadata: { provider: 'stub', model: 'stub-carga-v1' } };
};

const app = await bootstrap({
  databasePath,
  env: {
    NODE_ENV: 'development',
    JUDGE_MODE: 'gemini',
    ADMIN_PASSWORD: 'carga-senha',
    ADMIN_SECRET: 'carga-segredo-com-32-caracteres-ok',
  },
  // O stub entra POR DENTRO do teto, como na produção: sem isso o arnês mediria
  // 35 avaliações simultâneas e chamaria isso de resultado.
  createJudgeSet: () => ({
    mode: 'gemini',
    budget,
    classicJudge: createFakeJudge(),
    criteriaJudge: (input) => budget.run(() => stub(input)),
  }),
  logWriter: () => {},
});
const server = createServer(app.handler);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const login = await fetch(`${base}/api.php?action=admin_login`, {
  method: 'POST', body: JSON.stringify({ password: 'carga-senha' }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = async (action, payload = {}) => {
  const resposta = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const corpo = await resposta.json();
  if (resposta.status !== 200) throw new Error(`${action}: ${resposta.status} ${JSON.stringify(corpo)}`);
  return corpo;
};

console.log(`carga: ${ALUNOS} alunos · ${MISSOES} missões · stub de ${LATENCIA} ms · teto ${JSON.stringify(budget.limits)}`);
await post('arena_set_open', { open: true });
const { room } = await post('arena_create_room', { title: 'Turma de carga', expected_players: ALUNOS });
for (let indice = 0; indice < MISSOES; indice += 1) {
  const { challenge } = await post('arena_save_challenge', {
    title: `Missão ${indice + 1}`, modality: 'precisao', mission: 'Crie um cartaz para a feira de ciências.',
    criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
    reference_text: 'Cartaz A3 com data, local e contato.',
  });
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: room.id });

const turma = [];
for (let indice = 0; indice < ALUNOS; indice += 1) {
  const entrar = await fetch(`${base}/api.php?action=arena_join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: room.code, name: `Aluno ${indice + 1}` }),
  });
  const corpo = await entrar.json();
  if (entrar.status !== 200) throw new Error(`arena_join: ${entrar.status} ${JSON.stringify(corpo)}`);
  turma.push({ participant_id: corpo.participant.id, token: corpo.token });
}

// Conexões de tempo real abertas, como as telas de verdade.
const streams = [];
for (let indice = 0; indice < ALUNOS; indice += 1) {
  const aluno = turma[indice];
  const url = `${base}/events?room=${encodeURIComponent(room.id)}&participant_id=${aluno.participant_id}&token=${aluno.token}`;
  streams.push(await fetch(url).then((resposta) => ({ status: resposta.status, corpo: resposta.body })).catch(() => ({ status: 0 })));
}
const streamsAbertos = streams.filter((stream) => stream.status === 200).length;

await post('arena_start_round', { room_id: room.id });
const detalhe = (await post('arena_room_detail', { room_id: room.id })).detail;
const rodada = detalhe.rounds.find((entrada) => entrada.status === 'open');
const respostaLobby = await fetch(`${base}/api.php?action=arena_lobby`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(turma[0]),
});
const bytesLobby = (await respostaLobby.text()).length;

// Todos enviam no mesmo instante: é o pico de verdade de uma aula.
const latencias = [];
const envios = turma.map(async (aluno, indice) => {
  const inicio = Date.now();
  const resposta = await fetch(`${base}/api.php?action=arena_submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      participant_id: aluno.participant_id, token: aluno.token, round_id: rodada.id,
      prompt: `Cartaz A3 da feira de ciências, aluno ${indice + 1}, com data, local e contato.`, attempt: 1,
    }),
  });
  const corpo = await resposta.json();
  latencias.push(Date.now() - inicio);
  return { status: resposta.status, pendente: corpo.pending === true, ok: corpo.ok === true };
});
const resultados = await Promise.all(envios);

// A nota de quem ficou pendente chega depois: espera o estado convergir.
const esperarConclusao = async (limiteMs = 30_000) => {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    const scores = (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0];
    if (Number(scores.scored) >= ALUNOS) return Number(scores.scored);
    await dormir(250);
  }
  return Number((await post('arena_room_detail', { room_id: room.id })).detail.rounds[0].scored);
};

const inicioConclusao = Date.now();
const avaliados = await esperarConclusao();
const conclusaoMs = Date.now() - inicioConclusao;

const falhas = resultados.filter((resultado) => !resultado.ok);
if (falhas.length || avaliados < ALUNOS) process.exitCode = 1;
console.log(JSON.stringify({
  alunos: ALUNOS,
  missoes: MISSOES,
  latencia_stub_ms: LATENCIA,
  envios: resultados.length,
  pendentes: resultados.filter((resultado) => resultado.pendente).length,
  falhas: falhas.length,
  status: [...new Set(resultados.map((resultado) => resultado.status))],
  envio_p50_ms: percentil(latencias, 0.5),
  envio_p95_ms: percentil(latencias, 0.95),
  envio_max_ms: Math.max(...latencias),
  conclusao_das_notas_ms: conclusaoMs,
  notas_gravadas: avaliados,
  chamadas_ao_provedor: chamadasAoProvedor,
  chamadas_por_submissao: Number((chamadasAoProvedor / ALUNOS).toFixed(2)),
  streams_abertos: streamsAbertos,
  bytes_lobby: bytesLobby,
  teto_depois: budget.state(),
}, null, 2));

for (const stream of streams) stream.corpo?.cancel?.().catch?.(() => {});
server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
app.opened.close();
rmSync(diretorio, { recursive: true, force: true });
