// "Abrir sala" é o começo da aula: a sala passa a receber alunos E o telão entra
// junto. Sem isso, o professor abre a sala e fica com o código na frente de um
// monitor que ninguém está vendo — que é exatamente o que se descobriu na aula
// real, e o motivo desta frente.
//
// O que este portão cobra:
//
//   1. "Abrir sala" (o botão da AÇÃO DA VEZ, no cabeçalho da sala em destaque —
//      a lista seleciona, o destaque comanda) abre a projeção da SALA CERTA em
//      outra aba. A aba nasce no gesto do clique e só recebe o endereço depois —
//      se abrisse depois do `await`, o navegador bloquearia, e é a segunda
//      checagem: com a janela bloqueada, o diálogo de projeção (com código, QR e
//      o botão de abrir aqui) é quem aparece. Nunca as duas.
//   2. O telão anuncia quando os lugares estão preenchidos ("Todos estão
//      prontos") e volta a "Aguardando o professor iniciar" quando não estão —
//      o mesmo dado que o painel mostra, na língua da parede.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const SENHA = 'abrir-sala-password';

test('"Abrir sala" abre o telão da sala certa, e o telão anuncia a turma pronta', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    eventHub: createRoomEventHub(),
    adminPassword: SENHA,
    adminSecret: 'abrir-sala-secret-at-least-32-chars',
  }));
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  let navegador;
  try {
    let cookie = '';
    const post = async (acao, carga = {}) => {
      const resposta = await fetch(`${base}/api.php?action=${acao}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(carga),
      });
      const set = resposta.headers.getSetCookie?.()[0] || resposta.headers.get('set-cookie') || '';
      const achado = /arena_admin=([^;]+)/.exec(set);
      if (achado) cookie = `arena_admin=${achado[1]}`;
      const corpo = await resposta.json();
      assert.equal(resposta.status, 200, `${acao}: ${JSON.stringify(corpo)}`);
      return corpo;
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });

    // A sala nasce em RASCUNHO (é o estado que tem o botão "Abrir sala"), com
    // dois lugares — assim dá para ver o telão antes e depois do segundo aluno.
    const { room } = await post('arena_create_room', {
      title: 'Aula que abre a sala', preset: 'personalizado', expected_players: 2,
    });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });

    navegador = await abrirNavegador();
    const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    painel.on('pageerror', (erro) => erros.push(erro.message));

    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', SENHA);
    await Promise.all([
      painel.waitForNavigation(),
      painel.click('[data-admin-arena-login] button[type=submit]'),
    ]);
    await painel.waitForSelector(`[data-arena-room-list] [data-room-id="${room.id}"]`);
    // A sala em destaque abre pelo caminho do professor: escolher a sala na
    // lista (que em 2026-09-20 deixou de ter botões) e apertar o botão que o
    // cabeçalho de comando mostra como a ação da vez.
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula que abre a sala',
      { descricao: 'abrir a sala em destaque' },
    );

    // 1) "Abrir sala" abre o telão em outra aba. A espera é pelo TARGET, não por
    //    um `page`: a aba nova é do navegador inteiro (o professor abre o telão
    //    no computador dele e projeta), e é o endereço dela que prova a sala.
    await painel.waitForSelector('[data-arena-detail] [data-action=publish]');
    const alvoDoTelao = navegador.waitForTarget(
      (alvo) => alvo.url().includes('/tv.php'),
      { timeout: 20_000 },
    );
    await painel.click('[data-arena-detail] [data-action=publish]');
    const alvo = await alvoDoTelao;
    const pin = room.pin || room.code;
    assert.ok(
      alvo.url().includes(encodeURIComponent(pin)),
      `o telão aberto tem de ser o da sala aberta (esperava o PIN ${pin} em ${alvo.url()})`,
    );

    // 2) A parede daquela aba: a sala está no lobby, com o código e o QR.
    const parede = await alvo.page();
    await esperarPor(parede, () => document.querySelector('.arena-tv-pin strong')?.textContent.trim().length > 0, {
      descricao: 'o telão mostrar o código da sala',
    });
    assert.equal(
      await parede.$eval('.arena-tv-pin strong', (no) => no.textContent.trim()),
      pin.replace(/^(\d{3})(\d{3})$/, '$1 $2'),
      'o telão mostra o mesmo código que o painel',
    );
    assert.equal(await parede.$eval('.arena-tv-join-qr', (no) => Boolean(no.getAttribute('src'))), true, 'e o QR da entrada');

    // 3) A turma incompleta: o telão espera o professor, e NÃO promete a turma.
    const linhaDaEspera = () => parede.$eval('.arena-tv-waiting', (no) => no.textContent.trim());
    assert.match(await linhaDaEspera(), /^Aguardando o professor iniciar a batalha/, 'com lugar vazio não se anuncia turma pronta');
    assert.equal(
      await parede.$eval('.arena-tv-waiting', (no) => no.classList.contains('is-ready')),
      false,
      'e a linha segue no tom neutro da espera',
    );

    // 4) O primeiro aluno entra: a parede o mostra, e AINDA não anuncia a turma
    //    pronta — um lugar vazio é um lugar vazio.
    await post('arena_join', { code: room.code, name: 'Ana' });
    await esperarPor(parede, () => document.querySelectorAll('.arena-tv-roster li:not(.arena-tv-empty-li)').length === 1, {
      descricao: 'a parede mostrar o aluno que entrou',
    });
    assert.match(await linhaDaEspera(), /^Aguardando o professor iniciar a batalha/, 'com 1 de 2 lugares a turma não está completa');

    // 5) O último aluno entra: a parede muda sozinha (sem recarregar nada).
    await post('arena_join', { code: room.code, name: 'Bia' });
    await esperarPor(parede, () => document.querySelector('.arena-tv-waiting')?.classList.contains('is-ready'), {
      descricao: 'a parede anunciar a turma pronta quando o último aluno entrar',
    });
    assert.match(await linhaDaEspera(), /^Todos estão prontos/, 'e dizer o que aconteceu, não só mudar de cor');
    assert.deepEqual(
      await parede.$$eval('.arena-tv-roster li:not(.arena-tv-empty-li)', (itens) => itens.map((no) => no.textContent.trim())),
      ['Ana', 'Bia'],
      'com os nomes de quem chegou, na ordem em que entraram',
    );

    // 6) O painel: a mesma sala, o mesmo estado, agora pronto para começar.
    //
    //    A espera é pelo ESTADO, e não por "existe detalhe na tela": o detalhe
    //    já se abriu sozinho no clique de "Abrir sala" (a resposta de abrir a
    //    sala traz o detalhe), com a turma ainda vazia. Esperar pelo elemento
    //    aceitaria o retrato velho — zero alunos, Aguardando participantes —
    //    como se fosse o novo.
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => document.querySelector('[data-arena-detail-state]')?.textContent === 'Pronta para começar',
      { descricao: 'o painel dizer que a sala com os dois alunos está pronta' },
    );
    // A linha de números conta a turma ("2"); a conta dos lugares — quantos
    // cabem — vive na cabeça da partida.
    assert.equal(
      await painel.evaluate(() => document.querySelector('.arena-state-cell.is-alunos b')?.textContent.trim()),
      '2',
      'com os dois alunos contados na faixa',
    );
    assert.match(
      await painel.$eval('.arena-match-places', (no) => no.textContent.replace(/\s+/g, ' ').trim()),
      /2 lugares usados · 0 disponíveis/,
      'e os dois lugares preenchidos na cabeça da partida',
    );

    // 7) Pop-up bloqueado: a janela não existe, e aí o diálogo de projeção é quem
    //    dá o caminho (código, QR e o botão de abrir neste computador).
    const { room: outraSala } = await post('arena_create_room', {
      title: 'Aula com pop-up bloqueado', preset: 'personalizado', expected_players: 2,
    });
    await post('arena_add_round', { room_id: outraSala.id, challenge_id: challenge.id });
    await painel.reload({ waitUntil: 'networkidle2' });
    await painel.waitForSelector(`[data-arena-room-list] [data-room-id="${outraSala.id}"]`);
    await painel.evaluate(() => { window.open = () => null; });
    await clicarAte(
      painel,
      `[data-room-id="${outraSala.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=publish]')),
      { descricao: 'abrir a sala que nasceu em rascunho' },
    );
    await clicarAte(
      painel,
      '[data-arena-detail] [data-action=publish]',
      () => Boolean(document.querySelector('[data-arena-dialog][open] [data-tv-code]')),
      { descricao: 'o diálogo de projeção aparecer no lugar da aba bloqueada' },
    );
    const dialogo = await painel.evaluate(() => {
      const aberto = document.querySelector('[data-arena-dialog][open]');
      return {
        titulo: aberto?.querySelector('h3')?.textContent ?? '',
        codigo: aberto?.querySelector('[data-tv-code]')?.textContent?.trim() ?? '',
        abrirAqui: Boolean(aberto?.querySelector('a[target=_blank]')),
      };
    });
    assert.equal(dialogo.abrirAqui, true, 'o diálogo oferece o botão de abrir o telão aqui');
    assert.notEqual(dialogo.codigo, '', 'e traz o código de projeção para o outro aparelho');

    assert.deepEqual(erros, [], 'nenhum erro de página no fluxo de abrir a sala');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});
