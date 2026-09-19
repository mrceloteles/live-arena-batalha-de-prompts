import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createFallbackSafeCriteriaJudge } from '../../src/judge/criteria-judge.mjs';

let opened, repositories, arenaDispatch, clock, sequence, adminToken;
beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1_000_000;
  sequence = 0;
  const adminAuth = createAdminAuth({
    password: 'senha-segura-123', secret: 'segredo-muito-longo-para-teste-123456',
    now: () => clock,
  });
  adminToken = adminAuth.login('senha-segura-123').token;
  arenaDispatch = createArenaApi({
    repositories,
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
  });
});
afterEach(() => opened.close());

const admin = () => ({ admin_token: adminToken });
const api = (action, payload = {}, meta = {}) => arenaDispatch(action, payload, meta);

const CRITERIA = [
  { criterion: 'objetivo', weight: 30 },
  { criterion: 'contexto', weight: 25 },
  { criterion: 'publico', weight: 20 },
  { criterion: 'formato', weight: 15 },
  { criterion: 'restricoes', weight: 10 },
];

const REFERENCE = 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato, linguagem chamativa para adolescentes.';

/**
 * Sala do modo Arena com uma missão publicada e `players` alunos dentro.
 * Devolve o detalhe do professor junto: os testes leem o estado do modo dali.
 */
async function setupArenaRoom({ players = 10, arena = {}, missions = 1 } = {}) {
  await api('arena_set_open', { ...admin(), open: true });
  const created = await api('arena_create_room', {
    ...admin(), title: 'Turma Arena', preset: 'arena', expected_players: 40,
    arena_rounds: 3, arena_boss_health: 5, arena_damage_threshold: 60,
    arena_attacks_per_round: 2, ...arena,
  });
  const room = created.room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Cartaz da feira', modality: 'precisao',
    mission: 'Crie um cartaz para a feira de tecnologia.',
    context: 'Feira anual do ensino medio.',
    criteria: CRITERIA, duration_seconds: 300, speed_weight: 'none',
    reference_text: REFERENCE,
  })).challenge;
  for (let index = 0; index < missions; index += 1) {
    await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  }
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  const roster = [];
  for (let index = 0; index < players; index += 1) {
    const joined = await api('arena_join', { code: room.pin || room.code, name: `Aluno ${index + 1}` });
    roster.push({ ...joined.participant, token: joined.token });
  }
  return { roomId: room.id, challenge, roster };
}

/** Fecha a missão com todo mundo respondendo, como numa aula de verdade. */
async function openAndSubmit(roomId, roster, prompts) {
  const detail = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  const open = detail.rounds.find((round) => round.status === 'pending');
  await api('arena_start_round', { ...admin(), room_id: roomId });
  const after = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  const roundId = after.rounds.find((round) => round.status === 'open').id;
  for (const [index, participant] of roster.entries()) {
    await api('arena_submit', {
      participant_id: participant.id, token: participant.token, round_id: roundId,
      prompt: prompts(index),
    });
  }
  await api('arena_end_round', { ...admin(), room_id: roomId });
  return roundId;
}

const detail = async (roomId) => (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;

test('a sala do preset arena nasce no modo e carrega a configuração do professor', async () => {
  const { roomId } = await setupArenaRoom({ arena: { arena_boss_health: 3, arena_damage_threshold: 75 } });
  const view = (await detail(roomId)).arena;
  assert.equal(view.enabled, true);
  assert.equal(view.phase, 'mission');
  assert.equal(view.boss.health, 3);
  assert.equal(view.boss.max_health, 3);
  assert.equal(view.threshold, 75);
  assert.equal(view.rounds, 3);
  assert.equal(view.energy.value, 0);
  assert.deepEqual(view.energy.unlocked, []);
  assert.equal(view.competitors.length, 0);
});

test('sala fora do modo Arena não tem camada coletiva nenhuma', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma', expected_players: 5 })).room;
  const view = (await detail(room.id)).arena;
  assert.equal(view.enabled, false);
  await assert.rejects(
    api('arena_mode_draw', { ...admin(), room_id: room.id }),
    (error) => error.status === 409,
  );
});

test('rodada completa: wild card escolhe a terceira vaga e a turma acerta a previsão', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 12 });
  const roundId = await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);

  // 1. sorteio: rodada 1 tem 2 sorteados + 1 Wild Card
  await api('arena_mode_draw', { ...admin(), room_id: roomId });
  let view = (await detail(roomId)).arena;
  assert.equal(view.phase, 'wildcard');
  assert.equal(view.competitors.length, 2);
  assert.equal(view.wildcard.options.length, 3);
  assert.equal(view.wildcard.votes, 0);
  // Os prompts do Wild Card chegam sem autor: o voto não pode virar popularidade.
  assert.ok(view.wildcard.options.every((option) => !('name' in option)));

  // 2. o aluno vota (e pode trocar o voto)
  const voter = roster[0];
  const firstKey = view.wildcard.options[1].key;
  const voterIsInWildcard = view.wildcard.options.some((option) => option.participant_id === String(voter.id));
  if (!voterIsInWildcard) {
    await api('arena_mode_vote', { participant_id: voter.id, token: voter.token, choice: firstKey });
    await api('arena_mode_vote', { participant_id: voter.id, token: voter.token, choice: view.wildcard.options[0].key });
    view = (await detail(roomId)).arena;
    assert.equal(view.wildcard.votes, 1);
  }

  // 3. fecha o Wild Card: a Arena tem 3 competidores e a fase vira Arena
  await api('arena_mode_wildcard_close', { ...admin(), room_id: roomId });
  view = (await detail(roomId)).arena;
  assert.equal(view.phase, 'arena');
  assert.equal(view.competitors.length, 3);
  assert.equal(view.wildcard.revealed, true);
  assert.ok(view.wildcard.winner);

  // 4. o desafio da turma abre com a resposta certa que o próprio Juiz definiu
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'prever', duration_seconds: 60 });
  view = (await detail(roomId)).arena;
  assert.equal(view.phase, 'dynamic');
  assert.equal(view.dynamic.key, 'prever');
  assert.equal(view.dynamic.options.length, 3);
  assert.ok(view.dynamic.result === null, 'a resposta certa não aparece antes da revelação');
  const correctKey = view.dynamic.options[0].key;

  // ...mas o teste precisa da resposta certa para votar certo: ela vem do estado.
  const stored = await repositories.settings.get(`arena.mode.${roomId}`);
  assert.ok(stored.dynamic.correct, 'o servidor guarda a resposta certa para corrigir depois');

  // 5. a turma vota: 100% de acerto -> dano no Boss
  for (const participant of roster) {
    if (String(participant.id) === String(stored.dynamic.correct)) continue;
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token, choice: stored.dynamic.correct,
    });
  }
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  view = (await detail(roomId)).arena;
  assert.equal(view.phase, 'reveal');
  assert.equal(view.boss.health, 4);
  assert.equal(view.dynamic.result.damaged, true);
  assert.equal(view.dynamic.result.accuracy, 100);
  assert.ok(view.energy.value > 0, 'participação alimenta a energia da turma');
  assert.equal(correctKey, view.dynamic.options[0].key);
  assert.equal(view.attacks_left, 1);
});

test('a turma errada não fere o Boss e o corte de 60% vale exatamente em 60%', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 10 });
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'prever' });
  const stored = await repositories.settings.get(`arena.mode.${roomId}`);
  const correct = stored.dynamic.correct;
  const wrong = stored.dynamic.options.find((option) => option.key !== correct).key;

  // 6 de 10 acertam -> 60% exatos -> dano
  for (const [index, participant] of roster.entries()) {
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token,
      choice: index < 6 ? correct : wrong,
    });
  }
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  let view = (await detail(roomId)).arena;
  assert.equal(view.dynamic.result.accuracy, 60);
  assert.equal(view.dynamic.result.damaged, true);
  assert.equal(view.dynamic.result.needed, 6);
  assert.equal(view.boss.health, 4);

  // 5 de 10 no segundo ataque -> 50% -> o Boss resiste
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'cacada' });
  const second = await repositories.settings.get(`arena.mode.${roomId}`);
  for (const [index, participant] of roster.entries()) {
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token,
      choice: index < 5 ? second.dynamic.correct : second.dynamic.options.find((option) => option.key !== second.dynamic.correct).key,
    });
  }
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  view = (await detail(roomId)).arena;
  assert.equal(view.dynamic.result.accuracy, 50);
  assert.equal(view.dynamic.result.damaged, false);
  assert.equal(view.boss.health, 4, 'o Boss mantém o coração');
  assert.equal(view.boss.last_accuracy, 50, 'o último ataque foi o de 50%');
  assert.equal(view.boss.last_damage, 0);
  assert.deepEqual(view.attacks.map((attack) => [attack.accuracy, attack.damaged]), [[60, true], [50, false]]);
});

test('a rodada tem teto de ataques e a calibração não tira coração', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 6, arena: { arena_attacks_per_round: 1 } });
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'prever' });
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  await assert.rejects(
    api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'cacada' }),
    (error) => error.status === 409,
  );
  // Calibração é métrica individual: registra o voto e a confiança, sem dano.
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'calibracao' });
  const stored = await repositories.settings.get(`arena.mode.${roomId}`);
  assert.equal(stored.dynamic.key, 'calibracao');
  for (const participant of roster) {
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token,
      choice: stored.dynamic.correct, confidence: 'alta',
    });
  }
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  const view = (await detail(roomId)).arena;
  assert.equal(view.boss.health, 5);
  assert.equal(view.dynamic.result.damaged, false);
  assert.equal(view.dynamic.result.accuracy, 100);
  assert.ok(view.audience.some((entry) => entry.calibration > 0), 'a calibração é medida por aluno');
});

test('energia desbloqueia poderes e cada poder só é usado uma vez', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 20 });
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'prever' });
  const stored = await repositories.settings.get(`arena.mode.${roomId}`);
  for (const participant of roster) {
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token, choice: stored.dynamic.correct,
    });
  }
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  let view = (await detail(roomId)).arena;
  assert.ok(view.energy.value >= 6, '20 respostas + dano rendem energia de sobra');
  assert.ok(view.energy.unlocked.includes('pista'));

  const used = await api('arena_mode_power', { ...admin(), room_id: roomId, power: 'pista' });
  assert.match(used.note, /Juiz desta missão pesa mais/);
  view = (await detail(roomId)).arena;
  assert.ok(view.energy.used.includes('pista'));
  assert.equal(view.power_notes.length, 1);
  // Poder bloqueado e poder repetido recusam com motivo.
  await assert.rejects(
    api('arena_mode_power', { ...admin(), room_id: roomId, power: 'pista' }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    api('arena_mode_power', { ...admin(), room_id: roomId, power: 'regra' }),
    (error) => error.status === 409,
  );
});

test('fechar a rodada devolve a turma ao balaio e a rotação prioriza quem não competiu', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 9, missions: 2 });
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  let view = (await detail(roomId)).arena;
  const firstCompetitors = view.competitors.map((entry) => entry.id);

  await api('arena_mode_next', { ...admin(), room_id: roomId });
  view = (await detail(roomId)).arena;
  assert.equal(view.phase, 'mission');
  assert.equal(view.round, 2);
  assert.equal(view.competitors.length, 0, 'o balaio é limpo entre rodadas');
  assert.equal(view.history.length, 1);
  assert.deepEqual(
    view.participants.filter((entry) => entry.competed).map((entry) => entry.id).sort(),
    [...firstCompetitors].sort(),
  );

  // Rodada 2: todo mundo escreve de novo; quem já competiu não é sorteado antes dos novos.
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} segunda rodada ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  view = (await detail(roomId)).arena;
  const second = view.competitors.map((entry) => entry.id);
  assert.equal(second.length, 3);
  assert.equal(new Set(second).size, 3);
  assert.ok(second.every((id) => !firstCompetitors.includes(id)), 'quem ainda não competiu tem prioridade');
});

test('a partida termina quando o Boss cai e os prêmios reconhecem competências diferentes', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 12, arena: { arena_boss_health: 1 } });
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'prever' });
  const stored = await repositories.settings.get(`arena.mode.${roomId}`);
  for (const participant of roster) {
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token, choice: stored.dynamic.correct,
    });
  }
  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  let view = (await detail(roomId)).arena;
  assert.equal(view.boss.health, 0);
  assert.equal(view.boss.defeated, true);
  assert.equal(view.phase, 'finished', 'Boss zerado encerra a partida na hora');
  // O ultimo ataque ja E o fim: os premios precisam sair no mesmo passo, senao
  // a TV anuncia o veredito sem reconhecer ninguem e nao sobra botao para o
  // professor clicar.
  assert.ok(view.awards, 'o fim da partida sai com os prêmios no mesmo passo');
  assert.equal(view.awards.boss.defeated, true);
  assert.ok(view.awards.champion, 'quem escreveu melhor é o campeão da Arena');

  await api('arena_mode_next', { ...admin(), room_id: roomId });
  view = (await detail(roomId)).arena;
  assert.equal(view.phase, 'finished');
  assert.ok(view.awards, 'a partida encerrada tem prêmios');
  assert.equal(view.awards.boss.defeated, true);
  assert.match(view.awards.collective, /derrotou o Juiz/);
  assert.ok(view.awards.champion, 'quem escreveu melhor é o campeão da Arena');
  assert.ok(view.awards.audience.length > 0);
});

test('o voto da turma respeita janela, fase e admin', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 6 });
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  // Sem desafio aberto, não há o que votar.
  await assert.rejects(
    api('arena_mode_vote', { participant_id: roster[0].id, token: roster[0].token, choice: 'a' }),
    (error) => error.status === 409,
  );
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'comparacao' });
  const view = (await detail(roomId)).arena;
  assert.equal(view.dynamic.options.length, 2, 'a comparação usa dois prompts');
  await assert.rejects(
    api('arena_mode_vote', { participant_id: roster[0].id, token: roster[0].token, choice: 'nao-existe' }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    api('arena_mode_dynamic_close', { admin_token: 'invalido', room_id: roomId }),
    (error) => error.status === 401,
  );
});

/** Chega na fase de votação: sorteio sem Wild Card e um desafio coletivo aberto. */
async function abrirDesafioColetivo(roomId, roster) {
  await openAndSubmit(roomId, roster, (index) => `${REFERENCE} variacao ${index}`);
  await api('arena_mode_draw', { ...admin(), room_id: roomId, wildcard: false });
  const aberto = await api('arena_mode_dynamic_open', { ...admin(), room_id: roomId, dynamic: 'prever' });
  assert.equal(aberto.ok, true);
  return repositories.settings.get(`arena.mode.${roomId}`);
}

// A fila de escrita do estado coletivo tem de ser POR SALA. O voto do aluno
// entrava numa fila própria (`vote:<o que o payload dissesse>`) enquanto o
// estado gravado é o mesmo JSON da sala: dez votos disparados no mesmo tique
// cada um lia antes do outro gravar, e o último a gravar apagava os demais. Na
// tela não havia erro nenhum — só votos que sumiam do resultado.
test('votos simultâneos da mesma sala chegam todos ao estado', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 10 });
  const estado = await abrirDesafioColetivo(roomId, roster);
  const errado = estado.dynamic.options.find((option) => option.key !== estado.dynamic.correct).key;

  // Nenhum `await` entre os disparos: todos leem antes de qualquer um gravar.
  const respostas = await Promise.all(roster.map((participant, index) => api('arena_mode_vote', {
    participant_id: participant.id,
    token: participant.token,
    choice: index % 2 === 0 ? estado.dynamic.correct : errado,
  })));
  assert.equal(respostas.every((resposta) => resposta.ok), true);

  const depois = await repositories.settings.get(`arena.mode.${roomId}`);
  assert.equal(Object.keys(depois.dynamic.responses).length, roster.length, 'nenhum voto se perdeu');

  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  const view = (await detail(roomId)).arena;
  assert.equal(view.dynamic.result.total, roster.length, 'o resultado conta os dez votos');
});

// Fechar o desafio é uma decisão, e decisão repetida não pode valer duas vezes:
// o segundo pedido somava outro ataque no histórico, mais energia e outro
// coração do Boss. Dois cliques, duas abas do professor ou uma retentativa de
// rede mudavam o placar da turma por acidente.
test('fechar o mesmo desafio duas vezes não aplica efeito de novo', async () => {
  const { roomId, roster } = await setupArenaRoom({ players: 8 });
  const estado = await abrirDesafioColetivo(roomId, roster);
  for (const participant of roster) {
    await api('arena_mode_vote', {
      participant_id: participant.id, token: participant.token, choice: estado.dynamic.correct,
    });
  }

  await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  const primeiro = await repositories.settings.get(`arena.mode.${roomId}`);
  assert.equal(primeiro.boss.health, 4, 'a turma acertou tudo: um coração saiu');

  const segundo = await api('arena_mode_dynamic_close', { ...admin(), room_id: roomId });
  assert.equal(segundo.already_closed, true, 'o segundo fechamento é reconhecido, não repetido');

  const terceiro = await repositories.settings.get(`arena.mode.${roomId}`);
  assert.equal(terceiro.boss.health, primeiro.boss.health);
  assert.equal(terceiro.energy.value, primeiro.energy.value);
  assert.equal(terceiro.attacks.length, primeiro.attacks.length, 'o histórico tem um ataque, não dois');
  assert.deepEqual(terceiro.dynamic.result, primeiro.dynamic.result);
  assert.equal(terceiro.phase, primeiro.phase);
  const view = (await detail(roomId)).arena;
  assert.equal(view.attacks.length, 1);
});

test('a configuração do modo fica guardada e a sala excluída não deixa estado órfão', async () => {
  const { roomId } = await setupArenaRoom({ players: 4 });
  await api('arena_mode_configure', {
    ...admin(), room_id: roomId, boss_max_health: 4, damage_threshold: 70, powers: false,
  });
  let view = (await detail(roomId)).arena;
  assert.equal(view.boss.max_health, 4);
  assert.equal(view.threshold, 70);
  assert.equal(view.powers_enabled, false);
  assert.ok(await repositories.settings.get(`arena.mode.${roomId}`), 'a configuração fica guardada');

  await api('arena_delete_room', { ...admin(), room_id: roomId });
  assert.equal(await repositories.settings.get(`arena.mode.${roomId}`), undefined);
});
