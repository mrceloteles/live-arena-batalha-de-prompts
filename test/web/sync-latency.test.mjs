// O relógio da projeção clássica virou registro, não código vivo.
//
// Ele media a fidelidade do cliente clássico — o que mantinha o relógio da
// projeção a 250 ms de tique no site base. Esse cliente morava em
// `public/assets/js/app.js` e foi baixado por quem abria o portal (`/`) e o
// relatório (`/report.php`); as telas que ele servia (/game.php, /main.php e
// /wall.php) respondem 404 desde a retirada da camada clássica do renderer.
//
// Então o sujeito do teste passou a ser a captura congelada em
// `evidence/original-public/` — o registro do que o site base fazia —, e o
// segundo teste guarda o outro lado da decisão: o app vivo não pode voltar a
// carregar o cliente clássico sem alguém perceber.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vivo = await readFile(new URL('../../public/assets/js/app.js', import.meta.url), 'utf8');
const capturado = await readFile(
  new URL('../../evidence/original-public/public/assets/js/app.js', import.meta.url),
  'utf8',
);

/** Intervalos de 250 ms declarados no arquivo — o tique do relógio da projeção. */
const tiques = (texto) => [...texto.matchAll(/setInterval\([^\n]+,\s*250\)/g)].length;

test('classic timer projection keeps the captured 250 ms tick', () => {
  assert.ok(
    tiques(capturado) >= 3,
    `a captura do cliente clássico guarda pelo menos três tiques de 250 ms, achou ${tiques(capturado)}`,
  );
});

test('o app vivo não carrega mais o cliente clássico', () => {
  assert.equal(
    tiques(vivo),
    0,
    'nenhum tique de 250 ms deve voltar ao app vivo: os relógios do cliente clássico saíram com /game.php, /main.php e /wall.php',
  );
});
