// Guarda sem navegador: nenhuma regra viva declara tinta e fundo na mesma regra
// abaixo do teto AA (WCAG 2.1, 1.4.3 — 4,5 em texto normal, 3,0 em texto grande).
//
// Por que ela existe: a varredura de contraste de 16/09 achou onze pares abaixo
// do teto, e os dois piores não apareciam em captura de tela nenhuma — um selo de
// modo sem par de cores próprio que caía no topbar escuro da TV (2,12) e um
// `::before` de resultado (3,22), que nenhuma sonda de pixel alcança. Os dois
// nasceram assim, um envio de cada vez, sem nenhum portão para reprovar. A sonda
// de pixels continua sendo a régua de verdade, mas ela precisa de Chromium, de
// fixture e de estado vivo: roda quando alguém lembra. Esta aqui roda em
// milissegundos dentro do `npm test`, a cada envio.
//
// A tinta não precisa estar no mesmo corpo de regra que o fundo: a cascata é por
// (media, seletor) — a `chave` —, e dentro de uma chave convivem a regra que
// declara a cor e a que declara o fundo. Exigir as duas na mesma regra deixou
// seis pares órfãos quando o corte de 16/09 apagou declarações de fundo que perdiam a
// cascata: a tinta sobreviveu em outra regra da mesma chave, e ninguém mediu. A
// família `tinta sem fundo na chave` conta a população que ainda não tem par
// declarado (a régua compõe com quem pinta na chave, e ali não há quem pinte).
//
// O que ela NÃO é: medida de tela. Ela confere a aritmética do que está escrito
// no arquivo, e só isso. Fundo translúcido, imagem de fundo, texto pintado com
// gradiente, `opacity` e gradiente cuja pior parada não passa ficam de fora —
// com o motivo escrito e a contagem guardada num instantâneo, para que um selo
// novo nessas condições apareça na diferença do instantâneo em vez de passar em
// silêncio. O relatório da catraca mostra, por família, a contagem e um exemplo.
//
// Se um par novo for reprovado e a decisão for mantê-lo (texto decorativo, por
// exemplo), o caminho NÃO é afrouxar o teto: o caminho é tirar o par da
// aritmética de propósito — fundo translúcido, gradiente — e explicar no
// commit. Assim a exceção fica declarada no arquivo, não escondida na régua.
//
// E o teto AA não é a meta, é o piso do aceitável. A catraca guarda também a
// FOLGA: o menor contraste medido entre os pares conferidos fica registrado em
// `test/css/contraste.json` como piso, e descer não passa. Foi assim que o
// sistema chegou a 4,50 — no limite exato, sem espaço para o próximo ajuste de
// paleta —, e é para isso não voltar que o número está lá.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import { FOLHAS } from '../support/cascata-css.mjs';
import {
  contagemPorFamilia,
  contraste,
  fundosDeclarados,
  interpretarCor,
  paresDeclarados,
  relatarConferidos,
  relatarPulados,
  tamanhoEmPx,
  tetoAA,
} from '../support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const CATRACA = new URL('test/css/contraste.json', RAIZ);
const atualizar = process.env.UPDATE_CSS_BASELINE === '1';

const lerFolhas = () =>
  FOLHAS.map((folha) => ({
    ...folha,
    texto: readFileSync(new URL(`public/assets/css/${folha.nome}`, RAIZ), 'utf8'),
  }));

const folhaSintetica = (texto) => [{ nome: 'sintetica.css', ordem: 0, texto }];

// --- controles do instrumento -------------------------------------------------
// Sem estes, um predicado que nunca condenasse nada (ou nunca enxergasse nada)
// passaria na guarda principal e não guardaria nada.

test('contraste: a cor é lida em hex, rgb(), hsl() e var() com queda', () => {
  const tokens = new Map([
    ['--tinta', new Set(['#123456'])],
    ['--outro', new Set(['rgb(10, 20, 30)'])],
  ]);
  assert.deepEqual(interpretarCor('#fff', tokens).rgba, [255, 255, 255, 1]);
  assert.deepEqual(interpretarCor('#0b57d0', tokens).rgba, [11, 87, 208, 1]);
  assert.deepEqual(interpretarCor('rgba(0, 0, 0, 0.5)', tokens).rgba, [0, 0, 0, 0.5]);
  assert.deepEqual(interpretarCor('rgb(1 2 3 / 50%)', tokens).rgba, [1, 2, 3, 0.5]);
  assert.deepEqual(interpretarCor('hsl(0, 0%, 100%)', tokens).rgba, [255, 255, 255, 1]);
  assert.deepEqual(interpretarCor('hsla(0, 0%, 0%, .9)', tokens).rgba, [0, 0, 0, 0.9]);
  assert.deepEqual(interpretarCor('var(--tinta)', tokens).rgba, [18, 52, 86, 1]);
  assert.deepEqual(interpretarCor('var(--nao-existe, #abcdef)', tokens).rgba, [171, 205, 239, 1]);
  assert.deepEqual(interpretarCor('var(--nao-existe, var(--outro))', tokens).rgba, [10, 20, 30, 1]);
  // O que não dá para afirmar tem de sair como não resolvido, e não como preto.
  assert.equal(interpretarCor('currentColor', tokens).ok, false);
  assert.equal(interpretarCor('color-mix(in srgb, red, blue)', tokens).ok, false);
  assert.equal(interpretarCor('var(--nao-existe)', tokens).ok, false);
});

test('contraste: o teto acompanha corpo e peso, e é estrito quando falta o corpo', () => {
  assert.equal(tetoAA(16, 400), 4.5);
  assert.equal(tetoAA(18.66, 700), 3);
  assert.equal(tetoAA(18, 700), 4.5, 'abaixo do limiar de texto grande, mesmo em negrito');
  assert.equal(tetoAA(24, 400), 3);
  assert.equal(tetoAA(null, 900), 4.5, 'corpo desconhecido: teto estrito, nunca o brando');
  assert.equal(tamanhoEmPx('1.5rem'), 24);
  assert.equal(tamanhoEmPx('clamp(40px, 6vw, 56px)'), 40, 'no clamp, vale o menor corpo possível');
  assert.equal(tamanhoEmPx('1.15em'), null, 'em depende do pai: não dá para afirmar');
});

test('contraste: a razão WCAG confere com os valores de referência', () => {
  const preto = interpretarCor('#000', null).rgba;
  const branco = interpretarCor('#fff', null).rgba;
  assert.equal(Number(contraste(preto, branco).toFixed(2)), 21);
  assert.equal(Number(contraste(branco, branco).toFixed(2)), 1);
  // Tinta com alfa é composta sobre o fundo antes de medir, não medida como se
  // fosse opaca — senão `rgba(255,255,255,.5)` sobre branco daria 21.
  assert.equal(Number(contraste(interpretarCor('rgba(0,0,0,.5)', null).rgba, branco).toFixed(2)), 3.95);
});

test('contraste: o gradiente vale pela pior parada, e a parada com var() é resolvida', () => {
  // As três paradas do `.figma-cta` de verdade, com a tinta branca: 6,36 / 4,18 /
  // 4,55 — e é a do meio que decide.
  const tokens = new Map([
    ['--escuro', new Set(['#0b57d0'])],
    ['--acento', new Set(['#00875a'])],
  ]);
  const props = new Map([
    ['background', 'linear-gradient(100deg, var(--escuro) 0 72%, #087edc 86%, var(--acento) 100%)'],
  ]);
  const { fundos, gradiente } = fundosDeclarados(props, tokens);
  assert.equal(gradiente, true);
  assert.equal(fundos.length, 3, 'as três paradas do gradiente entram na conta');
  const tinta = interpretarCor('#fff', tokens).rgba;
  const razoes = fundos.map((cor) => contraste(tinta, cor));
  assert.equal(Number(Math.min(...razoes).toFixed(2)), 4.18, 'a pior parada é a que decide');
});

test('contraste: selo novo ilegível é reprovado, e o legível é poupado (controle positivo)', () => {
  const { conferidos } = paresDeclarados(folhaSintetica(
    '.selo-novo { background: #10b981; color: #ffffff; font-size: 12px; font-weight: 800; }\n' +
    '.selo-bom { background: #065f46; color: #ffffff; font-size: 12px; font-weight: 800; }\n',
  ));
  assert.deepEqual(
    conferidos.map((p) => [p.seletor, p.ok]),
    [['.selo-novo', false], ['.selo-bom', true]],
    'achou os dois e condenou só o ilegível',
  );
  assert.equal(conferidos[0].teto, 4.5, '12 px: teto de texto normal');
});

test('contraste: pseudo-elemento entra na conta (o caso que a captura não pega)', () => {
  const { conferidos } = paresDeclarados(folhaSintetica(
    '.tv-resultado::before { content: "RESULTADO FINAL"; background: #fef2ca; color: #b07e00; font-size: 11px; font-weight: 700; }\n',
  ));
  assert.equal(conferidos.length, 1);
  assert.equal(conferidos[0].ok, false);
  assert.equal(Number(conferidos[0].razao.toFixed(2)), 3.22, 'a razão do achado real de 16/09');
});

test('contraste: teto brando vale só quando o corpo está declarado na regra', () => {
  const { conferidos } = paresDeclarados(folhaSintetica(
    '.grande { background: #ffffff; color: #8a5a12; font-size: 28px; }\n' +
    '.herdado { background: #ffffff; color: #8a5a12; }\n',
  ));
  assert.deepEqual(
    conferidos.map((p) => p.teto),
    [3, 4.5],
    '28 px passa com 3,0; sem corpo declarado a régua pede 4,5',
  );
  assert.equal(conferidos[1].tamanhoHerdado, true);
});

test('contraste: o que não dá para conferir sai listado, com motivo, e não some', () => {
  const { conferidos, pulados } = paresDeclarados(folhaSintetica(
    '.opaco { background: #e6f4ea; color: #188038; }\n' +
    '.com-opacity { background: #ffffff; color: #111111; opacity: .55; }\n' +
    '.gradiente-ruim { background: linear-gradient(90deg, #111111, #10b981); color: #ffffff; }\n' +
    '.gradiente-bom { background: linear-gradient(90deg, #065f46, #047857); color: #ffffff; }\n',
  ));
  assert.deepEqual(
    conferidos.map((p) => p.seletor),
    ['.opaco', '.gradiente-bom'],
    'só o fundo sólido e o gradiente que passa em todas as paradas são conferidos',
  );
  assert.deepEqual(
    pulados.map((p) => [p.seletor, p.familia]),
    [
      ['.com-opacity', 'regra com opacity'],
      ['.gradiente-ruim', 'gradiente com pior parada abaixo do teto'],
    ],
    'cada par fora da aritmética tem família e motivo — inclusive o gradiente, que mostra o número',
  );
  assert.match(pulados[1].motivo, /pior parada em 2\.54/, 'o número fica à vista no relatório');
});

test('contraste: fundo translúcido é composto contra quem pinta atrás', () => {
  // O par que existia e saía da conta por `rgba(...)`: agora tem número.
  const { conferidos, pulados } = paresDeclarados(folhaSintetica(
    '.translucido { background: rgba(24, 128, 56, .1); color: #188038; }\n',
  ));
  assert.deepEqual(pulados, [], 'nada ficou fora da conta');
  assert.equal(conferidos.length, 1);
  assert.equal(conferidos[0].contexto, 'escrito', 'sem nada mais pintando, a base é o canvas');
  // #188038 sobre o filme verde a 10% em cima do branco: a superfície composta é
  // rgb(232, 242, 235) e a razão cai de 4,62 (branco puro) para 4,38. É isso que
  // compor muda: o filme do próprio tom aperta o par.
  assert.equal(Number(conferidos[0].razao.toFixed(2)), 4.38);

  // A composição é o que a régua tem de ver: tinta clara dentro de superfície
  // clara escura. Sem compor, este par (o caso do chip `is-arena` no topbar)
  // passava em AA contra o branco.
  const { conferidos: dentro } = paresDeclarados(folhaSintetica(
    '.topbar-escuro { background: #071f49; }\n' +
    '.topbar-escuro .chip { background: rgba(255, 255, 255, .08); color: #0b57d0; font-size: 11px; }\n' +
    '.claro .chip-claro { background: #ffffff; color: #0b57d0; font-size: 11px; }\n',
  ));
  const chip = dentro.find((p) => p.seletor === '.topbar-escuro .chip');
  assert.equal(chip.contexto, 'escrito');
  assert.equal(chip.ok, false, 'azul de marca sobre o topbar escuro não passa — e antes nem era medido');
  // O filme branco a 8% sobre o navy dá rgb(27, 49, 88); o azul de marca ali fica
  // em 2,02 — exatamente a ordem de grandeza do chip `is-arena` que a captura não
  // pegou. Contra o branco puro o mesmo par mediria 5,9.
  assert.equal(Number(chip.razao.toFixed(2)), 2.02);
  const claro = dentro.find((p) => p.seletor === '.claro .chip-claro');
  assert.equal(claro.ok, true, 'o mesmo chip em superfície clara continua passando');
});

test('contraste: a tinta pode vir numa regra e o fundo em outra da MESMA chave', () => {
  // O caso real de 16/09: o corte das declarações mortas apagou um fundo que nunca
  // pintou, e a tinta — que mora em outra regra do mesmo seletor — ficou sem par e
  // fora da conta. A cascata junta as duas, então o elemento pinta as duas.
  const { conferidos, pulados } = paresDeclarados(folhaSintetica(
    '.selo { background: #fef2ca; }\n' +
    '.selo { color: #b07e00; font-size: 11px; font-weight: 700; }\n',
  ));
  assert.deepEqual(pulados, [], 'nada ficou fora da conta');
  assert.equal(conferidos.length, 1);
  assert.equal(conferidos[0].seletor, '.selo');
  assert.equal(conferidos[0].contexto, 'escrito', 'o fundo da chave está resolvido: não é candidato');
  // Mesmo par do controle de pseudo-elemento (3,22), agora repartido em duas
  // regras: o número não pode depender de a tinta e o fundo dormirem no mesmo
  // corpo de regra.
  assert.equal(Number(conferidos[0].razao.toFixed(2)), 3.22);
  assert.equal(conferidos[0].ok, false, 'e o veredito é o mesmo: abaixo do teto');
  assert.match(conferidos[0].fundo, /mesma chave/, 'o relatório diz de onde veio o fundo');

  // E o fundo da chave pode vir de OUTRA FOLHA, carregada depois: é o arranjo real
  // (tinta em `app-authorial.css`, fundo em `design.css`).
  const { conferidos: entreFolhas } = paresDeclarados([
    { nome: 'base.css', ordem: 0, texto: '.cta { color: #ffffff; }\n' },
    { nome: 'tema.css', ordem: 1, texto: '.cta { background: #065f46; }\n' },
  ]);
  assert.equal(entreFolhas.length, 1);
  assert.equal(entreFolhas[0].contexto, 'escrito');
  assert.equal(Number(entreFolhas[0].razao.toFixed(2)), 7.68, 'branco sobre o fundo que a chave pinta');
});

test('contraste: tinta sem fundo na chave sai contada, com família própria', () => {
  // A régua compõe com quem pinta na chave. Quando não há fundo nenhum ali, não há
  // com o que compor — e é isso que o número diz, em vez de a regra sumir: 431
  // regras vivas estão nesta família, e a contagem é catraca.
  const { conferidos, pulados } = paresDeclarados(folhaSintetica(
    '.so-tinta { color: #333333; font-size: 13px; }\n' +
    '.com-fundo { background: #ffffff; color: #333333; font-size: 13px; }\n',
  ));
  assert.deepEqual(conferidos.map((p) => p.seletor), ['.com-fundo']);
  assert.deepEqual(
    pulados.map((p) => [p.seletor, p.familia]),
    [['.so-tinta', 'tinta sem fundo na chave']],
    'a regra que só declara tinta entra na contagem, não no silêncio',
  );
});

test('contraste: seletor que não diz onde vive é medido sobre as superfícies plausíveis', () => {
  const { conferidos } = paresDeclarados(folhaSintetica(
    '.solto { background: rgba(0, 0, 0, .06); color: #111111; }\n' +
    '.superficie-escura { background: #071f49; }\n' +
    '.superficie-clara { background: #ffffff; }\n',
  ));
  const solto = conferidos.find((p) => p.seletor === '.solto');
  assert.equal(solto.contexto, 'candidato', 'há superfícies concorrendo e o seletor não diz qual');
  assert.equal(solto.ok, true, 'passa em alguma superfície: quem decide é a tela');
  assert.ok(solto.razaoPior < solto.razao, 'a pior superfície fica registrada, não escondida');

  // E reprova quando reprova em TODAS: tinta clara sobre filme claro, com as
  // superfícies do sistema todas claras.
  const { conferidos: todasClaras } = paresDeclarados(folhaSintetica(
    '.solto { background: rgba(255, 255, 255, .1); color: #ffffff; font-size: 11px; }\n' +
    '.superficie-clara { background: #ffffff; }\n' +
    '.outra-clara { background: #f1f3f4; }\n',
  ));
  const branco = todasClaras.find((p) => p.seletor === '.solto');
  assert.equal(branco.contexto, 'candidato');
  assert.equal(branco.ok, false, 'branco sobre claro em toda superfície possível reprova');
});

test('contraste: regra que perde a cascata não vira par conferido', () => {
  // Duas regras para a mesma chave: a segunda manda. A primeira não está em tela
  // nenhuma, e medi-la seria inventar um problema que ninguém vê.
  const { conferidos, pulados } = paresDeclarados(folhaSintetica(
    '.link { color: #d93025; background: transparent; }\n' +
    '.link { color: #0052ff; background: transparent; }\n',
  ));
  assert.deepEqual(conferidos.map((p) => p.tinta), ['#0052ff'], 'só a declaração que vence entra');
  assert.deepEqual(
    pulados.map((p) => [p.seletor, p.familia]),
    [['.link', 'regra que perde a cascata']],
    'a que perdeu fica listada com motivo, em vez de sumir',
  );
});

test('contraste: pseudo-elemento é caixa dentro do elemento, não camada de trás', () => {
  // O pontinho de um `::before` dentro do item não é o que está atrás do texto:
  // tratá-lo como camada pintava a lista inteira de verde escuro.
  const { conferidos } = paresDeclarados(folhaSintetica(
    '.item::before { content: "*"; background: #065f46; }\n' +
    '.item { background: rgba(24, 128, 56, .1); color: #136c2f; font-size: 13px; }\n',
  ));
  const item = conferidos.find((p) => p.seletor === '.item');
  assert.ok(item, 'o par do item existe');
  assert.ok(item.razao > 5, `o pontinho não pode escurecer a superfície do texto (veio ${item.razao.toFixed(2)})`);
});

// --- a guarda sobre as folhas vivas -------------------------------------------

test('css: nenhum par declarado das folhas vivas fica abaixo do teto AA', () => {
  const { conferidos, pulados } = paresDeclarados(lerFolhas());

  // Um parser que parasse de enxergar as folhas deixaria a lista vazia e a
  // guarda passaria sem guardar nada.
  assert.ok(
    conferidos.length >= 150,
    `só ${conferidos.length} par(es) declarado(s) encontrado(s) nas folhas vivas: o leitor deixou de enxergar alguma folha`,
  );
  assert.ok(pulados.length > 0, 'nenhum par fora da aritmética: o classificador deixou de classificar');

  const falhas = conferidos.filter((p) => !p.ok).sort((a, b) => a.razao - b.razao);
  assert.equal(
    falhas.length,
    0,
    `${falhas.length} de ${conferidos.length} par(es) declarado(s) abaixo do teto AA:\n` +
      `${relatarConferidos(falhas, 40)}\n\n` +
      'Tinta e fundo que o mesmo elemento pinta têm de passar no teto AA (4,5 em texto normal, 3,0 em\n' +
      'texto grande) — estejam no mesmo corpo de regra ou em regras da mesma chave (media + seletor), que\n' +
      'é o que o elemento pinta de verdade. Escureça a tinta ou clareie o fundo — é mudança de cor, não\n' +
      'de marcação, e o portão 2 diz se ela chegou a alguma tela. Fundo translúcido não é desculpa: a\n' +
      'régua compõe as camadas até o que está atrás, e reprova. A tinta que mora sozinha numa regra\n' +
      'também entra: o fundo dela é o que a MESMA chave (media + seletor) pinta, em qualquer folha. Se o\n' +
      'par é de um estado que não deve ser lido, tire a tinta ou o fundo da regra em vez de afrouxar o\n' +
      'teto aqui.\n\n' +
      `Pares fora da aritmética, por motivo (a catraca logo abaixo guarda a contagem):\n${relatarPulados(pulados, 20)}`,
  );
});

test('css: a contagem de pares fora da aritmética é a do instantâneo (catraca)', () => {
  // Esta é a outra metade da guarda: um selo novo com fundo translúcido — como o
  // chip de modo que caiu no topbar escuro da TV a 2,12 — não é conferido por
  // aritmética, e sem a catraca entraria sem ninguém ver.
  const { conferidos, pulados } = paresDeclarados(lerFolhas());
  const arredondar = (numero) => Math.round(numero * 100) / 100;
  // O piso conta só os pares de contexto `escrito`: a medida de um `candidato` é
  // contra uma superfície escolhida entre centenas, e misturar as duas populações
  // compararia coisas diferentes.
  const escritos = conferidos.filter((p) => p.contexto === 'escrito');
  const piso = arredondar(Math.min(...escritos.map((p) => p.razao)));
  const porContexto = {};
  for (const p of conferidos) porContexto[p.contexto] = (porContexto[p.contexto] || 0) + 1;
  const atual = {
    conferidos: conferidos.length,
    contexto: Object.fromEntries(Object.entries(porContexto).sort()),
    piso,
    pulados: contagemPorFamilia(pulados),
  };

  if (atualizar) {
    writeFileSync(CATRACA, `${JSON.stringify(atual, null, 2)}\n`);
    return;
  }

  const esperado = JSON.parse(readFileSync(CATRACA, 'utf8'));
  // Par conferido novo não precisa de catraca: o teto AA acima já o reprova se
  // for ilegível. A catraca olha para o OUTRO lado — o que a aritmética não
  // alcança. Ainda assim o total não pode CAIR: uma queda de duas dezenas é
  // parser cego ou família de regras apagada, e nenhuma das duas deve passar por
  // baixo do radar de um teste de contraste.
  assert.ok(
    atual.conferidos >= esperado.conferidos,
    `os pares conferidos caíram de ${esperado.conferidos} para ${atual.conferidos}: ` +
      'ou o leitor deixou de enxergar uma folha, ou uma família de regras com tinta e fundo saiu do arquivo',
  );

  // O PISO é o outro lado da catraca, e é o análogo do teto de palavras: o menor
  // contraste medido entre os pares conferidos vira o mínimo aceito. Subir é de
  // graça (quem passa a passar não incomoda ninguém); cair significa que um par
  // ficou mais apertado, e apertado demais é como o sistema chega em 4,50 — no
  // limite exato, sem folga nenhuma para o próximo ajuste de paleta. O que se
  // quer do autor aqui não é regenerar: é abrir de novo a folga do par que caiu.
  assert.ok(
    atual.piso >= esperado.piso,
    `o piso de contraste caiu de ${esperado.piso} para ${atual.piso}:\n` +
      `${relatarConferidos([...escritos].sort((a, b) => a.razao - b.razao).slice(0, 5), 5)}\n\n` +
      `O piso é o menor contraste entre os ${escritos.length} pares de contexto escrito — a folga real do\n` +
      'sistema sobre o teto AA. Escureça a tinta (ou clareie a superfície) do par que desceu até o piso\n' +
      'voltar, em vez de regravar o instantâneo. Se for mesmo impossível, o caminho declarado é tirar o\n' +
      'par da aritmética de propósito (imagem de fundo, `background-clip: text`, `opacity`) e dizer isso\n' +
      'no commit.\n',
  );

  // A distribuição por contexto é catraca também: um par que deixa de ter a
  // ancestralidade escrita (ou que passa a ter camada ambígua) muda de contexto e
  // aparece aqui, em vez de mudar de número sem ninguém ver.
  const contextos = [...new Set([...Object.keys(esperado.contexto || {}), ...Object.keys(atual.contexto)])].sort();
  const diferencasDeContexto = contextos
    .filter((c) => (esperado.contexto?.[c] || 0) !== (atual.contexto[c] || 0))
    .map((c) => `  ${c}: ${esperado.contexto?.[c] || 0} -> ${atual.contexto[c] || 0}`);
  assert.deepEqual(
    diferencasDeContexto,
    [],
    `a distribuição dos pares conferidos por contexto mudou:\n${diferencasDeContexto.join('\n')}\n\n` +
      '`escrito` é o par cuja ancestralidade está no seletor (ou cuja camada mais externa é opaca);\n' +
      '`candidato` é o que foi medido sobre as superfícies plausíveis do sistema. Se a diferença é\n' +
      'intencional, regrave:\n  UPDATE_CSS_BASELINE=1 npm test\n',
  );

  const familias = [...new Set([...Object.keys(esperado.pulados), ...Object.keys(atual.pulados)])].sort();
  const diferencas = familias
    .filter((familia) => (esperado.pulados[familia] || 0) !== (atual.pulados[familia] || 0))
    .map((familia) => `  ${familia}: ${esperado.pulados[familia] || 0} -> ${atual.pulados[familia] || 0}`);

  assert.deepEqual(
    diferencas,
    [],
    `a contagem de pares fora da aritmética mudou:\n${diferencas.join('\n')}\n\n` +
      `Agora, por família:\n${relatarPulados(pulados, 20)}\n\n` +
      'Diferença aqui quase sempre é um par novo que a aritmética não alcança — fundo translúcido,\n' +
      'gradiente, imagem de fundo, `opacity` — ou uma regra que declara só a tinta e não tem fundo\n' +
      'declarado na chave (`tinta sem fundo na chave`: ali não há com o que compor). Ele não foi\n' +
      'reprovado por teto nenhum: foi CONTADO.\n' +
      'Olhe o par (se for de estado vivo, `node output/qa/probe-contraste.mjs` mede o pixel) e, se\n' +
      'estiver bom, registre a contagem nova:\n' +
      '  UPDATE_CSS_BASELINE=1 npm test\n',
  );
});
