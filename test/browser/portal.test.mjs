import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { ESPERA, abrirNavegador, abrirPagina, carregar } from '../support/navegador.mjs';

// A home é a única tela que o professor, o aluno e a TV atravessam juntos — e
// era a única sem teste de navegador. O que se prova aqui:
//
//   1. as três portas do produto estão na tela, cada uma apontando para a
//      superfície dela;
//   2. a porta do professor leva ao login do painel (a do aluno e a da TV não
//      são clicadas de propósito: `/play` e `/tv.php` já têm testes próprios, e
//      o que pode quebrar numa edição da home é o ENDEREÇO, que o teste de Node
//      confere por `href`);
//   3. as portas ficam na mesma linha no notebook e empilham no celular, sem
//      rolagem horizontal em nenhum dos dois — a home clássica já travou por
//      causa disso (`body,html{overflow:hidden}` global);
//   4. a composição do hero é a da referência LA-01, e na ordem dela: lockup,
//      a linha que explica o produto, a linha de ações e a faixa de prova;
//   5. a ação de entrada recebe foco de teclado visível.
//
// O QUE MUDOU (a régua foi devolvida à intenção, não ao desenho): as três
// portas eram três CARTÕES (`.portal-role`, com micro-rótulo, título e ação) e a
// tela abria por eles. A home voltou à composição da referência e as três portas
// passaram a ser as três AÇÕES da linha; o que os cartões diziam é hoje o rótulo
// de cada ação ("Painel do professor", "Projeção da TV"). As asserções de
// destino, altura de alvo de toque, ordem de linha, foco e rolagem continuam as
// mesmas — mudou o seletor de que falam.
test('browser: a home apresenta as três portas e leva cada uma ao seu lugar', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    adminPassword: 'portal-test-password',
    adminSecret: 'portal-test-secret-at-least-32-characters',
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const problemas = [];
    page.on('pageerror', (erro) => problemas.push(`pageerror: ${erro.message}`));
    page.on('console', (mensagem) => {
      if (mensagem.type() === 'error') problemas.push(`console: ${mensagem.text()}`);
    });

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await carregar(page, `${base}/`);

    // 1. As três portas, na ordem em que a tela as lê, cada uma com o destino certo.
    const portas = await page.evaluate(() => [...document.querySelectorAll('.portal-actions .portal-enter')].map((item) => ({
      acao: item.textContent.trim(),
      destino: item.getAttribute('href'),
      caixa: item.getBoundingClientRect().toJSON(),
      acaoCaixa: item.getBoundingClientRect().toJSON(),
    })));
    assert.equal(portas.length, 3, 'a home tem de mostrar as três portas');
    assert.deepEqual(
      portas.map((porta) => porta.destino),
      ['/play', '/admin-arena.php', '/tv.php'],
      'cada porta aponta para a superfície dela, na ordem aluno, professor, TV',
    );
    for (const porta of portas) {
      assert.ok(porta.acao, `porta sem rótulo: ${JSON.stringify(porta)}`);
      // Área de toque (§10): 48 px de altura é o piso da casa para alvo de
      // dedo — o mesmo piso que o botão da faixa da TV usa.
      assert.ok(
        porta.acaoCaixa.height >= 44,
        `ação de "${porta.acao}" com ${porta.acaoCaixa.height} px de altura — abaixo do alvo de toque`,
      );
      assert.ok(porta.acaoCaixa.width >= 120, `ação de "${porta.acao}" estreita demais (${porta.acaoCaixa.width} px)`);
    }
    // Nenhum texto cortado: o rótulo pode quebrar, mas o que sobra dentro da
    // caixa tem de caber (a mesma régua que já morde no título da TV).
    // O LOCKUP fica de fora desta lista de propósito: ele é um bloco de duas
    // linhas com `line-height` apertado (0.88), então o `scrollHeight` dele é
    // maior que a caixa por construção — a régua de rolagem acusaria a tinta de
    // fora da linha, que não é texto cortado. O que importa nele é caber no
    // CARTÃO, e é isso que a asserção seguinte mede.
    const cortados = await page.evaluate(() => [...document.querySelectorAll('.portal-actions .portal-enter, .portal-hero-tagline, .portal-proof b, .portal-proof span')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
      .map((node) => node.textContent.trim()));
    assert.deepEqual(cortados, [], 'texto cortado na home');
    const lockupDentro = await page.evaluate(() => {
      const cartao = document.querySelector('.portal-hero').getBoundingClientRect();
      const lockup = document.querySelector('.portal-hero-headline').getBoundingClientRect();
      return {
        dentro: lockup.top >= cartao.top - 1 && lockup.bottom <= cartao.bottom + 1,
        altura: Math.round(lockup.height),
      };
    });
    assert.ok(lockupDentro.dentro, 'o lockup saiu do cartão da home');
    assert.ok(lockupDentro.altura > 0, 'o lockup ficou com altura zero');

    // 2. A composição do hero é a da referência, na ordem dela: marca, lockup,
    //    a linha que explica o produto, as ações e a faixa de prova. Sem a
    //    ordem, uma volta aos cartões de papel passaria despercebida.
    const ordem = await page.evaluate(() => {
      const hero = document.querySelector('.portal-hero');
      const marcas = ['.portal-hero-brand', '.portal-hero-headline', '.portal-hero-tagline', '.portal-actions', '.portal-proof'];
      return marcas.map((sel) => {
        const node = hero.querySelector(sel);
        return node ? Math.round(node.getBoundingClientRect().top) : null;
      });
    });
    assert.ok(ordem.every((top) => top !== null), `bloco do hero faltando (${JSON.stringify(ordem)})`);
    assert.deepEqual(
      [...ordem].sort((a, b) => a - b),
      ordem,
      `a ordem dos blocos do hero mudou: ${JSON.stringify(ordem)}`,
    );

    // 3. Lado a lado no notebook: as três na mesma linha.
    const linhas = new Set(portas.map((porta) => Math.round(porta.caixa.top)));
    assert.equal(linhas.size, 1, `as portas deviam ficar na mesma linha em 1440 (saíram ${linhas.size} linhas)`);

    // 4. Foco de teclado visível na ação de entrada do aluno.
    const foco = await page.evaluate(() => {
      const botao = document.querySelector('.portal-actions .portal-enter[href="/play"]');
      botao.focus();
      const estilo = getComputedStyle(botao);
      return {
        focado: document.activeElement === botao,
        contorno: `${estilo.outlineStyle} ${estilo.outlineWidth} ${estilo.outlineColor}`,
      };
    });
    assert.ok(foco.focado, 'a ação de entrada tem de receber foco');
    assert.doesNotMatch(foco.contorno, /none|0px/, `foco sem contorno visível: ${foco.contorno}`);

    // 5. Clique de verdade na porta do professor: chega no login do painel.
    await page.click('.portal-actions .portal-enter[href="/admin-arena.php"]');
    await page.waitForSelector('[data-admin-arena-login-panel]', { visible: true });
    assert.match(page.url(), /admin-arena\.php$/, `o clique devia levar ao painel, foi para ${page.url()}`);

    // 6. No celular as portas empilham, e nada rola para o lado.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await carregar(page, `${base}/`);
    const celular = await page.evaluate(() => ({
      linhas: [...document.querySelectorAll('.portal-actions .portal-enter')]
        .map((item) => Math.round(item.getBoundingClientRect().top)),
      rolagemLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      visiveis: [...document.querySelectorAll('.portal-actions .portal-enter')]
        .every((botao) => {
          const caixa = botao.getBoundingClientRect();
          return caixa.width > 0 && caixa.height > 0 && caixa.left >= -1 && caixa.right <= window.innerWidth + 1;
        }),
    }));
    assert.equal(new Set(celular.linhas).size, 3, 'em 390 as três portas empilham, uma por linha');
    assert.ok(celular.rolagemLateral <= 0, `a home rola para o lado em 390 (${celular.rolagemLateral} px)`);
    assert.ok(celular.visiveis, 'alguma ação saiu da largura da tela em 390');

    assert.deepEqual(problemas, [], 'a home produziu erro no console');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
