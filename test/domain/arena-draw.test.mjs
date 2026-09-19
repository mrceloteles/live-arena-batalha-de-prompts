import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAW_GROUP_MAX, DRAW_GROUP_MIN,
  DrawError,
  clampDrawGroupSize,
  drawEligible,
  drawNext,
  drawView,
  effectiveDraw,
  emptyDraw,
  isDrawMode,
  nextGroupSize,
  normalizeDraw,
  sample,
  settleDraw,
  startDraw,
  syncDraw,
} from '../../src/domain/arena-draw.mjs';

const people = (...names) => names.map((name) => ({ id: name.toLowerCase(), name }));
const roster = (...names) => people(...names).map((entry) => entry.id);
const names = (participants) => participants.map((entry) => entry.id);

/** rng deterministico: devolve sempre o primeiro valor da fila. */
const seq = (values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

test('startDraw coloca a turma inteira no balaio e normaliza modo e tamanho', () => {
  const draw = startDraw(['a', 'b', 'c'], { mode: 'MATA-MATA', groupSize: 99 });
  assert.equal(draw.mode, 'mata-mata');
  assert.equal(draw.groupSize, DRAW_GROUP_MAX);
  assert.deepEqual(draw.pool, ['a', 'b', 'c']);
  assert.equal(draw.round, 1);
  assert.equal(draw.current, null);
  assert.deepEqual(draw.results, []);
  assert.equal(draw.champion, null);
  assert.equal(emptyDraw({ groupSize: 1 }).groupSize, DRAW_GROUP_MIN);
  assert.equal(clampDrawGroupSize('3.6'), 4);
  assert.equal(clampDrawGroupSize('nada'), 3);
  assert.equal(isDrawMode('livre'), true);
  assert.equal(isDrawMode('LIVRE'), true);
  assert.equal(isDrawMode('outro'), false);
});

test('sorteio livre: o vencedor continua concorrendo e a turma toda segue elegivel', () => {
  let draw = startDraw(roster('Ana', 'Bia', 'Caio', 'Duda'), { mode: 'livre', groupSize: 2 });
  draw = drawNext(draw, roster('Ana', 'Bia', 'Caio', 'Duda'), { rng: seq([0, 0]), at: 10 });
  assert.deepEqual(draw.current.ids, ['ana', 'bia']);
  assert.equal(draw.current.at, 10);

  draw = settleDraw(draw, 'ana', { at: 20 });
  assert.deepEqual(draw.eliminated, []);
  assert.equal(draw.results.length, 1);
  assert.equal(draw.results[0].winner_id, 'ana');
  assert.equal(draw.champion, null);

  // O pool nao muda no livre: todos continuam elegiveis, inclusive a campea.
  const eligible = drawEligible(draw, roster('Ana', 'Bia', 'Caio', 'Duda'));
  assert.deepEqual(eligible, ['ana', 'bia', 'caio', 'duda']);

  draw = drawNext(draw, roster('Ana', 'Bia', 'Caio', 'Duda'), { rng: seq([0]), at: 30 });
  assert.deepEqual(draw.current.ids, ['ana', 'bia']);
});

test('mata-mata: quem perde sai e quem vence so volta contra outros vencedores', () => {
  const all = roster('Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabio');
  let draw = startDraw(all, { mode: 'mata-mata', groupSize: 3 });

  // Rodada 1, grupo 1: Ana, Bia, Caio -> Ana vence.
  draw = drawNext(draw, all, { rng: seq([0, 0, 0]), at: 1 });
  assert.deepEqual(draw.current.ids.slice().sort(), ['ana', 'bia', 'caio']);
  draw = settleDraw(draw, 'ana', { at: 2 });

  // Rodada 1, grupo 2: Duda, Eva, Fabio -> Duda vence. O pool esvazia e a
  // rodada 2 nasce so com os vencedores.
  draw = drawNext(draw, all, { rng: seq([0, 0, 0]), at: 3 });
  assert.deepEqual(draw.current.ids.slice().sort(), ['duda', 'eva', 'fabio']);
  draw = settleDraw(draw, 'duda', { at: 4 });

  assert.equal(draw.round, 2);
  assert.deepEqual(draw.pool.slice().sort(), ['ana', 'duda']);
  assert.deepEqual(draw.eliminated.slice().sort(), ['bia', 'caio', 'eva', 'fabio']);
  assert.deepEqual(drawEligible(draw, all), ['ana', 'duda']);

  // Final: o ultimo vencedor e o campeao.
  draw = drawNext(draw, all, { rng: seq([0]), at: 5 });
  draw = settleDraw(draw, 'duda', { at: 6 });
  assert.equal(draw.champion, 'duda');
  assert.throws(() => drawNext(draw, all), (error) => error instanceof DrawError && /já terminou/.test(error.message));
});

test('nextGroupSize encolhe so no mata-mata e nunca abaixo do minimo', () => {
  assert.equal(nextGroupSize({ mode: 'livre', groupSize: 3 }, 4), 3, 'no livre ninguem sai do balaio: nao ha o que encolher');
  assert.equal(nextGroupSize({ mode: 'mata-mata', groupSize: 3 }, 4), 2);
  assert.equal(nextGroupSize({ mode: 'mata-mata', groupSize: 3 }, 6), 3);
  assert.equal(nextGroupSize({ mode: 'mata-mata', groupSize: 2 }, 3), 2, 'grupo de 2 nao encolhe mais');
  assert.equal(nextGroupSize({ mode: 'mata-mata', groupSize: 3 }, 1), 1);
  assert.equal(nextGroupSize({ mode: 'mata-mata', groupSize: 3 }, 0), 0);
  assert.equal(nextGroupSize({ mode: 'livre', groupSize: 3 }, 2), 2);
});

test('mata-mata nunca deixa 1 sozinho quando o grupo pode encolher', () => {
  const all = roster('Ana', 'Bia', 'Caio', 'Duda');
  let draw = startDraw(all, { mode: 'mata-mata', groupSize: 3 });
  // 4 na sala: o grupo cai para 2 (3 + 1 sobraria sozinho).
  draw = drawNext(draw, all, { rng: seq([0, 0]), at: 1 });
  assert.equal(draw.current.ids.length, 2);
  draw = settleDraw(draw, draw.current.ids[0], { at: 2 });
  assert.equal(draw.pool.length, 2);
  assert.equal(draw.results.length, 1);
});

test('mata-mata com grupo de 2 e turma impar: quem sobra passa direto, sem disputa', () => {
  const all = roster('Ana', 'Bia', 'Caio', 'Duda', 'Eva');
  let draw = startDraw(all, { mode: 'mata-mata', groupSize: 2 });
  for (const round of [0, 1]) {
    draw = drawNext(draw, all, { rng: seq([0, 0]), at: round });
    draw = settleDraw(draw, draw.current.ids[0], { at: round });
  }
  // Sobrou 1 no pool: o sorteio seguinte registra o passe direto e abre a rodada 2
  // ja com o grupo da vez sorteado so entre os 3 que seguiram.
  draw = drawNext(draw, all, { rng: seq([0]), at: 9 });
  assert.equal(draw.round, 2);
  assert.equal(draw.results.filter((result) => result.bye).length, 1);
  assert.deepEqual(draw.eliminated.slice().sort(), ['bia', 'duda']);
  assert.equal(draw.current.ids.length, 2);
  assert.equal(draw.pool.length, 1);
  assert.equal(draw.champion, null);
});

test('sobrar no pool com um grupo aberto nao e passe direto: quem sobrou ainda nao jogou', () => {
  const all = roster('Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabio');
  let draw = startDraw(all, { mode: 'mata-mata', groupSize: 2 });
  for (let grupo = 0; grupo < 3; grupo += 1) {
    draw = drawNext(draw, all, { rng: seq([0, 0]), at: 1 });
    draw = settleDraw(draw, draw.current.ids[0], { at: 1 });
  }
  assert.equal(draw.round, 2);
  // Rodada 2 com 3 vencedores e grupos de 2: dois jogam, um espera a vez.
  draw = drawNext(draw, all, { rng: seq([0, 0]), at: 1 });
  const esperando = draw.pool.slice();
  assert.equal(esperando.length, 1);
  const stored = effectiveDraw(draw, all, 1);
  assert.deepEqual(stored.pool, esperando, 'quem espera a vez continua no pool, sem passe direto');
  assert.deepEqual(stored.next, [], 'e nao entrou na proxima rodada antes de o grupo fechar');
  assert.equal(stored.results.filter((result) => result.bye).length, 0);
  // Fechado o grupo, aí sim o que sobrou passa direto para a rodada seguinte.
  const settled = settleDraw(stored, stored.current.ids[0], { at: 2 });
  const view = drawView(settled, people('Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabio'));
  // O passe direto nasce na leitura (o estado guarda so o que foi disputado).
  assert.equal(view.history.filter((entry) => entry.bye).length, 1);
  assert.equal(view.round, 3);
  assert.equal(view.counts.eligible, 2, 'a rodada 3 junta o vencedor e quem passou direto');
  assert.ok(view.eligible.some((entry) => entry.id === esperando[0]));
});

test('sortear de novo substitui o grupo e devolve os ids ao balaio', () => {
  const all = roster('Ana', 'Bia', 'Caio', 'Duda');
  let draw = startDraw(all, { mode: 'mata-mata', groupSize: 2 });
  draw = drawNext(draw, all, { rng: seq([0, 0]), at: 1 });
  const first = [...draw.current.ids];
  assert.deepEqual(draw.pool.slice().sort(), all.filter((id) => !first.includes(id)).sort());

  draw = drawNext(draw, all, { rng: seq([0.99, 0.99]), at: 2 });
  assert.equal(draw.pool.length, all.length - 2);
  assert.deepEqual(draw.results, []);
  assert.equal(draw.current.ids.length, 2);
});

test('settleDraw exige um grupo aberto e um vencedor sorteado', () => {
  const all = roster('Ana', 'Bia');
  const empty = startDraw(all, { mode: 'livre', groupSize: 2 });
  assert.throws(() => settleDraw(empty, 'ana'), (error) => error instanceof DrawError && /Nenhum grupo/.test(error.message));
  const drawn = drawNext(empty, all, { rng: seq([0, 0]), at: 1 });
  assert.throws(() => settleDraw(drawn, 'caio'), (error) => error instanceof DrawError && /um dos sorteados/.test(error.message));
});

test('nao sorteia com menos de 2 participantes nem com 1 na disputa do mata-mata', () => {
  assert.throws(() => drawNext(startDraw(['ana']), ['ana']), (error) => error instanceof DrawError && /pelo menos 2/.test(error.message));
  const onlyOne = { ...startDraw(['ana', 'bia'], { mode: 'mata-mata', groupSize: 2 }), pool: ['ana'] };
  assert.throws(() => drawNext(onlyOne, ['ana', 'bia']), (error) => error instanceof DrawError && /Só resta 1/.test(error.message));
});

test('quem sai da sala sai do sorteio (pool, eliminados, campeao e grupo da vez)', () => {
  const all = roster('Ana', 'Bia', 'Caio');
  let draw = startDraw(all, { mode: 'mata-mata', groupSize: 2 });
  draw = drawNext(draw, all, { rng: seq([0, 0]), at: 1 });
  draw = settleDraw(draw, 'ana', { at: 2 });
  // Caio (fora do grupo) segue no pool; Bia saiu da disputa.
  assert.deepEqual(draw.pool, ['caio']);
  assert.deepEqual(draw.eliminated, ['bia']);

  // A sala e quem manda: quem ficou inativo sai de tudo.
  const prunedAll = syncDraw({ ...draw, champion: 'bia' }, ['ana']);
  assert.deepEqual(prunedAll.pool, []);
  assert.deepEqual(prunedAll.eliminated, []);
  assert.equal(prunedAll.champion, null);
  assert.equal(syncDraw({ ...draw, champion: 'ana' }, ['ana']).champion, 'ana');

  const prunedCurrent = syncDraw(drawNext(startDraw(all, { mode: 'livre', groupSize: 3 }), all, { rng: seq([0, 0]), at: 3 }), ['ana']);
  assert.deepEqual(prunedCurrent.current.ids, ['ana']);
});

test('normalizeDraw tolera lixo e o estado efetivo nasce pronto para sortear', () => {
  const draw = normalizeDraw({ mode: 'x', groupSize: 'y', round: -4, results: [null, { ids: [] }, { ids: [1, 1, 2], winner_id: 1, round: 2 }], current: { ids: [] } });
  assert.equal(draw.mode, 'livre');
  assert.equal(draw.groupSize, 3);
  assert.equal(draw.round, 1);
  assert.equal(draw.results.length, 1);
  assert.deepEqual(draw.results[0].ids, ['1', '2']);
  assert.equal(draw.current, null);

  const fresh = effectiveDraw(undefined, ['ana', 'bia']);
  assert.deepEqual(fresh.pool, ['ana', 'bia']);
  assert.equal(fresh.mode, 'livre');
  // Nada foi inventado: o sorteio efetivo e puro e pode sortear direto.
  assert.deepEqual(drawNext(fresh, ['ana', 'bia'], { rng: seq([0, 0]), at: 1 }).current.ids, ['ana', 'bia']);
});

test('sample respeita tamanho, sem repetir, e usa o rng injetado', () => {
  assert.deepEqual(sample(['a', 'b', 'c'], 2, seq([0, 0])), ['a', 'b']);
  assert.deepEqual(sample(['a', 'b', 'c'], 9, seq([0])), ['a', 'b', 'c']);
  assert.deepEqual(sample(['a', 'b', 'c'], 0, seq([0])), []);
  assert.deepEqual(sample(['a', 'b', 'c'], 2, seq([0.999999, 0.999999])), ['c', 'a']);
});

test('drawView conta quem jogou, quem venceu e explica por que nao da para sortear', () => {
  const all = people('Ana', 'Bia', 'Caio');
  const ids = names(all);
  let draw = startDraw(ids, { mode: 'mata-mata', groupSize: 2 });
  let view = drawView(draw, all);
  assert.equal(view.mode_label, 'Mata-mata');
  assert.equal(view.can_draw, true);
  assert.equal(view.counts.total, 3);
  assert.equal(view.counts.eligible, 3);
  assert.equal(view.started, false);

  draw = drawNext(draw, ids, { rng: seq([0, 0]), at: 1 });
  view = drawView(draw, all);
  assert.equal(view.can_draw, false);
  assert.match(view.cannot_reason, /Escolha o vencedor/);
  assert.deepEqual(view.current.names, ['Ana', 'Bia']);

  // Com o grupo aberto, quem joga ainda esta no torneio (nao no balaio).
  const abertas = drawView(draw, all);
  assert.equal(abertas.counts.in_game, 3, 'quem joga o grupo da vez continua no torneio');
  assert.equal(abertas.counts.eligible, 1, 'mas ja saiu do balaio da rodada');
  assert.equal(abertas.in_game.length, 3);

  draw = settleDraw(draw, 'ana', { at: 2 });
  view = drawView(draw, all);
  assert.deepEqual(view.eliminated.map((entry) => entry.name), ['Bia']);
  assert.deepEqual(view.in_game.map((entry) => entry.id).sort(), ['ana', 'caio']);
  assert.equal(view.counts.in_game, 2);
  assert.equal(view.eliminated[0].round, 1);
  assert.equal(view.history[0].winner_name, 'Ana');
  assert.equal(view.counts.played, 1);
  assert.equal(view.eligible.find((entry) => entry.name === 'Ana').wins, 1);

  // So sobra a campea (Caio passou direto e venceu a Ana): o mata-mata fecha.
  draw = drawNext(draw, ids, { rng: seq([0.99]), at: 3 });
  draw = settleDraw(draw, draw.current.ids[0], { at: 4 });
  view = drawView(draw, all);
  assert.equal(view.champion.name, 'Caio');
  assert.equal(view.can_draw, false);
  assert.match(view.cannot_reason, /já tem campeão/);

  // Sala com uma pessoa so: sem sorteio, com o motivo escrito.
  const single = drawView(startDraw(['ana']), people('Ana'));
  assert.equal(single.can_draw, false);
  assert.match(single.cannot_reason, /pelo menos 2/);
  assert.deepEqual(drawView(startDraw(['ana', 'ghost']), people('Ana')).eligible.map((entry) => entry.name), ['Ana']);
});
