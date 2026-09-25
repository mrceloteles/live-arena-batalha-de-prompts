import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, recarregar } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

/**
 * A BATALHA NOVA PELA TELA DO PROFESSOR.
 *
 * O que o teste de API não responde e este responde: o professor ENCONTRA a
 * ação, ela diz o que vai acontecer, e depois de confirmar a tela volta ao
 * estado de espera — com o mesmo código na mão — enquanto o aluno, na página
 * dele, volta ao lobby sem tocar em nada.
 *
 * O aluno é uma aba de verdade, em contexto próprio (sem o cookie do painel):
 * é ele quem prova que a batalha nova não deixou a turma presa no resultado da
 * anterior.
 */
const codigoDaSala = (pagina, sala) => pagina.evaluate((id) => {
  const card = document.querySelector(`[data-room-id="${id}"]`);
  return card?.querySelector('.arena-room-code')?.textContent?.trim() ?? '';
}, sala.id);

test('o professor repete a aula na mesma sala e o aluno volta ao lobby sozinho', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    adminPassword: 'browser-test-password',
    adminSecret: 'browser-test-secret-at-least-32-characters',
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };

    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Aula repetida', expected_players: 35 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Missão única',
      mission: 'Escreva o prompt da missão única.',
      modality: 'refinamento',
      attempts: 2,
      duration_seconds: 300,
      reference_text: 'Texto de referência com público, formato e restrições claras.',
    });
    const { round } = await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    browser = await abrirNavegador();
    const contextoDoProfessor = await browser.createBrowserContext();
    const contextoDoAluno = await browser.createBrowserContext();
    const painel = await abrirPagina(browser, { viewport: { width: 1440, height: 960 }, context: contextoDoProfessor });
    const aluno = await abrirPagina(browser, { viewport: { width: 390, height: 844 }, context: contextoDoAluno });

    // ---- o aluno entra e joga a PRIMEIRA batalha
    await entrarNaSala(aluno, `${base}/play?pin=${room.code}`, 'Ana');
    await aluno.waitForSelector('[data-arena-screen="lobby"].is-active');

    // ---- o professor abre o painel e o detalhe da sala publicada
    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', 'browser-test-password');
    await Promise.all([painel.waitForNavigation(), painel.click('[data-admin-arena-login] button[type=submit]')]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel, `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=start]')),
      { descricao: 'abrir o detalhe da sala publicada' },
    );

    // Nada jogado: não há batalha para repetir, e o botão não existe.
    assert.equal(
      await painel.evaluate(() => Boolean(document.querySelector('[data-arena-detail] [data-action=new-battle]'))),
      false,
      'a sala que nunca jogou não oferece nova batalha',
    );
    const codigoNaTela = await codigoDaSala(painel, room);

    // ---- a batalha 1 acontece (o professor inicia pelo painel, a aluna envia)
    await clicarAte(
      painel, '[data-arena-detail] [data-action=start]',
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=end-round]')),
      { descricao: 'iniciar a missão pelo painel' },
    );
    await aluno.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    await aluno.type('[data-arena-prompt-form] textarea', 'Prompt da primeira batalha');
    await clicarAte(
      aluno, '[data-arena-send]',
      envioRespondido,
      { descricao: 'a aluna enviar o prompt da primeira batalha' },
    );
    await post('arena_end_round', { room_id: room.id });
    await post('arena_end_room', { room_id: room.id });

    // ---- a ação aparece, com a batalha 1 encerrada
    await recarregar(painel);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel, `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=new-battle]')),
      { descricao: 'reabrir o detalhe da sala que já jogou' },
    );

    // ---- o diálogo diz o que fica, o que zera e deixa a turma à escolha
    await clicarAte(
      painel, '[data-arena-detail] [data-action=new-battle]',
      () => {
        const form = document.querySelector('[data-new-battle-form]');
        return Boolean(form && form.querySelector('[name=keep_participants]'));
      },
      { descricao: 'abrir o diálogo da batalha nova' },
    );
    const textoDoDialogo = await painel.evaluate(() => document.querySelector('[data-arena-dialog-body]').textContent);
    assert.match(textoDoDialogo, /missões continuam/i, 'o diálogo diz que a configuração fica');
    assert.match(textoDoDialogo, /voltam a zero/i, 'e que tentativas e pontuação zeram');
    assert.match(textoDoDialogo, /histórico/i, 'e que a batalha anterior fica guardada');
    assert.ok(textoDoDialogo.includes(codigoNaTela), 'o diálogo mostra o MESMO código da sala');
    assert.match(textoDoDialogo, /Manter a turma/i, 'com a turma como padrão');
    assert.match(textoDoDialogo, /Limpar a lista/i, 'e a opção de liberar a sala para a próxima');

    // ---- confirmar
    await clicarAte(
      painel, '[data-new-battle-form] button[type=submit]',
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=start]')),
      { descricao: 'começar a batalha nova' },
    );
    // A leitura é do DESTAQUE inteiro, e não só do corpo do detalhe: o estado da
    // sala ("Aguardando participantes") vive no selo do cabeçalho desde a
    // reorganização da sala em destaque — lendo só o corpo, a asserção ficaria
    // cega justamente para a frase que ela vigia.
    const depois = await painel.evaluate(() => ({
      estadoDaTela: document.querySelector('[data-arena-detail]').textContent,
      batalha: Boolean(document.querySelector('[data-arena-detail] [data-action=new-battle]')),
      iniciar: document.querySelector('[data-arena-detail] [data-action=start]')?.textContent?.trim() ?? '',
    }));
    // O vocabulário de estado do desenho aprovado: a sala que já recebeu gente e
    // caberia uma aula nova diz "Pronta para começar"; com lugar vago, "Aguardando
    // participantes". O que a asserção vigia — a tela voltar ao estado de espera —
    // não mudou.
    assert.match(
      depois.estadoDaTela,
      /Pronta para começar|Aguardando participantes/,
      'o painel volta ao estado de espera da batalha nova',
    );
    assert.match(depois.iniciar, /Iniciar/i, 'e oferece iniciar a batalha nova');
    assert.equal(depois.batalha, false, 'sem nada jogado na batalha nova, não se oferece repetir de novo');
    assert.equal(await codigoDaSala(painel, room), codigoNaTela, 'o código na tela é o MESMO');

    // ---- o aluno volta ao lobby sozinho (SSE + poll), sem perder a sessão
    await aluno.waitForFunction(() => document.querySelector('[data-arena-screen="lobby"]')?.classList.contains('is-active'), { timeout: ESPERA.padrao });
    // A tela é a mesma; o campo da missão (que fica dentro dela) não pode estar
    // visível — quem mede é o retângulo, e não a existência do nó.
    const naMissao = await aluno.evaluate(() => {
      const campo = document.querySelector('[data-arena-prompt-form] textarea');
      if (!campo) return false;
      const area = campo.getBoundingClientRect();
      return area.width > 0 && area.height > 0;
    });
    assert.equal(naMissao, false, 'a missão da batalha anterior não está mais na tela da aluna');

    // ---- a batalha 2 é jogável: as tentativas da aluna estão livres
    await clicarAte(
      painel, '[data-arena-detail] [data-action=start]',
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=end-round]')),
      { descricao: 'iniciar a batalha nova pelo painel' },
    );
    await aluno.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    const tentativaDaAluna = await aluno.evaluate(() => ({
      rodada: document.querySelector('[data-arena-round-count]')?.textContent?.trim() ?? '',
      gastas: document.querySelectorAll('[data-attempt-dot].is-pending, [data-attempt-dot].is-scored').length,
    }));
    assert.match(tentativaDaAluna.rodada, /1\b/, 'a missão volta a ser a primeira da batalha nova');
    assert.equal(tentativaDaAluna.gastas, 0, 'e nenhuma tentativa vem gasta da batalha anterior');

    await aluno.type('[data-arena-prompt-form] textarea', 'Prompt da segunda batalha');
    await clicarAte(
      aluno, '[data-arena-send]',
      envioRespondido,
      { descricao: 'a aluna enviar o prompt da segunda batalha' },
    );

    // ---- no banco: dois ciclos, e o envio da primeira batalha no lugar dele
    const ciclos = await repositories.arena.rounds.cycles(room.id);
    assert.deepEqual(ciclos.map((entry) => entry.cycle), [1, 2]);
    const primeira = await repositories.arena.rounds.listByRoomCycle(room.id, 1);
    const segunda = await repositories.arena.rounds.listByRoomCycle(room.id, 2);
    assert.equal((await repositories.arena.submissions.listByRound(primeira[0].id)).filter((entry) => entry.prompt).length, 1);
    assert.equal((await repositories.arena.submissions.listByRound(segunda[0].id)).filter((entry) => entry.prompt).length, 1);
    assert.notEqual(primeira[0].id, segunda[0].id);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

/**
 * O envio respondeu? A tela diz de um jeito ou de outro: "Prompt avaliado!"
 * quando a nota veio na hora, "Resposta recebida..." quando o juiz ainda está
 * trabalhando, e o bloco de resultado aparece quando ela chegou.
 */
function envioRespondido() {
  const texto = document.querySelector('[data-arena-mission-message]')?.textContent || '';
  if (/avaliado|recebid|conferindo|guardada/i.test(texto)) return true;
  return !document.querySelector('[data-arena-result]')?.hidden;
}

/** Entrar na sala pelo formulário do aluno (o código já vem na URL). */
async function entrarNaSala(pagina, url, nome) {
  await pagina.goto(url);
  await pagina.type('[data-arena-join-form] [name=name]', nome);
  await pagina.click('[data-arena-join-form] button[type=submit]');
}
