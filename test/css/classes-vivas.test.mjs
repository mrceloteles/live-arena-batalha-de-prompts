// Guarda sem navegador: nenhuma folha viva pode ter seletor de classe que
// nenhuma fonte viva produz.
//
// Por que ela existe: a faxina de CSS provou, por medo de perder tela, que tirar
// do disco 711 compostos mortos (162 classes sem produtor) não mudou um pixel —
// os retratos do portão 2 ficaram byte a byte idênticos. O medo era o certo:
// a camada clássica já tinha voltado uma vez inteira, com 185 KB de CSS de
// superfície morta junto, e nada reprovou. Sem guarda, a próxima sobra volta do
// mesmo jeito — e CSS morto não dói até alguém tentar mexer nele.
//
// Por que ela NÃO precisa de navegador: o instrumento da faxina cruzava o DOM
// das telas vivas com as fontes que montam tela. Rodado só com as fontes, o
// resultado de hoje continua zero — ou seja, o que sobrou é produzível só pelo
// código que roda, e a fonte sozinha responde com exatidão. O DOM entrava para
// pegar a classe montada por concatenação; para isso basta a regra do prefixo de
// interpolação (`arena-tv-${estado}` libera `.arena-tv-pulse`), que é de graça.
//
// A régua é conservadora na dúvida: o nome pode vir de variável, concatenação ou
// interpolação, então a busca é por substring no texto cru, comentário incluído.
// Um comentário que cite uma classe só faz a regra ficar; nunca faz uma regra
// viva ser acusada. O preço conhecido: `.card` passa se a palavra `card`
// aparecer em qualquer lugar — inclusive dentro de outra palavra.
//
// A folha capturada `app.css` fica fora de propósito: ela não é carregada por
// página nenhuma (é contrato do `evidence/manifest.json`), e a captura precisa
// manter as classes clássicas inteiras.
//
// O que esta guarda NÃO vê: seletor sem classe (tipo, atributo, pseudo) nunca é
// condenado — `body`, `[data-admin-panel]` e `:hover` casam sem classe nenhuma.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FOLHAS } from '../support/cascata-css.mjs';
import {
  compostosSemProdutor,
  fontesVivas,
  lerFontes,
  relatar,
} from '../support/classes-vivas.mjs';

const RAIZ = new URL('../../', import.meta.url);

const lerFolhas = () =>
  FOLHAS.map((folha) => ({
    ...folha,
    texto: readFileSync(new URL(`public/assets/css/${folha.nome}`, RAIZ), 'utf8'),
  }));

test('css: nenhuma folha viva tem seletor de classe sem produtor', () => {
  const folhas = lerFolhas();
  const { achados, analisados, porFolha, prefixos } = compostosSemProdutor(folhas, lerFontes(RAIZ));

  // Se o parser parar de enxergar uma folha, `achados` fica vazio pelo motivo
  // errado — e a guarda passaria sem guardar nada.
  for (const folha of folhas) {
    assert.ok(
      porFolha[folha.nome] > 0,
      `${folha.nome}: nenhum seletor de classe reconhecido — o parser deixou de enxergar a folha`,
    );
  }
  assert.ok(analisados > 0, 'nenhum seletor de classe analisado nas cinco folhas');

  assert.equal(
    achados.length,
    0,
    `folha viva com seletor de classe que nenhuma fonte viva produz (${achados.length} de ${analisados}):\n` +
      `${relatar(achados)}\n\n` +
      `Toda classe exigida por um seletor tem de aparecer em alguma fonte viva (` +
      `src/** ou public/assets/js/**), inteira ou como prefixo de interpolação ` +
      `(\`arena-tv-\${estado}\` libera .arena-tv-*) — prefixos em uso: ${prefixos.join(', ') || '(nenhum)'}.\n` +
      'Classe sem produtor é superfície morta: nenhuma tela pode casar com ela, então a regra ' +
      'não faz nada além de pesar e confundir quem for mexer no arquivo.\n' +
      'Se a faxina tirou a marcação e esqueceu a regra, apague a regra (o portão 2 prova que a ' +
      'tela não muda: `npm run test:browser`). A folha é minificada e a lista de seletores é ' +
      'compartilhada, então o recorte é por composto: `node scripts/remover-css-morto.mjs ' +
      '--apply <classe>` tira só o pedaço condenado e preserva os vizinhos da mesma regra. ' +
      'Se a classe é montada por dado, o prefixo tem de ' +
      'aparecer no código que a monta — é o que libera a família inteira.',
  );
});

test('css: o detector condena a classe sem produtor e poupa a produzida (controle positivo)', () => {
  // Sem este controle, um predicado que nunca condenasse nada passaria na guarda
  // acima e não guardaria nada. Aqui as fontes são as de verdade e a folha é
  // sintética, com um seletor vivo (`.portal-shell`, que o portal emite) ao lado
  // de um inventado.
  const { achados, analisados } = compostosSemProdutor(
    [
      {
        nome: 'sintetica.css',
        texto:
          '.portal-shell { color: red }\n' +
          '.nao-existe-em-fonte-nenhuma-9f3c { color: red }\n' +
          '.portal-shell .nao-existe-em-fonte-nenhuma-9f3c { color: red }\n',
      },
    ],
    lerFontes(RAIZ),
  );
  assert.equal(analisados, 3);
  assert.deepEqual(
    achados.map((a) => a.composto),
    ['.nao-existe-em-fonte-nenhuma-9f3c', '.portal-shell .nao-existe-em-fonte-nenhuma-9f3c'],
    'o detector tem de acusar só os seletores que exigem a classe inventada',
  );
});

test('css: o prefixo de interpolação libera a família, não qualquer classe (controle do predicado)', () => {
  // A regra que substitui o DOM do navegador. A fonte monta `arena-tv-${estado}`
  // e nada mais: `.arena-tv-pulse` tem produtor (a família está aberta),
  // `.arena-pulse` não tem — e tem de ser condenada, senão a guarda viraria uma
  // porta aberta para qualquer classe a começar por um hífen qualquer.
  const fontes = [{ arquivo: 'sintetica.mjs', texto: 'el.className = `arena-tv-${estado}`;\n' }];
  const { achados } = compostosSemProdutor(
    [{ nome: 'sintetica.css', texto: '.arena-tv-pulse { color: red }\n.arena-pulse { color: red }\n' }],
    fontes,
  );
  assert.deepEqual(
    achados.map((a) => a.composto),
    ['.arena-pulse'],
  );
});

test('css: classe dentro de :not() não condena o seletor', () => {
  // Em `:not(.x)` a classe é condição de AUSÊNCIA: o elemento tem de NÃO ter
  // `.x`. Ela não é exigida pela regra, então não pode condená-la — e a folha ao
  // lado prova que o detector continua condenando a mesma classe quando ela é
  // exigida de verdade.
  const fontes = [{ arquivo: 'sintetica.mjs', texto: "el.classList.add('arena-tv');\n" }];
  const { achados } = compostosSemProdutor(
    [
      {
        nome: 'sintetica.css',
        texto:
          '.arena-tv:not(.turma-antiga) { color: red }\n' +
          '.arena-tv:where(:not(.turma-antiga)) { color: red }\n' +
          '.turma-antiga { color: red }\n',
      },
    ],
    fontes,
  );
  assert.deepEqual(
    achados.map((a) => a.composto),
    ['.turma-antiga'],
  );
});

test('css: a varredura enxerga o renderer e o cliente, e nenhum teste (guarda da guarda)', () => {
  // Uma lista de fontes quebrada (glob errado, diretório renomeado) faria a
  // guarda condenar tudo de uma vez — mas o inverso também é possível: fontes
  // demais (testes, captura) fariam a guarda perdoar CSS morto sem avisar.
  const arquivos = fontesVivas(RAIZ);
  assert.ok(
    arquivos.some((arquivo) => arquivo.startsWith('src/web/')),
    'o renderer (src/web/**) não entrou na varredura — as páginas são montadas lá',
  );
  assert.ok(
    arquivos.filter((arquivo) => arquivo.startsWith('public/assets/js/')).length >= 2,
    'o cliente (public/assets/js/**) não entrou na varredura — a arena monta DOM ali',
  );
  assert.ok(
    arquivos.some((arquivo) => /^src\/server\//.test(arquivo)),
    'o servidor (src/server/**) não entrou na varredura — ele também devolve markup',
  );
  assert.deepEqual(
    arquivos.filter((arquivo) => arquivo.startsWith('test/') || arquivo.startsWith('evidence/')),
    [],
    'testes e captura não são fonte viva: o teste não prova tela e a captura é o registro do site base',
  );
});
