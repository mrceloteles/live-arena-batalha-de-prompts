// O painel do professor em uma linha: em que pé está a sala, quantos estão
// dentro, quantos já enviaram, o que ainda não voltou do juiz e o que fazer
// agora — e UM botão com o peso da ação da vez.
//
// Por que isto vira portão: o painel cresceu por acúmulo (cada frente somou o
// seu controle) e o sintoma não é um botão quebrado, é o professor procurando
// entre quatro cartões o que ele faz no minuto seguinte. A régua que separa
// "interface clara" de "interface maior" precisa ser medida em tela: a faixa
// tem de dizer o estado VIVO (missão no ar, pausada, resultados no ar, entre
// rodadas) e a ação apontada tem de ser a que existe, com o MESMO nome escrito
// no botão que a executa — senão a faixa vira legenda de outro controle.
//
// O caminho aqui é o do professor: entrar pela tela de login, clicar na sala e
// apertar os botões. As duas exceções são deliberadas — os alunos entram por API
// (o que se mede é a faixa, não a tela de entrada deles, que tem teste próprio)
// e a pausa é conferida nos dois sentidos, com o botão de verdade.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const SENHA = 'faixa-de-estado-password';

/**
 * A faixa como o professor a lê: o valor de cada célula, e o botão que a ação
 * da vez marcou.
 *
 * `textos` é a parte que mais importa e a mais fácil de perder de vista: a
 * célula "Próxima ação" e o botão marcado têm de dizer a MESMA frase. Comparar
 * só o `data-action` deixaria passar a faixa que aponta "Encerrar rodada" e
 * marca o botão "Pausar missão".
 */
const lerFaixa = (pagina) => pagina.evaluate(() => {
  const celulas = {};
  for (const celula of document.querySelectorAll('[data-arena-state-bar] .arena-state-cell')) {
    const papel = [...celula.classList].find((classe) => classe.startsWith('is-'));
    celulas[papel] = celula.querySelector('b')?.textContent?.trim() ?? '';
  }
  // A AÇÃO DA VEZ mora no PALCO DA PARTIDA desde a reorganização da sala em
  // destaque: o corpo do detalhe (`[data-arena-detail-body]`) ficou com os
  // participantes e o roteiro de missões, e o botão que a faixa aponta subiu para
  // o cartão da partida — os dois debaixo da MESMA casca (`[data-arena-detail]`),
  // que é onde este portão procura o botão marcado.
  const marcados = [...document.querySelectorAll('[data-arena-detail] [data-proximo]')];
  // O rótulo do botão carrega o emoji do desenho (▶, ⏸, 📺) e a célula não: a
  // comparação é de palavras, não de glifos.
  const limpar = (texto) => texto.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return {
    celulas,
    acoes: marcados.map((node) => node.getAttribute('data-action')),
    rotulos: marcados.map((node) => limpar(node.textContent)),
    // OS LUGARES. A linha de números ficou só com o dado que o professor lê em
    // voz alta ("3 participantes"; o "de 3" saiu de lá), e a conta de quantos
    // cabem vive na cabeça da partida. A pergunta da asserção continua a mesma —
    // quantos lugares estão preenchidos —, lida onde a tela a escreve.
    lugares: document.querySelector('.arena-match-places')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  };
});

/**
 * A regra que a faixa inteira existe para cumprir: o texto da célula "Próxima
 * ação" e o texto do botão que ela marcou são a MESMA frase.
 *
 * Comparados um com o outro — e não cada um com uma constante —, a reprovação
 * diz o que aconteceu (divergiram) em vez de dizer qual dos dois números não
 * bateu. `esperado` entra como segunda checagem, para o estado não passar a
 * apontar outra ação sem ninguém notar.
 */
const conferirPar = (medida, esperado) => {
  assert.deepEqual(
    [medida.celulas['is-proxima']],
    medida.rotulos,
    'a faixa e o botão que ela marcou dizem a mesma frase',
  );
  assert.equal(medida.celulas['is-proxima'], esperado, 'a ação da vez deste estado');
};

test('a faixa de estado diz o que a sala vive e aponta a ação da vez, uma só', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const hub = createRoomEventHub();
  const servidor = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    eventHub: hub,
    adminPassword: SENHA,
    adminSecret: 'faixa-de-estado-secret-at-least-32-chars',
  }));
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  let navegador;
  try {
    let cookie = '';
    const post = async (action, payload = {}) => {
      const resposta = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(payload),
      });
      const set = resposta.headers.getSetCookie?.()[0] || resposta.headers.get('set-cookie') || '';
      const achado = /arena_admin=([^;]+)/.exec(set);
      if (achado) cookie = `arena_admin=${achado[1]}`;
      const corpo = await resposta.json();
      assert.equal(resposta.status, 200, `${action}: ${JSON.stringify(corpo)}`);
      return corpo;
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', {
      title: 'Faixa de estado da aula', preset: 'personalizado', expected_players: 3,
    });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira',
      modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'contexto', weight: 50 }],
      duration_seconds: 600,
      speed_weight: 'none',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    // O `token` da sessão do aluno vem no topo da resposta do `arena_join` (não
    // dentro de `participant`): é ele que autoriza o envio.
    const alunos = [];
    for (let n = 1; n <= 3; n += 1) {
      const entrada = await post('arena_join', { code: room.code, name: `Aluno ${n}` });
      alunos.push({ ...entrada.participant, token: entrada.token });
    }

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
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-state-bar]')),
      { descricao: 'abrir a sala em destaque com a faixa de estado' },
    );

    // 1) A sala publicada e com a turma dentro. Não há missão no ar, então a
    //    faixa não inventa envios nem pendências: fica o estado, os lugares e a
    //    ação que abre a aula. O estado é "Pronta para começar" — os três lugares
    //    estão preenchidos, e é isso que o professor pergunta ao olhar a lista.
    const espera = await lerFaixa(painel);
    assert.equal(espera.celulas['is-estado'], 'Pronta para começar', 'a faixa diz o estado da sala');
    assert.equal(
      await painel.evaluate(() => document.querySelector('[data-arena-detail-state]')?.textContent),
      'Pronta para começar',
      'e o selo do cabeçalho diz o MESMO nome: um dado, uma frase',
    );
    assert.equal(espera.celulas['is-alunos'], '3', 'e diz quantos estão dentro');
    assert.match(espera.lugares, /3 lugares usados · 0 disponíveis/, 'e quantos lugares estão preenchidos');
    assert.equal(espera.celulas['is-envios'], undefined, 'sem missão no ar não existe placar de envios');
    assert.equal(espera.celulas['is-avaliacoes'], undefined, 'nem pendência de juiz');
    conferirPar(espera, 'Iniciar missão');
    assert.deepEqual(espera.acoes, ['start'], 'e é o botão de iniciar que carrega a ação primária');

    // 2) A aula começa pelo botão que a faixa aponta — não por um atalho que só
    //    o teste conhece.
    await clicarAte(
      painel,
      '[data-arena-detail] [data-proximo]',
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=end-round]')),
      { descricao: 'iniciar a missão pelo botão marcado pela faixa' },
    );
    const noAr = await lerFaixa(painel);
    assert.equal(noAr.celulas['is-estado'], 'Em jogo · Missão 1 de 1', 'a faixa passa a contar a missão no ar');
    // O placar diz o envio e a turma em duas células ("0" envios · "3"
    // participantes): o "de 3" que a faixa escrevia numa célula só virou a
    // contagem da turma, e as duas são conferidas.
    assert.equal(noAr.celulas['is-envios'], '0', 'e o placar de envios nasce zerado');
    assert.equal(noAr.celulas['is-alunos'], '3', 'com a turma inteira na sala');
    // Esperar não é ação: com a turma escrevendo não existe botão para apertar, e
    // a faixa diz isso em vez de marcar um controle qualquer.
    assert.equal(noAr.celulas['is-proxima'], 'Acompanhar os envios');
    assert.deepEqual(noAr.acoes, [], 'nenhum botão recebe o peso da ação enquanto a turma escreve');

    // 3) Dois envios entram. O número muda sem ninguém recarregar nada: é a
    //    mesma leitura que sustenta o resto da faixa.
    const enviar = async (indice) => post('arena_submit', {
      participant_id: alunos[indice].id,
      token: alunos[indice].token,
      round_id: (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0].id,
      prompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
    });
    await enviar(0);
    await enviar(1);
    await esperarPor(
      painel,
      () => document.querySelector('.arena-state-cell.is-envios b')?.textContent.trim() === '2',
      { descricao: 'a faixa contar os dois envios que chegaram ao vivo' },
    );
    const parcial = await lerFaixa(painel);
    assert.equal(parcial.celulas['is-proxima'], 'Acompanhar os envios', 'com um aluno escrevendo ainda não é hora de fechar');
    assert.deepEqual(parcial.acoes, []);

    // 4) O último envio entra: agora a ação da vez existe, e é fechar a missão.
    await enviar(2);
    await esperarPor(
      painel,
      () => {
        const botao = document.querySelector('[data-arena-detail] [data-action=end-round]');
        return Boolean(botao && botao.hasAttribute('data-proximo'))
          && document.querySelector('.arena-state-cell.is-envios b')?.textContent.trim() === '3';
      },
      { descricao: 'a faixa apontar o fim da missão quando a turma inteira enviou' },
    );
    const cheio = await lerFaixa(painel);
    conferirPar(cheio, 'Encerrar rodada');
    assert.deepEqual(cheio.acoes, ['end-round'], 'um único botão primário, e é o de encerrar');

    // 5) Pausa: o estado vivo entra na faixa e a ação vira retomar — nos dois
    //    sentidos, com o botão de verdade da linha de ações.
    await clicarAte(
      painel,
      '[data-arena-detail] [data-action=pause-round]',
      () => document.querySelector('.arena-state-cell.is-estado b')?.textContent.includes('Pausada'),
      { descricao: 'pausar a missão pelo botão do painel' },
    );
    const pausada = await lerFaixa(painel);
    conferirPar(pausada, 'Retomar missão');
    assert.deepEqual(pausada.acoes, ['resume-round']);
    await clicarAte(
      painel,
      '[data-arena-detail] [data-proximo]',
      () => {
        const botao = document.querySelector('[data-arena-detail] [data-action=end-round]');
        return Boolean(botao && botao.hasAttribute('data-proximo'));
      },
      { descricao: 'retomar a missão pelo botão apontado pela faixa' },
    );

    // 6) Encerrar a missão abre os resultados: o estado vivo muda e a ação da vez
    //    passa a ser fechar o placar.
    await clicarAte(
      painel,
      '[data-arena-detail] [data-proximo]',
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=close-round]')),
      { descricao: 'encerrar a missão pelo botão apontado pela faixa' },
    );
    const resultados = await lerFaixa(painel);
    assert.match(resultados.celulas['is-estado'], /resultados no ar/, 'a faixa diz que o placar está na tela');
    conferirPar(resultados, 'Fechar resultados');
    assert.deepEqual(resultados.acoes, ['close-round']);

    // 7) Fechado o placar, a batalha terminou e o que sobra é repetir a aula na
    //    mesma sala — a ação que o professor procura no fim da aula.
    await clicarAte(
      painel,
      '[data-arena-detail] [data-proximo]',
      () => document.querySelector('.arena-state-cell.is-estado b')?.textContent.trim() === 'Encerrada',
      { descricao: 'fechar os resultados pelo botão apontado pela faixa' },
    );
    const encerrada = await lerFaixa(painel);
    assert.equal(encerrada.celulas['is-estado'], 'Encerrada');
    conferirPar(encerrada, 'Nova batalha nesta sala');
    assert.deepEqual(encerrada.acoes, ['new-battle'], 'e é o botão de repetir a batalha que fica primário');

    // 8) A sala que ainda ESPERA lugar. Aqui a ação existe (iniciar) mas o botão
    //    dela está desabilitado — o preset Clássico trava o cadastro nos lugares
    //    da sala. A faixa não pode apontar um controle que não faz nada: ela
    //    cala, e quem diz o que falta é o estado e a contagem de lugares.
    const { room: salaTravada } = await post('arena_create_room', {
      title: 'Sala que espera a turma', preset: 'classic', expected_players: 3,
    });
    // O preset Clássico traz as três rodadas oficiais prontas — não há missão a
    // escolher aqui, e é justamente essa a regra que trava o começo.
    await post('arena_publish_room', { room_id: salaTravada.id });
    for (const nome of ['Dora', 'Enzo']) {
      await post('arena_join', { code: salaTravada.code, name: nome });
    }
    await painel.reload({ waitUntil: 'networkidle2' });
    await clicarAte(
      painel,
      `[data-room-id="${salaTravada.id}"] [data-action=detail]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Sala que espera a turma',
      { descricao: 'abrir a sala que ainda espera a turma completa' },
    );
    const travada = await lerFaixa(painel);
    assert.equal(travada.celulas['is-estado'], 'Aguardando participantes');
    assert.equal(
      await painel.evaluate(() => document.querySelector('[data-arena-detail-state]')?.textContent),
      'Aguardando participantes',
      'o mesmo nome no selo do cabeçalho',
    );
    assert.equal(travada.celulas['is-alunos'], '2', 'a faixa diz quantos estão dentro');
    assert.match(travada.lugares, /2 lugares usados · 1 disponível/, 'e quantos lugares ainda faltam');
    assert.equal(travada.celulas['is-proxima'], undefined, 'e não promete uma ação que o botão não pode executar');
    assert.deepEqual(travada.acoes, [], 'nenhum botão recebe o peso de uma ação impossível');
    const botaoTravado = await painel.evaluate(() => {
      const botao = document.querySelector('[data-arena-detail] [data-action=start]');
      return { existe: Boolean(botao), desabilitado: Boolean(botao?.disabled) };
    });
    assert.deepEqual(botaoTravado, { existe: true, desabilitado: true }, 'o botão existe, desabilitado, e é ele que espera a turma');

    assert.deepEqual(erros, [], 'nenhum erro de página durante a aula inteira pelo painel');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});
