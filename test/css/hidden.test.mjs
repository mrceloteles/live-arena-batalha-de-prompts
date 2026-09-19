// Portão 4: o atributo `hidden` vence a propriedade `display`.
//
// POR QUE ESTE PORTÃO EXISTE. `[hidden]` é implementado pelo navegador como
// regra de folha do USUÁRIO — origem mais fraca que qualquer folha nossa. Toda
// regra de autor que declare `display` e case com o elemento ganha dele, e o
// elemento continua pintado com o atributo posto. Em 16/09 isso apareceu na
// tela: durante o Wild Card, a votação veio com o cartão de espera logo abaixo
// porque `.arena-mission-panel:has(...)` declarava `display: flex !important` e
// o painel estava `hidden`. Três guardas aprovaram o defeito porque todas
// perguntavam ao ATRIBUTO (`!painel.hidden`), não à pintura.
//
// O QUE ELE FAZ. Sem navegador: monta o catálogo dos elementos que CARREGAM o
// atributo (o atributo escrito na marcação, mais os alvos que o cliente
// liga/desliga com `elemento.hidden = ...`) e simula, para cada um, a cascata de
// `display` das cinco folhas — importância, especificidade, ordem de folha e de
// regra. Reprova se o vencedor não for `none`.
//
// O QUE ELE NÃO É. Não mede pixel nem substitui o portão 2: quem pinta de
// verdade é o navegador. Aqui a pergunta é sobre o ARQUIVO — qual valor a
// cascata resolve — e as duas guardas se completam: esta vê o caso que só existe
// quando o atributo está posto (que o retrato de telas não captura), e o portão 2
// vê o que a régua daqui não sabe modelar (`:has()`, pseudo-classe, mídia viva).
//
// COMO UMA DERROTA DELIBERADA SE DECLARA. Uma regra pode vencer o `hidden` de
// propósito — hoje há uma: a linha reservada da mensagem de erro, que existe
// justamente para o cartão não pular. Nesse caso o comentário que abre a regra
// escreve `hidden: <motivo>`, e o portão passa a contá-la como declarada, sob
// teto. Sem a marca, é defeito: era o que faltava no painel da missão, que
// vencia o atributo por acidente e sem que ninguém tivesse escrito isso.
//
// O LIMITE, DECLARADO. `@media print` fica fora (o defeito desta classe é de
// tela), `@layer`/`@scope` não existem nestas folhas, e `setAttribute('hidden')`
// não é modelado — este último REPROVA ao aparecer, para a forma nova ser
// classificada em vez de escapar calada. A contabilidade é o que sustenta a
// promessa: cada `hidden` dos fontes vivas tem de cair numa forma conhecida, e
// um alvo que o cliente esconde sem existir na marcação só vale se estiver
// declarado em `SEM_ELEMENTO` com o motivo.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEM_ELEMENTO,
  conflitosDeDisplay,
  lerFolhas,
  lerFontes,
  relatarConflitos,
} from '../support/hidden-css.mjs';

const RAIZ = new URL('../../', import.meta.url);

// Teto das vitórias DELIBERADAS de `display` sobre o `hidden`. Hoje é UMA regra
// (a reserva de linha das mensagens de erro das duas entradas, que vence o
// atributo de propósito para o cartão não pular quando o erro chega). Subir o
// teto exige declarar no comentário da regra e justificar aqui; descer é corte.
const TETO_DELIBERADAS = 1;

// --- o corpus sintético de cada controle --------------------------------------

const folha = (texto, nome = 'sintetica.css') => [{ nome, ordem: 0, texto }];
const fontes = (texto, arquivo = 'sintetica.mjs') => [{ arquivo, texto }];

const PROTETOR = '[hidden] { display: none !important; }\n';
const TELA = `<section data-tela>\n  <div class="alvo" hidden></div>\n</section>\n`;
const FORA = `<div class="alvo" hidden></div>\n`;

const analisar = (css, fonte) => conflitosDeDisplay({ folhas: folha(css), fontes: fontes(fonte) });

// --- controles do detector ----------------------------------------------------
// Sem estes, um detector que nunca acusasse nada passaria na catraca e não
// guardaria nada — a catraca só olha para o conjunto de hoje.

test('hidden: revelador sem importância perde do protetor universal', () => {
  const r = analisar(`${PROTETOR}.alvo { display: flex; }\n`, FORA);
  assert.deepEqual(r.conflitos, []);
  assert.equal(r.avaliados, 1, 'o carregador entrou na conta');
});

test('hidden: revelador que empata e vem depois vence — e é acusado', () => {
  const r = analisar(`${PROTETOR}.alvo { display: flex !important; }\n`, FORA);
  assert.equal(r.conflitos.length, 1);
  assert.equal(r.conflitos[0].vencedor.valor, 'flex !important');
  assert.match(relatarConflitos(r.conflitos), /\.alvo/);
});

test('hidden: sem protetor universal, o autor pinta o elemento escondido', () => {
  // A folha do usuário é mais fraca que qualquer folha nossa: sem um
  // `[hidden]` de autor, o `display: flex` pinta o elemento escondido.
  const r = analisar('.alvo { display: flex; }\n', FORA);
  assert.equal(r.conflitos.length, 1);
  assert.equal(r.conflitos[0].vencedor.valor, 'flex');
});

test('hidden: `:not([hidden])` no sujeito absolve a regra', () => {
  const r = analisar(`${PROTETOR}.alvo:not([hidden]) { display: flex !important; }\n`, FORA);
  assert.deepEqual(r.conflitos, []);
  assert.equal(r.avaliados, 1, 'o carregador continua avaliado: a regra é que não casa');
});

test('hidden: o protetor escopado cobre quem está dentro e não cobre quem está fora', () => {
  const css = `[data-tela] [hidden] { display: none !important; }\n.alvo { display: flex !important; }\n`;
  assert.deepEqual(analisar(css, TELA).conflitos, [], 'dentro de [data-tela], o protetor escopado cobre');
  const fora = analisar(css, FORA);
  assert.equal(fora.conflitos.length, 1, 'fora de [data-tela], ninguém cobre — a cadeia de ancestrais importa');
});

test('hidden: pseudo-elemento não é a caixa do elemento', () => {
  const r = analisar(`${PROTETOR}.alvo::before { display: flex !important; }\n`, FORA);
  assert.deepEqual(r.conflitos, [], 'estilizar ::before não pinta o elemento escondido');
});

test('hidden: `@media print` fica fora da conta (limite declarado)', () => {
  const r = analisar(`${PROTETOR}@media print { .alvo { display: flex !important; } }\n`, FORA);
  assert.deepEqual(r.conflitos, []);
});

test('hidden: a marca `hidden:` no comentário converte o conflito em decisão', () => {
  const semMarca = analisar(`${PROTETOR}.alvo { display: flex !important; }\n`, FORA);
  assert.equal(semMarca.conflitos.length, 1);
  const comMarca = analisar(
    `${PROTETOR}/* hidden: a linha é reservada de propósito, medido em 390x844. */\n.alvo { display: flex !important; }\n`,
    FORA,
  );
  assert.deepEqual(comMarca.conflitos, []);
  assert.equal(comMarca.deliberados.length, 1, 'a vitória deliberada é contada à parte');
});

test('hidden: alvo que o cliente esconde conta como carregador do atributo', () => {
  const fonte = `<div class="alvo" data-rolo></div>\nconst x = $('[data-rolo]');\nx.hidden = true;\n`;
  assert.deepEqual(analisar(`${PROTETOR}.alvo { display: flex; }\n`, fonte).conflitos, []);
  const r = analisar(`${PROTETOR}.alvo { display: flex !important; }\n`, fonte);
  assert.equal(r.conflitos.length, 1, 'o atributo que o cliente põe vale como o escrito na marcação');
});

test('hidden: alvo que o cliente esconde e nenhuma marcação escreve não é julgado', () => {
  const fonte = `const x = $('[data-fantasma]');\nx.hidden = true;\n`;
  const r = analisar(`${PROTETOR}`, fonte);
  assert.equal(r.semMarcacao.length, 1);
  assert.equal(r.semMarcacao[0].declarado, false, 'sem elemento conhecido, a prova é impossível — reprova');
});

test('hidden: `document.hidden` e leitura de visibilidade da aba, nao alvo escondido', () => {
  // As telas perguntam `document.hidden` para espacar o batimento em aba oculta.
  // A propriedade do navegador nao esconde elemento nenhum: sem esta
  // classificacao, a varredura de alvo acusava `document` como um alvo que ela
  // nao soube atribuir — falso positivo que apareceria a cada uso legitimo.
  const r = analisar(`${PROTETOR}`, 'const oculta = document.hidden;\nif (window.document.hidden) return;\n');
  assert.deepEqual(r.naoAtribuidos, [], 'leitura do navegador nao e alvo de esconder');
  assert.ok(
    r.ignorados.some((i) => /visibilidade da aba/.test(i.motivo)),
    'a leitura fica classificada, e nao ignorada em silencio',
  );
});

test('hidden: `setAttribute("hidden")` e texto de template solto reprovam', () => {
  const porApi = analisar(`${PROTETOR}`, `el.setAttribute('hidden', '');\n`);
  assert.equal(porApi.naoAtribuidos.length, 1, 'forma nova de mexer no atributo tem de ser classificada');
  const solto = analisar(`${PROTETOR}`, 'const dica = `escondido: hidden`;\n');
  assert.equal(solto.naoContabilizados.length, 1, 'a palavra em texto de template não é forma conhecida');
});

// --- a catraca sobre as folhas vivas -----------------------------------------

test('css: nenhuma regra viva pinta um elemento que carrega `hidden`', () => {
  const r = conflitosDeDisplay({ folhas: lerFolhas(RAIZ), fontes: lerFontes(RAIZ) });

  // Tamanho do que foi LIDO: um parser que deixasse de enxergar uma folha, uma
  // marcação ou um alvo do cliente derruba estas contagens — e não a lista de
  // conflitos, que já está vazia de propósito.
  assert.ok(
    r.declaracoes > 400,
    `só ${r.declaracoes} declaração(ões) de display lida(s): o detector deixou de enxergar alguma folha`,
  );
  assert.ok(
    r.carregadores.length > 100,
    `só ${r.carregadores.length} carregador(es) do atributo: a leitura das fontes vivas encolheu`,
  );
  assert.ok(r.avaliados > 100, `só ${r.avaliados} carregador(es) avaliado(s)`);

  // A contabilidade: cada `hidden` dos fontes vivas tem de cair numa forma
  // conhecida, e cada alvo do cliente tem de ser atribuível a um elemento.
  assert.deepEqual(
    r.naoContabilizados,
    [],
    'ocorrência de `hidden` que a guarda não sabe classificar:\n' +
      r.naoContabilizados.map((n) => `  ${n.arquivo}:${n.linha} ${n.motivo}`).join('\n') +
      '\n\nClassifique a forma nova em `contabilizarHidden` (ou modele o carregador): a régua\n' +
      'precisa enxergar tudo o que esconde um elemento, senão o `display` dele passa sem prova.',
  );
  assert.deepEqual(
    r.naoAtribuidos,
    [],
    'alvo do cliente que a guarda não conseguiu atribuir a elemento algum:\n' +
      r.naoAtribuidos.map((n) => `  ${n.arquivo}:${n.linha} ${n.alvo ?? ''}`).join('\n'),
  );

  // Alvo escondido sem existir em marcação: prova impossível, salvo isenção
  // escrita em `SEM_ELEMENTO`.
  const semDeclaracao = r.semMarcacao.filter((s) => !s.declarado);
  assert.deepEqual(
    semDeclaracao,
    [],
    'alvo que o cliente esconde e nenhuma fonte viva escreve:\n' +
      semDeclaracao.map((s) => `  ${s.origem} ${s.seletor}`).join('\n') +
      '\n\nOu o elemento mora numa fonte viva, ou a isenção entra em `SEM_ELEMENTO` com o motivo.',
  );
  const vistas = new Set(r.semElemento);
  const mentiras = [...SEM_ELEMENTO.keys()].filter((chave) => !vistas.has(chave));
  assert.deepEqual(
    mentiras,
    [],
    `isenção que virou mentira (o alvo não é mais escondido por ninguém): ${mentiras.join(', ')}`,
  );

  // Vitórias deliberadas, contadas por REGRA (dois seletores de uma mesma lista
  // são uma decisão só) e sob teto.
  const regras = new Set(r.deliberados.map((d) => `${d.vencedor.folha}|${d.vencedor.regraInicio}`));
  assert.ok(
    regras.size <= TETO_DELIBERADAS,
    `${regras.size} regra(s) vencendo o \`hidden\` por declaração (teto ${TETO_DELIBERADAS}):\n` +
      `${relatarConflitos(r.deliberados)}\n\n` +
      'Uma regra que pinta elemento escondido precisa de motivo escrito no comentário que a abre\n' +
      '(`hidden: <motivo>`) e de revisão aqui: subir o teto é assumir a dívida, não registrá-la.',
  );

  assert.deepEqual(
    r.conflitos,
    [],
    `${r.conflitos.length} regra(s) viva(s) pintam um elemento que carrega \`hidden\`:\n` +
      `${relatarConflitos(r.conflitos)}\n\n` +
      'O elemento fica com o atributo posto E visível. A correção é do lado da regra que pinta:\n' +
      'dê `:not([hidden])` ao sujeito (ou um protetor que cubra o elemento) — nunca declare a\n' +
      'vitória no comentário sem que ela seja deliberada, medida e justificada.',
  );
});

test('css: a guarda morde o defeito do painel da missão (16/09)', () => {
  // O defeito real, provado pelo avesso: com a correção no lugar, nada aparece;
  // desfazendo só o `:not([hidden])` do painel, a régua acusa. É o que garante
  // que a guarda não está só de acordo com o arquivo — ela sabe ver o defeito.
  const folhas = lerFolhas(RAIZ);
  const fontes = lerFontes(RAIZ);
  assert.deepEqual(
    conflitosDeDisplay({ folhas, fontes }).conflitos,
    [],
    'esta prova exige o estado atual limpo',
  );
  const design = folhas.find((f) => f.nome === 'design.css');
  const original = design.texto;
  const semCorrecao = original.replaceAll(
    '.arena-mission-panel:not([hidden]):has(',
    '.arena-mission-panel:has(',
  );
  assert.notEqual(semCorrecao, original, 'a correção da etapa 6 não está mais em design.css');
  design.texto = semCorrecao;
  try {
    const r = conflitosDeDisplay({ folhas, fontes });
    assert.ok(
      r.conflitos.some((c) => c.vencedor.seletor.includes('arena-mission-panel')),
      `o painel da missão tinha de aparecer na acusação:\n${relatarConflitos(r.conflitos)}`,
    );
  } finally {
    design.texto = original;
  }
});
