import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ESPERA, abrirNavegador, abrirPagina, carregar, clicarAte, esperarPor, recarregar } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const SENHA = 'browser-test-password';
const SEGREDO = 'browser-test-secret-at-least-32-characters';

/**
 * Modo Arena de ponta a ponta, no navegador de verdade: a aluna no celular, a
 * TV projetada e o painel do professor, rodada a rodada.
 *
 * O que este teste protege:
 * - a aluna NUNCA fica sem saber o que fazer (missão ou votação, nunca as duas,
 *   nunca nenhuma) e a ação principal cabe na tela do celular;
 * - a TV conta a história sozinha: rodada, Juiz com corações e energia;
 * - 60% de acerto derruba um coração do Juiz, e a TV anuncia o dano;
 * - o Wild Card escolhe mesmo quem entra em campo;
 * - no fim, a turma derruba o Juiz e o painel mostra a partida encerrada.
 */
test('browser: o Modo Arena conduz aluna, TV e professor até derrubar o Juiz', { timeout: ESPERA.testeLongo }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  // Nota determinística: "Aluno N" vale 50 + N. Com isso o campeão da rodada é
  // previsível e a turma consegue votar certo de propósito para medir o dano.
  const server = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async ({ candidatePrompt }) => ({
      percent: 50 + Number(/Aluno (\d+)/.exec(String(candidatePrompt || ''))?.[1] || 0),
      breakdown: {},
      feedback: 'Avaliado',
    }),
    adminPassword: SENHA,
    adminSecret: SEGREDO,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: SENHA }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const cookieNome = cookie.split('=')[0];
    const cookieValor = cookie.slice(cookieNome.length + 1);
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };
    const entrar = async (name) => {
      const response = await fetch(`${base}/api.php?action=arena_join`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: room.code, name }),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    const votar = async (sessao, choice, extra = {}) => {
      const response = await fetch(`${base}/api.php?action=arena_mode_vote`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participant_id: sessao.participant.id, token: sessao.token, choice, ...extra }),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    const arena = async () => (await post('arena_room_detail', { room_id: room.id })).detail.arena;

    // --- a sala do Modo Arena: 2 rodadas, Juiz com 2 corações ---------------
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', {
      title: 'Arena no navegador', preset: 'arena', expected_players: 8,
      arena_rounds: 2, arena_boss_health: 3, arena_damage_threshold: 60, arena_attacks_per_round: 2,
      arena_teams: true,
    });
    for (const [index, mission] of ['Cartaz da feira de ciências.', 'Post do clube de robótica.'].entries()) {
      const { challenge } = await post('arena_save_challenge', {
        title: `Missão ${index + 1}`, modality: 'precisao', mission, context: 'Turma do ensino médio.',
        criteria: [{ criterion: 'objetivo', weight: 40 }, { criterion: 'contexto', weight: 30 }, { criterion: 'formato', weight: 30 }],
        reference_text: `Material do projeto com data, local e público. Missão ${index + 1}.`,
      });
      await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    }
    await post('arena_publish_room', { room_id: room.id });

    browser = await abrirNavegador();
    const erros = [];
    const novaPagina = async (viewport, admin = false) => {
      // `abrirPagina` é o que dá a toda página deste teste o orçamento e o
      // polling comuns (ver test/support/navegador.mjs): são três telas abertas
      // ao mesmo tempo, e só a que está na frente desenha com regularidade.
      const page = await abrirPagina(browser, {
        viewport,
        cookie: admin ? { name: cookieNome, value: cookieValor, domain: '127.0.0.1', path: '/', httpOnly: true } : undefined,
      });
      page.on('pageerror', (error) => erros.push(error.message));
      page.on('dialog', (dialog) => dialog.accept());
      return page;
    };
    // Vinte e cinco segundos era o teto que reprovava o portão 2 sob carga: o
    // clique anterior pode ter levado segundos de si, e ainda falta a rodada
    // chegar. A espera passa a ser a política comum, e falha dizendo o que
    // esperava.
    const visivel = (page, seletor, timeout = ESPERA.padrao) => esperarPor(
      page,
      (sel) => { const node = document.querySelector(sel); return Boolean(node) && !node.hidden; },
      { descricao: `${seletor} aparecer`, timeout, args: seletor },
    );
    // "O que eu faço agora?": a tela da aluna mostra a missão OU a votação —
    // nunca as duas (disputa) e nunca nenhuma (tela morta).
    //
    // `checkVisibility` e não o atributo `hidden`. Em 16/09 o painel da missão
    // ficava com `hidden` E pintado ao mesmo tempo: a regra `:has()` do cartão de
    // espera declara `display: flex !important` com especificidade suficiente
    // para vencer os três `[hidden]` da cascata, então durante o Wild Card a
    // votação aparecia com o cartão de espera logo abaixo das opções — duas
    // situações na mesma tela. Quem olhasse o ATRIBUTO não veria nada de errado:
    // `!painel.hidden` era falso, e o teste aprovava uma tela que mostrava as
    // duas orientações. A pergunta certa é o que está PINTADO.
    const telasDaAluna = () => celular.evaluate(() => {
      const pintado = (seletor) => {
        const node = document.querySelector(seletor);
        return Boolean(node) && node.checkVisibility();
      };
      return {
        missao: pintado('[data-arena-mission]'),
        voto: pintado('[data-arena-mode-vote]'),
        espera: pintado('[data-arena-mission-empty]'),
      };
    });

    // --- a aluna entra pelo celular, como na aula ---------------------------
    const celular = await novaPagina({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await carregar(celular, `${base}/play?pin=${room.code}`);
    await celular.type('[data-arena-join-form] [name=name]', 'Aluno 1');
    await celular.click('[data-arena-join-form] button[type=submit]');
    await celular.waitForSelector('[data-arena-screen="lobby"].is-active');
    const sessao1 = await celular.evaluate(() => ({
      participant: { id: localStorage.getItem('arena.participant_id') },
      token: localStorage.getItem('arena.token'),
    }));
    assert.ok(sessao1.participant.id, 'a aluna precisa ter sessão depois de entrar');
    const turma = [sessao1];
    for (let n = 2; n <= 6; n += 1) turma.push(await entrar(`Aluno ${n}`));

    // O HUD do modo aparece para a aluna antes mesmo da rodada começar.
    const hud = await celular.evaluate(() => {
      const node = document.querySelector('[data-arena-mode-hud]');
      return { visivel: Boolean(node) && !node.hidden, coracoes: (node?.textContent.match(/❤️/g) || []).length };
    });
    assert.equal(hud.visivel, true, 'o HUD do Modo Arena precisa aparecer no celular');
    assert.equal(hud.coracoes, 3, 'o HUD mostra os 3 corações do Juiz');

    // --- a TV de verdade: a projeção da parede, que se atualiza sozinha ----
    // (a prévia do painel é uma foto do momento; a parede é a que a turma vê)
    // A sessão de projeção sai no Set-Cookie (o token não viaja no corpo).
    const respostaTv = await fetch(`${base}/api.php?action=arena_tv_token`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: room.id }),
    });
    assert.equal(respostaTv.status, 200);
    const sessaoTv = respostaTv.headers.get('set-cookie').split(';')[0];
    const tv = await novaPagina({ width: 1920, height: 1080 });
    await tv.setCookie({
      name: sessaoTv.split('=')[0],
      value: sessaoTv.slice(sessaoTv.indexOf('=') + 1),
      domain: '127.0.0.1', path: '/', httpOnly: true,
    });
    await carregar(tv, `${base}/tv.php?pin=${room.pin || room.code}`);
    await tv.waitForSelector('[data-tv-arena]');
    const esperaTv = (await tv.$eval('[data-tv-arena]', (n) => n.textContent.replace(/\s+/g, ' '))).replace(/ /g, ' ').trim();
    assert.match(esperaTv, /RODADA 1\/2/);
    assert.match(esperaTv, /JUIZ IA/);

    const painel = await novaPagina({ width: 1440, height: 1100 }, true);
    await carregar(painel, `${base}/admin-arena.php`);
    await esperarPor(painel, (id) => Boolean(document.querySelector(`[data-room-id="${id}"]`)),
      { descricao: 'a sala aparecer na lista do professor', args: room.id });
    // O ESTADO DA PARTIDA (Juiz, energia, acerto) mora na FAIXA DE INDICADORES do
    // cartão da sala desde a reorganização — ele é lido logo abaixo. O PAINEL da
    // partida é outra coisa: é a montagem dos CONTROLES, e é por ele que a
    // abertura do detalhe é esperada aqui, porque foi ele que se perdeu na
    // reorganização da sala (`arenaPanel()` seguiu escrito em `arena.js` e a
    // chamada, que existia em c82359e, sumiu do template do detalhe).
    await clicarAte(painel, `[data-room-id="${room.id}"] [data-action="detail"]`,
      () => Boolean(document.querySelector('[data-arena-mode-panel]')),
      { descricao: 'o detalhe da sala do Modo Arena abrir com o painel da partida' });
    const textoPainel = () => painel.$eval('.arena-metrics', (n) => n.textContent.replace(/\s+/g, ' ').trim());
    const abrirConfig = () => painel.evaluate(() => {
      const detalhes = document.querySelector('.arena-mode-config');
      if (detalhes) detalhes.open = true;
    });
    const textoDetalhe = () => painel.$eval('[data-arena-detail]', (n) => n.textContent.replace(/\s+/g, ' ').trim());
    assert.match(await textoPainel(), /Juiz \/ Boss/i, 'o Juiz da partida precisa estar na faixa de indicadores');
    assert.match(await textoPainel(), /Energia da turma/i, 'com a energia da turma ao lado');
    assert.match(await textoPainel(), /Acerto da turma/i, 'e o acerto calculado em tempo real');

    // OS CONTROLES DA PARTIDA PRECISAM ESTAR NA TELA.
    //
    // Os botões que conduzem a partida (sortear, próximo, reiniciar, Wild Card,
    // ataque dinâmico, poderes e times) são escritos em `arenaPanel()`
    // (`arena.js`) e só chegam à tela se o detalhe da sala chamar a função. A
    // chamada se perdeu na reorganização e voltou; sem esta checagem, apagá-la de
    // novo passaria despercebido — o portão morria antes num tempo limite de 60 s,
    // dizendo "demorou" em vez de "falta isto".
    const controlesDaPartida = await painel.evaluate(() => [...document.querySelectorAll('[data-arena-mode-panel] [data-action]')]
      .map((no) => no.dataset.action)
      .filter((acao) => /^(arena-(draw|next|reset|power|teams|config|wildcard|dynamic))/.test(acao || '')));
    assert.ok(
      controlesDaPartida.includes('arena-power') && controlesDaPartida.includes('arena-teams'),
      'os controles da partida do Modo Arena (poderes e times entre eles) precisam estar na tela do professor: '
        + `a lista veio ${JSON.stringify(controlesDaPartida)} — eles vivem em arenaPanel(), que o detalhe da sala monta`,
    );

    // --- uma rodada inteira -------------------------------------------------
    const rodada = async (numero) => {
      await post('arena_start_round', { room_id: room.id });
      const detalhe = (await post('arena_room_detail', { room_id: room.id })).detail;
      const roundId = detalhe.rounds.find((entry) => entry.status === 'open').id;

      // Cada rodada começa com o celular relido: aluno que reconecta, e a tela
      // não carrega o texto da rodada anterior como se fosse o de agora.
      await recarregar(celular);
      await visivel(celular, '[data-arena-mission-panel] [data-arena-mission]');
      const missao = await celular.evaluate(() => ({
        titulo: document.querySelector('[data-arena-mission-title]')?.textContent?.trim() || '',
        tempo: document.querySelector('[data-arena-timer]')?.textContent?.trim() || '',
      }));
      assert.match(missao.titulo, /Missão \d/, 'a aluna precisa ver qual é a missão');
      assert.notEqual(missao.tempo, '--:--', 'a aluna precisa ver quanto tempo tem');
      const telasNaMissao = await telasDaAluna();
      assert.deepEqual(telasNaMissao, { missao: true, voto: false, espera: false }, 'na missão, só a missão ocupa a tela');

      // Reconexão no meio da rodada: o que a aluna escreveu volta, e um reload
      // não gasta a tentativa dela.
      await celular.type('[data-arena-prompt-form] textarea', 'Rascunho da aluna antes da queda');
      // O rascunho mora no sessionStorage e é gravado a cada tecla. Esperar um
      // tempo fixo antes de recarregar era uma aposta: numa máquina disputada a
      // gravação pode atrasar, o reload leva o rascunho embora e o teste acusa o
      // produto por um defeito da própria espera. Agora se espera a gravação.
      await esperarPor(celular, (texto) => Object.keys(sessionStorage).some(
        (chave) => chave.startsWith('arena_draft_') && sessionStorage.getItem(chave) === texto,
      ), { descricao: 'o rascunho da aluna ser gravado antes da reconexão', timeout: ESPERA.curta, args: 'Rascunho da aluna antes da queda' });
      await recarregar(celular);
      await visivel(celular, '[data-arena-mission-panel] [data-arena-mission]');
      await esperarPor(celular, (texto) => document.querySelector('[data-arena-prompt-form] textarea')?.value === texto,
        { descricao: 'o rascunho da aluna voltar depois da reconexão', timeout: ESPERA.curta, args: 'Rascunho da aluna antes da queda' });
      const rascunho = await celular.$eval('[data-arena-prompt-form] textarea', (n) => n.value);
      assert.equal(rascunho, 'Rascunho da aluna antes da queda', 'o rascunho precisa sobreviver à reconexão');

      // Escrevendo, a TV continua contando a história: o Juiz e a energia
      // ficam na parede mesmo durante a missão (a rodada 1/2 já está no
      // cabeçalho da própria missão).
      const naTv = (await tv.$eval('[data-tv-arena]', (n) => n.textContent.replace(/\s+/g, ' '))).trim();
      assert.match(naTv, /JUIZ IA/, 'o Juiz precisa continuar na parede durante a missão');
      assert.match(naTv, /❤️/, 'a turma precisa ver os corações enquanto escreve');
      assert.match(naTv, /⚡\s*\d+\/\d+/, 'a energia da turma precisa continuar visível');
      await tv.waitForFunction(
        () => document.querySelector('.arena-tv-round-head')?.textContent.includes('MISSÃO'),
      );
      const cabecalhoTv = (await tv.$eval('.arena-tv-round-head', (n) => n.textContent.replace(/\s+/g, ' '))).trim();
      assert.match(cabecalhoTv, new RegExp(`MISSÃO 0?${numero}/0?2`));

      for (const [index, sessao] of turma.entries()) {
        const resposta = await fetch(`${base}/api.php?action=arena_submit`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            participant_id: sessao.participant.id, token: sessao.token, round_id: roundId,
            prompt: `Aluno ${index + 1}: ${missao.titulo} com objetivo, contexto, público, formato e restrições.`,
          }),
        });
        assert.equal(resposta.status, 200, `${numero}: ${JSON.stringify(await resposta.json())}`);
      }
      await post('arena_end_round', { room_id: room.id });
      await post('arena_mode_draw', { room_id: room.id });

      let estado = await arena();
      if (estado.phase === 'wildcard') {
        assert.equal(estado.competitors.length, 2, `rodada ${numero}: o Wild Card abre a vaga com 2 em campo`);
        // O aluno que está no Wild Card não vota; a aluna do celular pode estar
        // nele, então aponto o celular para quem vota — como faria o professor.
        const noWildcard = new Set(estado.wildcard.options.map((option) => String(option.participant_id)));
        const votante = turma.find((sessao) => !noWildcard.has(String(sessao.participant.id)));
        assert.ok(votante, 'sempre sobra alguém de fora do Wild Card para votar');
        if (String(votante.participant.id) !== String(sessao1.participant.id)) {
          await celular.evaluate((sessao) => {
            localStorage.setItem('arena.participant_id', String(sessao.participant.id));
            localStorage.setItem('arena.token', sessao.token);
          }, votante);
          await recarregar(celular);
        }
        await visivel(celular, '[data-arena-mode-vote]');
        const cartao = await celular.evaluate(() => {
          const node = document.querySelector('[data-arena-mode-vote]');
          const opcoes = [...node.querySelectorAll('[data-arena-vote-choice]')];
          return {
            pergunta: node.querySelector('[data-arena-vote-question]')?.textContent?.trim(),
            opcoes: opcoes.length,
            // A ação principal precisa caber na tela do celular, sem rolagem.
            naTela: opcoes.filter((opcao) => opcao.getBoundingClientRect().top < window.innerHeight).length,
            estouro: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        });
        assert.equal(cartao.pergunta, 'Qual prompt merece entrar na Arena?');
        assert.equal(cartao.opcoes, 3, 'o Wild Card oferece 3 prompts');
        assert.deepEqual(
          await celular.$$eval('[data-arena-vote-choice] b', (nos) => nos.map((n) => n.textContent.trim())),
          ['A', 'B', 'C'],
          'a turma vota por letra, nunca pelo id do participante',
        );
        assert.equal(cartao.naTela, 3, 'as 3 opções do Wild Card precisam caber na tela do celular');
        assert.equal(cartao.estouro, false, 'a votação não pode estourar a largura no celular');
        assert.deepEqual(
          await telasDaAluna(),
          { missao: false, voto: true, espera: false },
          'votando, a missão sai de cena — e a espera com ela',
        );

        await celular.click('[data-arena-vote-choice]');
        await celular.waitForFunction(
          () => document.querySelector('[data-arena-vote-status]')?.textContent?.includes('Voto registrado'),
        );
        const votosAbertos = await arena();
        assert.ok(Number(votosAbertos.wildcard.votes) >= 1, 'o voto do celular chega no servidor');
        // Empate no Wild Card: a votação fecha com um nome, nunca travada.
        const porOpcao = votosAbertos.wildcard.options.map((option) => Number(option.votes || 0));
        assert.equal(new Set(porOpcao).size, 1, `empate previsto no Wild Card: ${porOpcao.join(' · ')}`);

        for (const sessao of turma) {
          if (noWildcard.has(String(sessao.participant.id))) continue;
          if (String(sessao.participant.id) === String(votante.participant.id)) continue;
          await votar(sessao, estado.wildcard.options[0].key);
        }
        await post('arena_mode_wildcard_close', { room_id: room.id });
        estado = await arena();
        assert.equal(estado.competitors.length, 3, 'o Wild Card fecha com 3 em campo');
        assert.ok(estado.wildcard?.winner?.name, 'o Wild Card revela quem entrou');
        assert.ok(
          estado.competitors.some((entry) => String(entry.id) === String(estado.wildcard.winner.id)),
          'quem a turma escolheu entra mesmo na Arena',
        );
      } else {
        assert.equal(estado.competitors.length, 3, `rodada ${numero}: sem Wild Card são 3 sorteados`);
      }
      await post('arena_mode_dynamic_open', { room_id: room.id, dynamic: 'prever', duration_seconds: 60 });
      const comDesafio = await arena();
      // A turma só vê o desafio depois do próximo ciclo de leitura da tela — e
      // a pergunta certa, não o resultado da rodada anterior.
      await celular.waitForFunction(
        (pergunta) => document.querySelector('[data-arena-vote-question]')?.textContent?.trim() === pergunta,
        {}, comDesafio.dynamic.question,
      );
      const desafio = await celular.evaluate(() => ({
        pergunta: document.querySelector('[data-arena-vote-question]')?.textContent?.trim() || '',
        opcoes: document.querySelectorAll('[data-arena-vote-choice]').length,
      }));
      assert.match(desafio.pergunta, /Juiz/i, 'a aluna precisa entender que está lendo o Juiz');
      assert.equal(desafio.opcoes, 3, 'os 3 competidores viram 3 opções');
      // O competidor é uma LETRA na tela: o id (uuid) fica só no voto.
      assert.deepEqual(
        await celular.$$eval('[data-arena-vote-choice] b', (nos) => nos.map((n) => n.textContent.trim())),
        ['A', 'B', 'C'],
        'o competidor aparece como letra, nunca como id',
      );

      // O poder da turma, clicado no painel do professor, tem de CHEGAR à sala.
      if (numero === 2) {
        await abrirConfig();
        await painel.waitForFunction(() => {
          const botao = document.querySelector('[data-action="arena-power"][data-power="pista"]');
          return Boolean(botao) && !botao.disabled;
        }, {});
        await clicarAte(painel, '[data-action="arena-power"][data-power="pista"]',
          () => /\(usado\)/.test(document.querySelector('.arena-mode-powers')?.textContent || ''),
          { descricao: 'o poder da turma ser marcado como usado' });
        await visivel(celular, '[data-arena-vote-intro]');
        const pistaAluna = await celular.$eval('[data-arena-vote-intro]', (n) => n.textContent.trim());
        assert.match(pistaAluna, /A turma aprendeu algo/, 'a pista precisa chegar ao celular da turma');
        await tv.waitForSelector('.arena-tv-question-hint');
      }
      await tv.waitForFunction(
        () => /EM CAMPO/.test(document.querySelector('[data-tv-arena]')?.textContent || ''),
      );
      const tvDesafio = (await tv.$eval('[data-tv-arena]', (n) => n.textContent.replace(/\s+/g, ' '))).trim();
      assert.match(tvDesafio, /EM CAMPO/);

      assert.notEqual(comDesafio.dynamic.revealed, true, 'o desafio ainda está aberto');
      // O certo é o competidor de maior nota. A turma inteira vota nele: 100%
      // de acerto, acima dos 60% exigidos para tirar um coração do Juiz.
      const rodadaAtual = (await post('arena_room_detail', { room_id: room.id })).detail.rounds
        .find((entry) => Number(entry.position) === numero);
      const notas = new Map((rodadaAtual?.ranking || []).map((row) => [String(row.participant_id), Number(row.percent || 0)]));
      const certo = [...comDesafio.competitors]
        .sort((a, b) => (notas.get(String(b.id)) ?? -1) - (notas.get(String(a.id)) ?? -1))[0];
      assert.ok(certo, 'a rodada precisa de um campeão para o desafio');
      for (const sessao of turma) await votar(sessao, certo.id);

      const antes = comDesafio.boss.health;
      await post('arena_mode_dynamic_close', { room_id: room.id });
      const depois = await arena();
      assert.equal(depois.dynamic.result.accuracy, 100);
      assert.equal(depois.dynamic.result.damaged, true, '100% de acerto tem de causar dano');
      assert.equal(depois.boss.health, antes - 1, 'o Juiz perde exatamente 1 coração');

      // O golpe que derruba o Juiz não vira manchete de imediato: a TV mostra o
      // último coração quebrando e caindo, e só depois anuncia a vitória.
      if (depois.boss.defeated) {
        await tv.waitForSelector('[data-tv-arena-fall] .arena-heart.is-breaking', { timeout: 12_000 });
        const queda = await tv.evaluate(() => {
          const bloco = document.querySelector('[data-tv-arena-fall]');
          const coracao = bloco?.querySelector('.arena-heart.is-breaking');
          return {
            texto: bloco?.textContent.replace(/\s+/g, ' ').trim() || '',
            coracao: coracao?.textContent || '',
            animacao: coracao ? getComputedStyle(coracao).animationName : '',
            tamanho: coracao ? Math.round(coracao.getBoundingClientRect().height) : 0,
          };
        });
        assert.equal(queda.coracao, '❤️', 'o coração que cai é o último cheio, não um vazio');
        assert.equal(queda.animacao, 'arena-heart-breaking', 'a queda precisa de animação própria');
        assert.ok(queda.tamanho >= 40, `na projeção o coração que cai precisa ser grande, veio ${queda.tamanho}px`);
        assert.doesNotMatch(queda.texto, /A TURMA DERROTOU O JUIZ/, 'a manchete espera a queda terminar');

        // Terminada a queda, a manchete entra com a animação de vitória.
        await tv.waitForFunction(
          () => document.querySelector('.arena-tv-attack.is-verdict.is-in strong')?.textContent.includes('A TURMA DERROTOU O JUIZ'),
          { polling: 50, timeout: 12_000 },
        );
        assert.equal(
          await tv.$('[data-tv-arena-fall]'),
          null,
          'passado o momento, o quadro da queda sai da tela',
        );
      }

      // A aluna vê o veredito do ataque na hora, sem procurar.
      await celular.waitForFunction(
        () => /DANO NO JUIZ|O JUIZ RESISTIU/.test(document.querySelector('[data-arena-vote-question]')?.textContent || ''),
      );
      const veredito = await celular.$eval('[data-arena-vote-question]', (n) => n.textContent.trim());
      assert.match(veredito, /DANO NO JUIZ/);

      await tv.waitForSelector('.arena-tv-attack');
      const tvDepois = (await tv.$eval('.arena-tv-attack', (n) => n.textContent.replace(/\s+/g, ' '))).trim();
      if (depois.boss.defeated) {
        // O último coração já é o fim da partida: a TV vai direto ao veredito.
        assert.match(tvDepois, /A TURMA DERROTOU O JUIZ/);
      } else {
        assert.match(tvDepois, /DANO NO JUIZ/);
        assert.match(tvDepois, /100%/);
      }
      const tvCoracoes = (await tv.$eval('.arena-tv-mode-boss', (n) => (n.textContent.match(/🤍/g) || []).length));
      assert.equal(tvCoracoes, 3 - depois.boss.health, 'a TV apaga os corações que o Juiz perdeu');

      return depois;
    };

    /**
     * Um ataque coletivo extra na MESMA rodada: a turma vota certo e o Juiz
     * perde mais um coração. É o que enche a energia até o poder da turma.
     */
    const ataqueExtra = async (numero) => {
      await post('arena_mode_dynamic_open', { room_id: room.id, dynamic: 'prever', duration_seconds: 60 });
      const estado = await arena();
      const rodadaAtual = (await post('arena_room_detail', { room_id: room.id })).detail.rounds
        .find((entry) => Number(entry.position) === numero);
      const notas = new Map((rodadaAtual?.ranking || []).map((row) => [String(row.participant_id), Number(row.percent || 0)]));
      const certo = [...estado.competitors]
        .sort((a, b) => (notas.get(String(b.id)) ?? -1) - (notas.get(String(a.id)) ?? -1))[0];
      for (const sessao of turma) await votar(sessao, certo.id);
      await post('arena_mode_dynamic_close', { room_id: room.id });
      return arena();
    };

    const fim1 = await rodada(1);
    assert.equal(fim1.boss.health, 2);
    const extra = await ataqueExtra(1);
    assert.equal(extra.boss.health, 1, 'o segundo ataque da rodada tira mais um coração');
    assert.ok(Number(extra.energy.value) >= 10, `a energia precisa desbloquear a pista, veio ${extra.energy.value}`);
    await post('arena_mode_next', { room_id: room.id });

    // --- times temporários: o professor reorganiza e a aluna vê o seu time ---
    await abrirConfig();
    await clicarAte(painel, '[data-action="arena-teams"]',
      () => document.querySelectorAll('.arena-mode-teams > div').length >= 2,
      { descricao: 'os times temporários aparecerem no painel' });
    const times = await painel.$$eval('.arena-mode-teams > div span', (nos) => nos.map((n) => n.textContent.trim()));
    for (const nome of ['PIXEL', 'NEURAL', 'BYTE']) {
      assert.ok(times.some((linha) => linha.includes(nome)), `o time ${nome} precisa aparecer: ${times.join(' | ')}`);
    }
    await recarregar(celular);
    await visivel(celular, '[data-arena-team]');
    const timeDaAluna = await celular.$eval('[data-arena-team]', (n) => n.textContent.trim());
    assert.match(timeDaAluna, /TIME (PIXEL|NEURAL|BYTE)/, `a aluna precisa saber seu time, veio "${timeDaAluna}"`);

    // --- entrada tardia: quem chega na rodada 2 não fica perdido -------------
    const atrasado = await entrar('Aluno 7');
    const celularAtrasado = await novaPagina({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await carregar(celularAtrasado, `${base}/play`);
    await celularAtrasado.evaluate(({ participant, token }) => {
      localStorage.setItem('arena.participant_id', String(participant.id));
      localStorage.setItem('arena.token', token);
    }, atrasado);
    await recarregar(celularAtrasado);
    await visivel(celularAtrasado, '[data-arena-mode-hud]');
    // O que a tela de quem chega atrasado precisa mostrar é o que se espera
    // aqui: meio segundo fixo era a aposta de que o servidor já teria
    // respondido, e a asserção logo abaixo é essa mesma espera, escrita uma vez.
    await esperarPor(celularAtrasado, () => {
      const painelDaMissao = document.querySelector('[data-arena-mission-panel]');
      return Boolean(painelDaMissao) && !painelDaMissao.hidden
        && Boolean(document.querySelector('[data-arena-mission]:not([hidden]), [data-arena-empty-title]'));
    }, { descricao: 'a tela de quem chega atrasado explicar o que fazer' });
    const telaAtrasado = await celularAtrasado.evaluate(() => {
      const painelDaMissao = document.querySelector('[data-arena-mission-panel]');
      return {
        hud: !document.querySelector('[data-arena-mode-hud]')?.hidden,
        explicada: Boolean(painelDaMissao) && !painelDaMissao.hidden
          && Boolean(document.querySelector('[data-arena-mission]:not([hidden]), [data-arena-empty-title]')),
      };
    });
    assert.equal(telaAtrasado.hud, true, 'o HUD do modo precisa aparecer para quem chega atrasado');
    assert.equal(telaAtrasado.explicada, true, 'quem chega atrasado precisa de uma tela que diga o que fazer');
    await celularAtrasado.close();

    const fim2 = await rodada(2);
    assert.equal(fim2.boss.health, 0);
    assert.equal(fim2.phase, 'finished', 'com o Juiz em 0 a partida encerra sozinha');

    // --- o fim, nas três telas ---------------------------------------------
    await tv.waitForFunction(
      () => document.querySelector('[data-tv-arena]')?.textContent.includes('A TURMA DERROTOU O JUIZ'),
    );
    const tvFinal = (await tv.$eval('[data-tv-arena]', (n) => n.textContent.replace(/\s+/g, ' '))).trim();
    assert.match(tvFinal, /A TURMA DERROTOU O JUIZ/);
    assert.match(tvFinal, /Campeão da Arena/);
    // O fim da partida é o assunto da parede: com o Juiz derrotado, a TV não
    // pode voltar ao lobby pedindo para o professor iniciar a batalha.
    const palcoTv = (await tv.$eval('[data-tv-content]', (n) => n.textContent.replace(/\s+/g, ' '))).trim();
    assert.match(palcoTv, /A TURMA DERROTOU O JUIZ/);
    assert.doesNotMatch(palcoTv, /Aguardando o professor iniciar a batalha/);
    const premios = await tv.$$eval('.arena-tv-awards li', (linhas) => linhas.length);
    assert.ok(premios >= 2, `o fim precisa reconhecer mais de uma competência, veio ${premios}`);

    // A parede e o painel chegam ao fim por caminhos diferentes (SSE da TV e
    // releitura do detalhe), e ler o painel no instante da TV media a corrida,
    // não o painel: sob carga este portão ficava intermitente com o painel ainda
    // no "Desafio da turma" da rodada anterior. A espera é pelo VEREDITO.
    //
    // A frase "Partida encerrada" morava no painel do modo (a seção que não é
    // montada). Onde o professor lê o fim agora é o cartão do Juiz, na faixa de
    // indicadores: ele diz "derrotado" quando os corações acabam.
    await esperarPor(painel, () => /derrotado/.test(
      document.querySelector('.arena-metric.is-boss')?.textContent || '',
    ), { descricao: 'o painel anunciar o fim da partida depois da parede' });
    const painelFinal = await textoPainel();
    assert.match(painelFinal, /derrotado/, 'o veredito do Juiz aparece na faixa de indicadores');
    assert.match(await textoDetalhe(), /derrotado/);

    // A aluna não fica olhando uma tela morta no fim: ela lê o veredito.
    const alunaFinal = await celular.evaluate(() => document.querySelector('[data-arena-mode-vote]')?.textContent || '');
    assert.match(alunaFinal, /A TURMA DERROTOU O JUIZ|dano|Juiz/i);

    assert.deepEqual(erros, [], `erros de página: ${erros.join(' | ')}`);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
