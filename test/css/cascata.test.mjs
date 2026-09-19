// Portão 1 de 3: a cascata declarada.
//
// Prova, no nível do arquivo, que cada seletor resolve no mesmo valor de antes —
// considerando ordem de folha, ordem dentro da folha e `!important`. Não precisa
// de navegador nem de servidor: roda em milissegundos dentro de `npm test`.
//
// O que este portão NÃO vê: quando um seletor passa a ganhar (ou a perder) de
// OUTRO seletor no mesmo elemento. Isso é o portão 2, em
// `test/browser/css-render.test.mjs`. Os dois juntos fecham a garantia.
//
// Se a mudança de estilo for intencional, regenere o instantâneo:
//   UPDATE_CSS_BASELINE=1 npm test
// e revise o diff de `test/css/cascata.json` antes de commitar — é ele que
// registra, linha por linha, o que a tela passou a mostrar.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import {
  FOLHAS,
  FOLHA_DE_CONTRATO,
  analisarRegras,
  cabecalhoDe,
  cascataDe,
  chavesBalanceadas,
  diferenças,
  relatar,
  serializar,
} from '../support/cascata-css.mjs';

const raiz = new URL('../../', import.meta.url);
const cartorio = new URL('test/css/cascata.json', raiz);
// Estritamente '1': `UPDATE_CSS_BASELINE=0` (ou qualquer outro valor) NÃO pode
// regravar o cartório em silêncio — quem regenera é quem quer regenerar.
const atualizar = process.env.UPDATE_CSS_BASELINE === '1';

const lerFolhas = () =>
  FOLHAS.map((folha) => ({
    ...folha,
    texto: readFileSync(new URL(`public/assets/css/${folha.nome}`, raiz), 'utf8'),
  }));

// O leitor da cascata partia o corpo da regra em `;` com o comentário ainda
// dentro. O primeiro `:` de um comentário (`/* escuro: contraste */`) virava o
// nome da propriedade, e a declaração seguinte desaparecia do contrato — quem
// mexesse nela não era avisado por nenhum portão. Doze seletores do cartório
// viviam assim.
test('css: comentário dentro da regra não esconde a declaração seguinte', () => {
  const regras = analisarRegras(`.a {
    /* por que existe este valor: contraste */
    color: red;
    background: blue; /* e isto no fim */
  }`);
  assert.deepEqual(regras[0].decls, ['color: red', 'background: blue']);
});

// Lê a cascata das folhas em disco, e não o arquivo versionado: o instantâneo é
// regravado num teste posterior deste arquivo, e uma guarda que dependesse da
// ordem de execução passaria ou falharia conforme a posição do `test`.
test('css: nenhuma entrada do cartório carrega comentário colado', () => {
  const registro = serializar(cascataDe(lerFolhas()));
  const sujas = Object.entries(registro)
    .filter(([chave, valor]) => chave.includes('/*') || valor.includes('/*'))
    .map(([chave]) => chave);
  assert.deepEqual(sujas, [], `entradas com comentário no lugar de propriedade: ${sujas.join(', ')}`);
});

test('css: cada folha carregada tem cabeçalho inteiro e chaves fechadas', () => {
  for (const folha of lerFolhas()) {
    assert.ok(chavesBalanceadas(folha.texto), `${folha.nome}: chaves desbalanceadas`);
    // O cabeçalho é onde vive o `@import` do Google Fonts. A URL tem `;` na
    // faixa de eixo variável (`wght@0,300..800;1,300..800`), então um recorte
    // ingênuo no primeiro `;` trunca a URL e o `@import` inválido engole as
    // regras seguintes — a folha inteira deixa de valer sem nenhum erro visível.
    const cabecalho = cabecalhoDe(folha.texto);
    for (const corte of cabecalho.split(/(?<=;)\s+/).filter(Boolean)) {
      assert.match(
        corte,
        /^@(import|charset|layer|namespace)\b[\s\S]*;$/,
        `${folha.nome}: at-rule de topo malformada -> ${corte.slice(0, 120)}`,
      );
    }
    assert.doesNotMatch(cabecalho, /[^;]$/, `${folha.nome}: cabeçalho não termina em ';'`);
  }
});

test('css: nenhuma folha órfã em public/assets/css', () => {
  const arquivos = readdirSync(new URL('public/assets/css', raiz)).filter((nome) => nome.endsWith('.css'));
  const esperadas = new Set([...FOLHAS.map((f) => f.nome), FOLHA_DE_CONTRATO]);
  const orfas = arquivos.filter((nome) => !esperadas.has(nome));
  assert.deepEqual(
    orfas,
    [],
    `folhas que nenhuma página carrega (e não são contrato do manifest): ${orfas.join(', ')}`,
  );
  for (const folha of FOLHAS) {
    assert.ok(arquivos.includes(folha.nome), `${folha.nome} é carregada pelas páginas mas não existe em disco`);
  }
});

test('css: nenhuma folha viva serve as páginas clássicas retiradas', () => {
  // /game.php, /main.php, /wall.php e /join.php respondem 404 desde a retirada da
  // camada clássica do renderer: nenhuma página servida emite esses `data-page`, e
  // o cliente clássico também saiu de `app.js`. Regra escopada neles é superfície
  // morta — e era invisível, porque nenhuma tela a exercitava. Aqui ela volta a
  // aparecer. São os mesmos quatro valores que `test/web/rotas-retiradas.test.mjs`
  // recusa no markup e no JS: as duas pontas da mesma guarda têm de cobrir a mesma
  // lista, senão um valor escapa por baixo da outra.
  // A folha capturada do site base (`app.css`) fica de fora de propósito: ela é
  // contrato dos testes de fidelidade, não folha carregada.
  const escopoClassico = /\[data-page=(?:"|')?(?:game|main|wall|join)(?:"|')?\]/;
  for (const folha of lerFolhas()) {
    const mortas = [...cascataDe([folha]).keys()].filter((chave) => escopoClassico.test(chave));
    assert.deepEqual(
      mortas,
      [],
      `${folha.nome}: regra escopada em página clássica retirada (game/main/wall):\n  ${mortas.slice(0, 5).join('\n  ')}`,
    );
  }
});

test('css: a cascata declarada é a mesma do instantâneo', () => {
  const cascata = serializar(cascataDe(lerFolhas()));
  if (atualizar) {
    writeFileSync(cartorio, `${JSON.stringify(cascata, null, 2)}\n`);
    return;
  }
  const esperado = JSON.parse(readFileSync(cartorio, 'utf8'));
  const falhas = diferenças(esperado, cascata);
  assert.equal(
    falhas.total,
    0,
    `a cascata mudou em ${falhas.total} seletor(es):\n${relatar(falhas)}\n\n` +
      'Se a mudança é intencional, prove que a tela mudou do jeito que você quis e regenere:\n' +
      '  UPDATE_CSS_BASELINE=1 npm test\n' +
      'Se não é, o culpado está numa das cinco folhas — o portão 2 mostra qual seletor passou a vencer.',
  );
});
