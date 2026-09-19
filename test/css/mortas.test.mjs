// Catraca das declarações que perdem a cascata na PRÓPRIA chave.
//
// Por que existe. A chave é o par (contexto de mídia, seletor): duas declarações
// da mesma propriedade na mesma chave disputam exatamente os mesmos elementos, e
// a cascata escolhe uma. A que perde não vale em elemento algum — nem por
// herança, porque ninguém herda de uma declaração que nunca se aplica. Ela é
// inerte para a tela e cara para quem lê: sem consultar o cartório, quem abre a
// folha não sabe qual dos dois valores está vivo. `design.css` acumulou 22 pares
// de tinta e fundo assim; as 598 que restaram de outras propriedades foram
// cortadas na mesma data, e o piso agora é ZERO — nenhuma declaração morta.
// Este arquivo existe para que continue zero: cada nova reprova o envio.
//
// O que ela NÃO é. Não mede contraste nem tela — uma declaração morta não pinta
// nada, e quem responde por pixel é o portão 2 (`test/browser/css-render.test.mjs`).
// O que ela protege é o arquivo dizer a verdade sobre si mesmo, e o custo de ler
// uma folha com sobrescrita em camadas: cada morta nova é uma decisão de estilo
// que alguém tomou e que ninguém, olhando o arquivo, consegue ver.
//
// Como o número é guardado: IDENTIDADE, não contagem — folha, mídia, seletor,
// propriedade e valor, com ordinal quando a mesma declaração morta se repete na
// mesma chave. Identidade sobrevive a mudança de linha, então o que aparece aqui
// é sempre uma declaração que nasceu morta, e a mensagem diz qual, onde, e para
// quem ela perde.
//
// O limite, declarado: a comparação é por NOME de propriedade. O atalho
// `background` não mata `background-color` aqui, mesmo que o apague no navegador,
// e `@layer`/`@scope` não existem nestas folhas. Nos dois casos a régua erra para
// o lado de não acusar — o lado certo para um portão que pede olho humano.
//
// Se o corte for deliberado, regenere o instantâneo e revise o diff:
//   UPDATE_CSS_BASELINE=1 npm test
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import {
  FOLHAS,
  declaracoesDaCascata,
  declaracoesMortas,
  identidadesDeMortas,
  relatarMortas,
  resumoMortas,
} from '../support/cascata-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const INSTANTANEO = new URL('test/css/mortas.json', RAIZ);
// Estritamente '1': qualquer outro valor NÃO regrava o instantâneo em silêncio.
const atualizar = process.env.UPDATE_CSS_BASELINE === '1';

const lerFolhas = () =>
  FOLHAS.map((folha) => ({
    ...folha,
    texto: readFileSync(new URL(`public/assets/css/${folha.nome}`, RAIZ), 'utf8'),
  }));

const sintetica = (texto) => [{ nome: 'sintetica.css', ordem: 0, texto }];

// --- controles do detector ----------------------------------------------------
// Sem estes, um detector que nunca acusasse nada passaria na catraca e não
// guardaria nada — a catraca só olha para o conjunto de hoje.

test('cascata morta: a segunda regra da mesma chave vence e a primeira é morta', () => {
  const mortas = declaracoesMortas(sintetica('.a { color: red; }\n.a { color: blue; }\n'));
  assert.equal(mortas.length, 1);
  assert.equal(mortas[0].propriedade, 'color');
  assert.equal(mortas[0].valor, 'red');
  assert.equal(mortas[0].linha, 1, 'a morta é a primeira regra');
  assert.equal(mortas[0].vencedor.valor, 'blue');
  assert.equal(mortas[0].vencedor.linha, 2, 'e o vencedor é a segunda');
  assert.equal(mortas[0].seletor, '.a');
});

test('cascata morta: !important decide antes da ordem, nos dois sentidos', () => {
  const venceImportante = declaracoesMortas(
    sintetica('.a { color: blue; }\n.a { color: red !important; }\n'),
  );
  assert.deepEqual(
    venceImportante.map((m) => [m.valor, m.vencedor.valor]),
    [['blue', 'red !important']],
    'a importante vence mesmo vindo depois',
  );
  const perdeComum = declaracoesMortas(
    sintetica('.a { color: red !important; }\n.a { color: blue; }\n'),
  );
  assert.deepEqual(
    perdeComum.map((m) => [m.valor, m.vencedor.valor]),
    [['blue', 'red !important']],
    'a comum não derruba a importante anterior — quem morre é ela',
  );
});

test('cascata morta: declaração única não é morta, e mídia diferente é outra chave', () => {
  assert.deepEqual(declaracoesMortas(sintetica('.a { color: red; padding: 8px; }\n')), []);
  assert.deepEqual(
    declaracoesMortas(sintetica('.a { color: red; }\n@media (min-width: 600px) { .a { color: blue; } }\n')),
    [],
    'o mesmo seletor em outro contexto de mídia não compete: são chaves diferentes',
  );
});

test('cascata morta: atalho e longo não se matam (limite declarado da régua)', () => {
  // O navegador apaga o `background-color` com o `background` seguinte; a régua
  // compara nome de propriedade e não acusa. Erra para o lado de não acusar.
  assert.deepEqual(
    declaracoesMortas(sintetica('.a { background-color: red; }\n.a { background: blue; }\n')),
    [],
  );
});

test('cascata morta: a identidade distingue repetição na mesma chave', () => {
  const mortas = declaracoesMortas(
    sintetica('.a { gap: 4px; gap: 4px; padding: 1px; }\n.a { gap: 12px; }\n'),
  );
  assert.deepEqual(
    mortas.map((m) => [m.propriedade, m.valor]),
    [['gap', '4px'], ['gap', '4px']],
    'as duas do gap morrem; o padding, que só aparece uma vez, não é morta nenhuma',
  );
  const ids = identidadesDeMortas(mortas);
  assert.equal(new Set(ids).size, 2, 'duas mortas idênticas, duas identidades — nenhuma se esconde atrás da outra');
  assert.equal(ids[0].endsWith('#1'), true);
  assert.equal(ids[1].endsWith('#2'), true, 'o ordinal separa o que o texto não separa');
});

// --- a catraca sobre as folhas vivas -----------------------------------------

test('css: nenhuma declaração nasce morta (catraca das que perdem a cascata)', () => {
  const folhas = lerFolhas();
  const mortas = declaracoesMortas(folhas);

  // O piso é ZERO, então a lista vazia é o resultado esperado — e é também o
  // resultado de um leitor cego. Quem separa os dois é o tamanho do que foi LIDO:
  // um parser que deixasse de enxergar uma folha derruba esta contagem, e não a
  // lista de mortas, que já está vazia de propósito.
  const lidas = declaracoesDaCascata(folhas).length;
  assert.ok(
    lidas > 4000,
    `só ${lidas} declaração(ões) lida(s) nas folhas: o detector deixou de enxergar alguma folha`,
  );

  const identidades = identidadesDeMortas(mortas);
  const resumo = resumoMortas(mortas);
  const atual = { ...resumo, identidades: [...identidades].sort() };

  if (atualizar) {
    writeFileSync(INSTANTANEO, `${JSON.stringify(atual, null, 2)}\n`);
    return;
  }

  const esperado = JSON.parse(readFileSync(INSTANTANEO, 'utf8'));
  const antes = new Set(esperado.identidades);
  const agora = new Set(identidades);
  const porIdentidade = new Map(identidades.map((id, i) => [id, mortas[i]]));
  const novas = identidades.filter((id) => !antes.has(id)).sort();
  assert.ok(
    mortas.length === novas.length,
    `${mortas.length} morta(s) medida(s) e ${novas.length} nova(s): o instantâneo tem identidade repetida`,
  );
  const sumidas = esperado.identidades.filter((id) => !agora.has(id)).sort();

  assert.deepEqual(
    novas,
    [],
    `${novas.length} declaração(ões) nasceu(ram) morta(s) — no arquivo, fora da tela:\n` +
      `${relatarMortas(novas.map((id) => porIdentidade.get(id)))}\n\n` +
      'A chave é o par (mídia, seletor): a declaração que perde disputa os mesmos elementos que a\n' +
      'vencedora e não vale em nenhum. O caminho é apagar a morta — ou trocar a vencedora, se era\n' +
      'ela que estava errada —, nunca registrar a identidade nova no instantâneo.\n\n' +
      'Corte deliberado de várias? Depois de cortar, regrave e revise o diff:\n' +
      '  UPDATE_CSS_BASELINE=1 npm test\n',
  );

  assert.deepEqual(
    sumidas,
    [],
    `${sumidas.length} declaração(ões) morta(s) desapareceu(ram) desde o instantâneo:\n` +
      `${relatarSumidas(sumidas)}\n\n` +
      'Pode ser corte (bom: o teto desceu) ou uma declaração que voltou a vencer em outro lugar.\n' +
      'Nos dois casos é mudança de cascata e merece registro — regrave e revise o diff:\n' +
      '  UPDATE_CSS_BASELINE=1 npm test\n',
  );
});

/** Uma identidade sumida não tem objeto vivo: o relatório mostra o que ela era. */
function relatarSumidas(identidades) {
  return identidades
    .slice(0, 20)
    .map((id) => {
      const [folha, media, seletor, resto] = id.split('|');
      return `  ${folha}${media ? ` @${media}` : ''} ${seletor} → ${resto.replace(/#\d+$/, '')}`;
    })
    .join('\n');
}
