// Nenhuma fonte viva pode voltar a citar as rotas clássicas retiradas.
//
// O motivo é medido, não hipotético: quando /game.php, /main.php e /wall.php
// deixaram de existir, sobrou em `app.js` um `initIndex` que montava cartões com
// `href="game.php?station=N"` — link para uma rota que já respondia 404. Ninguém
// via, porque nenhuma página emitia o `[data-index-stations]` que o handler
// procurava, e a página servida continuava impecável. `pages.test.mjs` cobre o
// HTML servido; este cobre o resto: o JS que roda no navegador e o código que
// monta as páginas.
//
// A regra tem duas partes:
//   - **comentário pode citar a rota.** É registro do que saiu, e é assim que a
//     decisão continua legível daqui a seis meses. Por isso os comentários são
//     recortados antes da varredura — com respeito a strings, para `https://` não
//     engolir o resto da linha;
//   - **código só pode citar a rota comparando o `pathname` da requisição.** É o
//     caso do `/admin.php`, que o roteador redireciona para /admin-arena.php.
//     Qualquer outro uso — `href`, `fetch`, `redirect(...)` para a rota — reprova.
//
// Ficam fora da varredura, de propósito: `evidence/original-public/**` (a captura
// é o registro de fidelidade e precisa manter as rotas antigas inteiras), `docs/`,
// `tmp/` e os próprios testes — o `pages.test.mjs` existe justamente para afirmar
// que elas respondem 404.
//
// O `data-page` retirado é a outra ponta da mesma regra, e tem guarda dos dois
// lados: `test/css/cascata.test.mjs` recusa folha viva que declare
// `body[data-page=game|main|wall]`, e aqui se recusa página viva que marque o
// corpo com esses valores (ou JS vivo que os atribua). Sem as duas pontas, o
// Clássico volta inteiro sem ninguém notar — foi o que aconteceu uma vez: a
// camada clássica foi reintegr ada no renderer com 185 KB de CSS de superfície
// morta junto, e nada reprovou.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { fontesVivas } from '../support/classes-vivas.mjs';
import { renderPage } from '../../src/web/pages/index.mjs';

const RAIZ = new URL('../../', import.meta.url);

/** Rotas que o app serve hoje — as mesmas que os dois testes percorrem. */
const PAGINAS_VIVAS = [
  '/',
  '/index.php',
  '/play',
  '/tv.php',
  '/report.php',
  '/admin-arena.php',
  '/aluno-preview.php',
  '/tv-preview.php',
];
const RETIRADAS = ['game', 'main', 'wall', 'admin', 'join'];
// `admin-arena.php`, `tv-preview.php` e `aluno-preview.php` são vivas: o `\b` no
// fim impede que elas casem por acidente.
const ROTA = new RegExp(`\\b(${RETIRADAS.join('|')})\\.php\\b`, 'g');
// Comparar com o caminho da requisição é a única forma permitida de citar a rota.
const COMPARACAO_DE_PATHNAME = new RegExp(
  `pathname\\s*===?\\s*(['"\`])/?(?:${RETIRADAS.join('|')})\\.php\\1`,
);

/**
 * Recorta comentários preservando quebras de linha (para o número da linha do
 * relato continuar sendo o do arquivo) e strings (é dentro delas que a rota
 * aparece — e é justamente o que não pode escapar da varredura).
 */
function semComentarios(texto) {
  let saida = '';
  let estado = 'codigo';
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    const proximo = texto[i + 1];
    if (estado === 'codigo') {
      if (c === '/' && proximo === '/') {
        estado = 'linha';
        i += 2;
        continue;
      }
      if (c === '/' && proximo === '*') {
        estado = 'bloco';
        i += 2;
        continue;
      }
      if (c === "'") estado = 'simples';
      else if (c === '"') estado = 'dupla';
      else if (c === '`') estado = 'template';
      saida += c;
      i += 1;
      continue;
    }
    if (estado === 'linha') {
      if (c === '\n') {
        estado = 'codigo';
        saida += c;
      }
      i += 1;
      continue;
    }
    if (estado === 'bloco') {
      if (c === '*' && proximo === '/') {
        estado = 'codigo';
        i += 2;
      } else {
        if (c === '\n') saida += c;
        i += 1;
      }
      continue;
    }
    // Dentro de string: preserva o conteúdo, inclusive `\n` e `\`` escapados.
    if (c === '\\') {
      saida += c + (proximo ?? '');
      i += 2;
      continue;
    }
    if ((estado === 'simples' && c === "'") || (estado === 'dupla' && c === '"') || (estado === 'template' && c === '`')) {
      estado = 'codigo';
    }
    saida += c;
    i += 1;
  }
  return saida;
}

test('nenhuma fonte viva cita as rotas clássicas retiradas', () => {
  const achados = [];
  for (const arquivo of fontesVivas(RAIZ)) {
    const codigo = semComentarios(readFileSync(new URL(arquivo, RAIZ), 'utf8'));
    for (const { index } of codigo.matchAll(ROTA)) {
      const linha = codigo.slice(0, index).split('\n').length;
      const conteudo = codigo.split('\n')[linha - 1];
      if (COMPARACAO_DE_PATHNAME.test(conteudo)) continue;
      achados.push(`  ${arquivo}:${linha}\n    ${conteudo.trim()}`);
    }
  }
  assert.deepEqual(
    achados,
    [],
    `fonte viva citando rota retirada (${achados.length}):\n${achados.join('\n')}\n\n` +
      'As rotas /game.php, /main.php, /wall.php, /admin.php e /join.php não existem mais ' +
      '(ver o teste dos 404 em pages.test.mjs). Um comentário pode contar a história; ' +
      'código não pode apontar para lá — a única exceção é comparar o `pathname` da ' +
      'requisição, como o roteador faz com o /admin.php.',
  );
});

test('nenhuma página servida cita as rotas clássicas retiradas', () => {
  for (const pagina of PAGINAS_VIVAS) {
    const resposta = renderPage(pagina, { authenticated: true });
    const achados = [...new Set([...resposta.body.matchAll(ROTA)].map((m) => m[0]))];
    assert.deepEqual(achados, [], `${pagina}: markup servido aponta para rota retirada (${achados.join(', ')})`);
  }
});

// --- o outro lado: o `data-page` que essas páginas marcavam ------------------
//
// O valor de `data-page` é o que escolhia qual cliente rodava: `game` montava as
// sete telas do jogador, `main` a projeção, `wall` a parede, `join` a entrada
// por link. Com as rotas fora, ninguém mais pode marcar o corpo com eles — senão
// as regras de estilo (que a guarda de CSS recusa) voltariam a ter superfície.
const PAGINAS_RETIRADAS = ['game', 'main', 'wall', 'join'];
const VALORES = PAGINAS_RETIRADAS.join('|');
// O `(?![\w-])` no fim é o que separa `main` (retirado) de `main-arena`.
const ATRIBUTO_RETIRADO = new RegExp(`\\bdata-page\\s*=\\s*(["']?)(${VALORES})\\1(?![\\w-])`, 'g');
const ATRIBUICAO_RETIRADA = new RegExp(
  `dataset\\.page\\s*=\\s*['"](${VALORES})['"]|setAttribute\\(\\s*['"]data-page['"]\\s*,\\s*['"](${VALORES})['"]`,
  'g',
);

/** Acha o trecho e devolve o endereço legível (`arquivo:linha`) para o relato. */
function ocorrencias(codigo, arquivo, padroes) {
  const achados = [];
  for (const padrao of padroes) {
    padrao.lastIndex = 0;
    for (const achado of codigo.matchAll(padrao)) {
      const linha = codigo.slice(0, achado.index).split('\n').length;
      const conteudo = codigo.split('\n')[linha - 1].trim();
      achados.push(`  ${arquivo}:${linha}\n    ${conteudo}`);
    }
  }
  return achados;
}

test('nenhuma página servida marca o corpo com data-page retirado', () => {
  for (const pagina of PAGINAS_VIVAS) {
    const body = renderPage(pagina, { authenticated: true }).body;
    const achados = [...new Set([...body.matchAll(ATRIBUTO_RETIRADO)].map((m) => m[0].trim()))];
    assert.deepEqual(
      achados,
      [],
      `${pagina}: markup servido marca data-page de página retirada (${achados.join(', ')}) — ` +
        'o valor escolhe qual cliente roda; game/main/wall/join não têm mais página para servir.',
    );
  }
});

test('nenhuma fonte viva atribui data-page retirado', () => {
  const achados = [];
  for (const arquivo of fontesVivas(RAIZ)) {
    const codigo = semComentarios(readFileSync(new URL(arquivo, RAIZ), 'utf8'));
    achados.push(...ocorrencias(codigo, arquivo, [ATRIBUTO_RETIRADO, ATRIBUICAO_RETIRADA]));
  }
  assert.deepEqual(
    achados,
    [],
    `fonte viva marcando data-page de página retirada (${achados.length}):\n${achados.join('\n')}\n\n` +
      'O valor do atributo escolhe o cliente que roda; game/main/wall/join saíram com as ' +
      'rotas /game.php, /main.php, /wall.php e /join.php. A guarda de CSS recusa as regras ' +
      'desses escopos em test/css/cascata.test.mjs.',
  );
});

test('o detector reconhece o data-page da captura (controle positivo)', () => {
  // Prova que a varredura vê o valor quando ele existe: a captura do site base é
  // markup real, com o corpo marcado como `game`. Sem este controle, um regex que
  // nunca casa passaria nos dois testes acima e não guardaria nada.
  const capturada = readFileSync(
    new URL('../../evidence/original-public/game/station-1.html', import.meta.url),
    'utf8',
  );
  const achados = [...new Set([...capturada.matchAll(ATRIBUTO_RETIRADO)].map((m) => m[2]))];
  assert.deepEqual(achados, ['game'], 'a captura marca data-page="game": é este valor que a varredura tem de encontrar');
});
