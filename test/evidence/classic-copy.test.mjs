import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderPage } from '../../src/web/pages/index.mjs';

// O sujeito destes testes é a CAPTURA do site-base, não uma rota viva: o
// Clássico (jogador, tela principal e parede de ranking) saiu do renderer, então
// /game.php, /main.php e /wall.php respondem 404 — ver test/web/pages.test.mjs.
// A cópia clássica continua congelada e provada; o que não existe mais é uma
// superfície da aplicação que a sirva.
const game = readFileSync(
  new URL('../../evidence/original-public/game/station-1.html', import.meta.url),
  'utf8',
);

test('the classic player route is not served by the application', () => {
  assert.equal(renderPage('/game.php?station=1&mode=wait_all').status, 404);
  assert.equal(renderPage('/main.php').status, 404);
  assert.equal(renderPage('/wall.php').status, 404);
});

test('the captured classic player page preserves the instructional sequence', () => {
  for (const text of [
    'Seu cadastro está concluído!',
    'Agora é só aguardar os outros jogadores entrarem na batalha.',
    'Serão 3 rounds, 3 desafios.',
    'Em cada rodada, você verá uma imagem, seu desafio é chegar o mais perto possível do prompt original que a gerou.',
    'Leia os detalhes, seja estratégico e afiado. Aqui, precisão é tudo.',
    'Quem chegar mais próximo do prompt correto nas 3 rodadas leva o título.',
    'Prepare-se, a batalha vai começar!',
    'Observe a imagem e descreva o prompt que você acredita que foi usado para gerá-la.',
    'O próximo round já vai começar, prepare-se!',
  ]) {
    assert.ok(game.includes(text), `missing captured classic copy: ${text}`);
  }
});

test('the captured classic player page preserves the limits and labels', () => {
  assert.match(game, /maxlength="4000"/);
  assert.match(game, />Entrar no ringue!<\/button>/);
  assert.match(game, />Pronto para a batalha!<\/button>/);
  assert.match(game, />Enviar Resposta<\/span>/);
  assert.match(game, /data-timer>02:30<\/strong>/);
});
