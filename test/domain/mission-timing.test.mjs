import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestedDuration, suggestTiming, TIMING_SUGGESTION_BOUNDS } from '../../src/domain/mission-timing.mjs';

test('sugestao de tempo: a modalidade define a base', () => {
  const curta = 'Escreva o prompt do banner.';
  assert.equal(suggestedDuration({ modality: 'essencial', mission: curta }).seconds, 45);
  assert.equal(suggestedDuration({ modality: 'precisao', mission: curta }).seconds, 105);
  assert.equal(suggestedDuration({ modality: 'contexto', mission: curta }).seconds, 135);
  assert.equal(suggestedDuration({ modality: 'reversa', mission: curta }).seconds, 165);
  assert.equal(suggestedDuration({ modality: 'boss', mission: curta }).seconds, 225);
});

test('sugestao de tempo: modalidade desconhecida cai na base padrao, nao em zero', () => {
  const { seconds, base } = suggestedDuration({ modality: 'modalidade-nova', mission: 'Escreva o prompt do banner.' });
  assert.equal(base, 120);
  assert.equal(seconds, 105);
});

test('sugestao de tempo: missao longa pede mais, missao de uma linha pede menos', () => {
  const texto = Array.from({ length: 80 }, (_, index) => `palavra${index}`).join(' ');
  const longa = suggestedDuration({ modality: 'reversa', mission: texto });
  assert.equal(longa.words, 80);
  assert.equal(longa.seconds, 225, 'reversa longa sobe 45 s');

  const deUmaLinha = suggestedDuration({ modality: 'reversa', mission: 'Observe a imagem e escreva o prompt.' });
  assert.equal(deUmaLinha.extra, -15);
  assert.equal(deUmaLinha.seconds, 165);

  const tipica = suggestedDuration({ modality: 'reversa', mission: 'Observe a imagem e escreva o prompt que a recriaria.' });
  assert.equal(tipica.extra, 0, 'dez palavras já contam como tamanho típico');
  assert.equal(tipica.seconds, 180);
});

test('sugestao de tempo: contexto conta junto com a missao', () => {
  const soMissao = suggestedDuration({ modality: 'precisao', mission: 'Escreva o prompt do cartaz.' });
  const comContexto = suggestedDuration({
    modality: 'precisao',
    mission: 'Escreva o prompt do cartaz.',
    context: 'A campanha é para uma feira de tecnologia voltada a estudantes do ensino médio, com estandes de robótica, oficinas e palestras ao longo de um sábado inteiro.',
  });
  assert.ok(comContexto.words > soMissao.words);
  assert.ok(comContexto.seconds > soMissao.seconds, 'o briefing mais longo sobe o tempo sugerido');
});

test('sugestao de tempo: fica na faixa util e em passos de 15 s', () => {
  const textos = ['', 'oi', 'Escreva o prompt do banner do evento.', Array.from({ length: 200 }, () => 'palavra').join(' ')];
  for (const modality of ['essencial', 'sprint', 'precisao', 'contexto', 'reversa', 'boss', 'livre', 'qualquer']) {
    for (const texto of textos) {
      const { seconds } = suggestedDuration({ modality, mission: texto });
      assert.equal(seconds % 15, 0, `${modality}/${texto.slice(0, 12)} não está em passos de 15 s`);
      assert.ok(seconds >= TIMING_SUGGESTION_BOUNDS.min && seconds <= TIMING_SUGGESTION_BOUNDS.max, `${modality} saiu da faixa: ${seconds}`);
    }
  }
});

test('sugestao de tempo: a razao explica de onde veio o numero', () => {
  assert.equal(suggestTiming({ modality: 'reversa', mission: 'Observe a imagem e escreva o prompt.' }).reason, 'missão curta (7 palavras)');
  assert.equal(suggestTiming({ modality: 'precisao', mission: 'Escreva o prompt do banner do evento de tecnologia da escola.' }).reason, 'missão no tamanho típico');
  assert.match(suggestTiming({ modality: 'boss', mission: Array.from({ length: 45 }, () => 'palavra').join(' ') }).reason, /^missão longa \(45 palavras\)$/);
});
