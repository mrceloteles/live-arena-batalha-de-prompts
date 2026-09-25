// Captura e mede as telas do refinamento visual de 16/09/2026, num banco em
// memória com o MESMO fixture das referências (sala "Oficina de prompts",
// 3 missões de precisão, 8 participantes, juiz de mentira).
//
//   node output/qa/refino-capturas.mjs antes
//   node output/qa/refino-capturas.mjs depois
//
// Grava output/auditoria-refino/<rotulo>/*.png e o medida.json da rodada.
//
// O que ele mede, e por quê: o plano pede para reduzir cápsulas coloridas,
// padronizar botões, baixar o bloco de convite e parar de repetir o código e a
// regra do sorteio. Cada um desses itens vira um número aqui — contagem de
// cápsulas com fundo, estilos distintos de botão, altura do convite, quantas
// vezes o PIN aparece no texto do detalhe — para a comparação não depender do
// olho de quem olha o print.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

// Rótulo livre (antes/depois/teste): um valor inesperado caindo em 'antes'
// sobrescreveu a linha de base uma vez, e não vai acontecer de novo.
const rotulo = (process.argv[2] || 'antes').replace(/[^a-z0-9-]/gi, '');
// Diagnóstico: `PARAR=<nome>` encerra logo depois daquela captura, para medir
// cada trecho sozinho. `SEM_MEDIDA=1` pula a varredura de estilos do painel.
const pararEm = process.env.PARAR || '';
const semMedida = process.env.SEM_MEDIDA === '1';
const dir = new URL(`../auditoria-refino/${rotulo}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const senha = 'browser-test-password';
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const server = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  arenaJudge: async () => ({
    percent: 80,
    breakdown: { objetivo: 80, contexto: 80, formato: 80 },
    feedback: 'O objetivo está claro. Especifique o público e o formato da resposta.',
  }),
  adminPassword: senha,
  adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: senha }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = async (action, payload = {}) => {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${action}: ${JSON.stringify(body)}`);
  return body;
};

const missao = (titulo) => `Crie um prompt para produzir ${titulo}. Informe o público, a finalidade e os dados que precisam aparecer. A resposta deve estar pronta para uso pela escola.`;
const gabarito = (titulo) => `Produza ${titulo} para estudantes e famílias, com data, local, programação e contato. Use linguagem clara e convidativa e não invente dados ausentes.`;

await post('arena_set_open', { open: true });

// --- Sala em operação: 3 missões, 8 participantes, uma missão em andamento --
const { room: operando } = await post('arena_create_room', { title: 'Oficina de prompts', preset: 'personalizado', expected_players: 8 });
for (const titulo of ['o cartaz da feira', 'o post de robótica', 'o convite da mostra']) {
  const { challenge } = await post('arena_save_challenge', {
    title: `Missão ${titulo}`,
    modality: 'precisao',
    mission: missao(titulo),
    context: 'Turma do ensino médio organizando uma mostra de projetos.',
    reference_text: gabarito(titulo),
    duration_seconds: 180,
    criteria: [{ criterion: 'objetivo', weight: 40 }, { criterion: 'contexto', weight: 30 }, { criterion: 'formato', weight: 30 }],
  });
  await post('arena_add_round', { room_id: operando.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: operando.id });
const alunos = [];
for (const nome of ['Ana', 'Bruno', 'Caio', 'Duda', 'Elis', 'Fábio', 'Gabi', 'Hugo']) {
  const resposta = await fetch(`${base}/api.php?action=arena_join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: operando.pin || operando.code, name: nome }),
  });
  const corpo = await resposta.json();
  if (!corpo.ok) throw new Error(`join ${nome}: ${JSON.stringify(corpo)}`);
  alunos.push({ nome, id: corpo.participant.id, token: corpo.token });
}

// --- Sala em rascunho com uma missão bloqueada ------------------------------
const { room: rascunho } = await post('arena_create_room', { title: 'Sala do reforço', preset: 'personalizado', expected_players: 6 });
const { challenge: semGabarito } = await post('arena_save_challenge', {
  title: 'Missão sem gabarito',
  modality: 'precisao',
  mission: missao('o convite do clube de leitura'),
  duration_seconds: 120,
  criteria: [{ criterion: 'objetivo', weight: 100 }],
});
await post('arena_add_round', { room_id: rascunho.id, challenge_id: semGabarito.id });
const { room: salaArena } = await post('arena_create_room', { title: 'Batalha contra o Juiz', preset: 'arena', expected_players: 8 });

// `protocolTimeout` maior: com o painel se redesenhando a cada 2,5 s, uma
// captura pode ficar na fila do protocolo por mais do que o padrão.
const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const medidas = {};
const pendentes = [];
// O painel entra pela sessão (o cookie vem do login pela API, como nos testes
// de navegador). A tela de login em si é a captura 23, numa página sem cookie.
const paginaAdmin = await abrirPagina(browser, {
  viewport: { width: 1440, height: 900 },
  cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
});


// Rolar o trecho que interessa. O painel do professor rola numa área interna,
// então `window.scrollTo` não serve: quem manda é o `scrollIntoView` do próprio
// elemento. Captura de página inteira ficou de fora de propósito — medida em
// 16/09, ela levou 112 s no painel (a página empilhada é enorme) e travava a
// rodada; a janela em cada ponto de rolagem prova o mesmo.
const rolarAte = async (pagina, seletor) => {
  await pagina.evaluate((alvo) => document.querySelector(alvo)?.scrollIntoView({ block: 'start' }), seletor);
  await dormir(400);
};

// Uma captura que falha não derruba a rodada inteira: entra na lista de
// pendentes do medida.json, que é o que a entrega precisa declarar.
const registrar = async (pagina, nome, { completo = false } = {}) => {
  const destino = fileURLToPath(new URL(`${nome}.png`, dir));
  // `bringToFront` não é enfeite: com outra aba aberta, a captura da página que
  // não está na frente custa ordens de grandeza mais — medido em 16/09, a mesma
  // janela saiu em 133 ms com uma aba e em 82 s com uma segunda aba em branco
  // aberta ao lado. Trazer a página para a frente (14 ms) devolve o custo normal.
  await pagina.bringToFront();
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      const inicio = Date.now();
      await dormir(350);
      await pagina.screenshot({ path: destino, fullPage: completo });
      console.log(`  ${nome} (${Date.now() - inicio}ms)`);
      if (pararEm && pararEm === nome) throw new Error('PARADA-PEDIDA');
      return;
    } catch (erro) {
      if (erro.message === 'PARADA-PEDIDA') throw erro;
      if (tentativa === 2) {
        pendentes.push(`${nome}: ${erro.message}`);
        console.log(`  PENDENTE ${nome}: ${erro.message.split('\n')[0]}`);
        return;
      }
      console.log(`  … ${nome} tentativa ${tentativa} falhou: ${erro.message.split('\n')[0]}`);
      await dormir(800);
    }
  }
};
const tentar = async (nome, acao) => {
  try {
    await acao();
  } catch (erro) {
    pendentes.push(`${nome}: ${erro.message}`);
    console.log(`  PENDENTE ${nome}: ${erro.message}`);
  }
};
const medir = (pagina, funcao, ...args) => pagina.evaluate(funcao, ...args);

let pedidoDeParada = false;
try {
  // --- Painel --------------------------------------------------------------
  await paginaAdmin.goto(`${base}/admin-arena.php`);
  await esperarPor(paginaAdmin, () => document.querySelectorAll('[data-arena-room-list] [data-room-id]').length >= 3, { descricao: 'as três salas no painel' });
  await dormir(600);

  medidas.painel = semMedida ? { pulado: true } : await medir(paginaAdmin, () => {
    const fundoVisivel = (nó) => {
      const fundo = getComputedStyle(nó).backgroundColor;
      const partes = fundo.match(/[\d.]+/g)?.map(Number) || [];
      const alfa = partes.length === 4 ? partes[3] : 1;
      return alfa > 0.02 && fundo !== 'rgba(0, 0, 0, 0)' && fundo !== 'transparent';
    };
    const cartoes = [...document.querySelectorAll('[data-arena-room-list] [data-room-id]')].map((cartao) => ({
      titulo: cartao.querySelector('.arena-room-card-title strong')?.textContent?.trim() || '',
      capsulasComFundo: [...cartao.querySelectorAll('[class*="badge"], [class*="chip"], [class*="code"], [class*="pill"]')]
        .filter((nó) => fundoVisivel(nó)).map((nó) => nó.className),
      botoes: [...cartao.querySelectorAll('.arena-room-card-actions button')].map((botão) => botão.textContent.trim()),
    }));
    const estilo = (nó) => {
      const s = getComputedStyle(nó);
      return [s.borderRadius, s.padding, s.fontSize, s.fontWeight, s.backgroundColor, s.boxShadow, Math.round(nó.getBoundingClientRect().height)].join('|');
    };
    const acoes = [...document.querySelectorAll('.arena-room-card-actions button, .arena-room-card-actions summary, .arena-detail-head .arena-room-card-actions button')];
    const porEstilo = new Map();
    for (const nó of acoes) {
      const chave = estilo(nó);
      if (!porEstilo.has(chave)) porEstilo.set(chave, []);
      porEstilo.get(chave).push(nó.textContent.trim().slice(0, 24));
    }
    const secao = (id) => {
      const alvo = document.querySelector(id);
      return alvo ? { topo: Math.round(alvo.getBoundingClientRect().top + window.scrollY), altura: Math.round(alvo.getBoundingClientRect().height) } : null;
    };
    return {
      cartoes,
      estilosDistintosDeBotao: [...porEstilo].map(([chave, rotulos]) => ({ chave, rotulos })),
      secaoSalas: secao('#rooms'),
      secaoBanco: secao('#challenges'),
      secaoAulas: secao('#lessons'),
      alturaDaPagina: Math.round(document.documentElement.scrollHeight),
    };
  });
  await registrar(paginaAdmin, '01-painel-primeira-tela');
  await rolarAte(paginaAdmin, '#challenges');
  await registrar(paginaAdmin, '01b-painel-banco');
  await rolarAte(paginaAdmin, '#lessons');
  await registrar(paginaAdmin, '01c-painel-aulas');
  await paginaAdmin.evaluate(() => document.querySelector('.arena-admin-scroll-area')?.scrollTo({ top: 0 }));
  await dormir(300);

  // --- Detalhe da sala em espera -------------------------------------------
  // Botão dentro de dobra fechada não recebe clique: abrir a dobra antes é o
  // que o professor faria, e sem isto o roteiro acusava defeito no produto.
  const abrirDobra = async (seletorDobra) => {
    await paginaAdmin.evaluate((alvo) => {
      const dobra = document.querySelector(alvo);
      if (dobra) dobra.open = true;
    }, seletorDobra);
    await dormir(250);
  };
  const diálogo = async (seletor, nome) => {
    await paginaAdmin.click(seletor);
    await paginaAdmin.waitForSelector('dialog[open]', { timeout: 5000 });
    await dormir(300);
    await registrar(paginaAdmin, nome);
    await paginaAdmin.keyboard.press('Escape');
    await dormir(250);
  };

  const abrirSala = async (id) => {
    // Depois de um recarregamento a lista ainda está sendo montada pelo cliente:
    // clicar antes dela existir não abre nada.
    await esperarPor(paginaAdmin, (alvo) => Boolean(document.querySelector(`[data-room-id="${alvo}"] [data-action=detail]`)), { descricao: 'o cartão da sala', args: id });
    await paginaAdmin.evaluate((alvo) => document.querySelector(`[data-room-id="${alvo}"] [data-action=detail]`)?.click(), id);
    await esperarPor(paginaAdmin, () => Boolean(document.querySelector('[data-arena-detail-body] .arena-round-card')), { descricao: 'o detalhe da sala' });
    await dormir(700);
  };
  await abrirSala(operando.id);
  medidas.salaEspera = await medir(paginaAdmin, (pin) => {
    const px = (nó) => (nó ? Math.round(nó.getBoundingClientRect().top + window.scrollY) : null);
    const altura = (nó) => (nó ? Math.round(nó.getBoundingClientRect().height) : null);
    const detalhe = document.querySelector('[data-arena-detail]');
    const corpo = document.querySelector('[data-arena-detail-body]');
    const cockpit = corpo.querySelector('.arena-cockpit');
    const bloco = corpo.querySelector('.arena-cockpit-code');
    const estado = corpo.querySelector('.arena-detail-head .arena-status-badge');
    const botãoPrincipal = [...corpo.querySelectorAll('.arena-cockpit button, .arena-detail-head button')]
      .find((nó) => nó.classList.contains('figma-cta') || nó.dataset.action === 'start');
    const texto = corpo.innerText;
    return {
      pin,
      ocorrenciasDoPinNoDetalhe: texto.split(pin).length - 1,
      ocorrenciasDoPinNaPagina: document.body.innerText.split(pin).length - 1,
      alturaDoDetalhe: altura(detalhe),
      alturaDoCockpit: altura(cockpit),
      alturaDoBlocoDeCodigo: altura(bloco),
      larguraDoBlocoDeCodigo: bloco ? Math.round(bloco.getBoundingClientRect().width) : null,
      topoDoEstado: px(estado),
      topoDoBotaoPrincipal: px(botãoPrincipal),
      distanciaEstadoAoBotao: (px(estado) !== null && px(botãoPrincipal) !== null) ? px(botãoPrincipal) - px(estado) : null,
      rotuloDoBotaoPrincipal: botãoPrincipal?.textContent.trim() || null,
      tituloDoDetalhe: document.querySelector('[data-arena-detail-title]')?.textContent.trim(),
      dobrasAbertas: [...corpo.querySelectorAll('details[data-fold-key]')].filter((d) => d.open).map((d) => d.dataset.foldKey),
      botoesDaPrimeiraDobra: [...corpo.querySelectorAll('.arena-admin-tools button')].map((nó) => nó.textContent.trim()),
      temGerenciarSala: Boolean(corpo.querySelector('.arena-admin-tools')),
    };
  }, operando.pin || operando.code);
  await registrar(paginaAdmin, '02-sala-espera');
  // O painel se redesenha a cada leitura do servidor: uma captura de página
  // inteira trava no meio do redesenho. A rolagem até o trecho que interessa e
  // a captura da janela provam a mesma coisa sem depender disso.
  await rolarAte(paginaAdmin, '.arena-rounds-grid');
  await registrar(paginaAdmin, '02b-sala-missoes');

  // --- Gerenciar sala aberto, edição, mais missão e projeção --------------
  await tentar('03-gerenciar-sala', async () => {
    await abrirDobra('[data-arena-detail-body] .arena-admin-tools');
    await registrar(paginaAdmin, '03-gerenciar-sala');
  });
  await tentar('03b-editar-sala', () => diálogo('[data-room-detail] [data-action=room-edit], [data-arena-detail-body] [data-action=room-edit]', '03b-editar-sala'));
  await tentar('03c-adicionar-missao', () => diálogo('[data-arena-detail-body] [data-action=add-round]', '03c-adicionar-missao'));
  await tentar('03d-projecao', () => diálogo('[data-arena-detail-body] [data-action=open-tv]', '03d-projecao'));

  // --- Sala em operação ----------------------------------------------------
  await post('arena_start_round', { room_id: operando.id });
  const rodadaAberta = (await post('arena_room_detail', { room_id: operando.id })).detail.rounds.find((r) => r.status === 'open');
  for (const aluno of alunos.slice(0, 5)) {
    await post('arena_submit', {
      participant_id: aluno.id, token: aluno.token, round_id: rodadaAberta.id,
      prompt: `Cartaz para a mostra: título, data, local, programação e contato, em linguagem clara. (${aluno.nome})`,
    });
  }
  await paginaAdmin.reload({ waitUntil: 'domcontentloaded' });
  await abrirSala(operando.id);
  medidas.salaRodada = await medir(paginaAdmin, () => {
    const px = (nó) => (nó ? Math.round(nó.getBoundingClientRect().top + window.scrollY) : null);
    const altura = (nó) => (nó ? Math.round(nó.getBoundingClientRect().height) : null);
    const corpo = document.querySelector('[data-arena-detail-body]');
    const cockpit = corpo.querySelector('.arena-cockpit');
    const missão = corpo.querySelector('.arena-round-card');
    const controles = [...corpo.querySelectorAll('.arena-detail-head .arena-room-card-actions button')].map((nó) => nó.textContent.trim());
    return {
      alturaDoCockpit: altura(cockpit),
      topoDoCockpit: px(cockpit),
      topoDaMissao: px(missão),
      topoDosControles: px(corpo.querySelector('.arena-detail-head')),
      controles,
      dobrasAbertas: [...corpo.querySelectorAll('details[data-fold-key]')].filter((d) => d.open).map((d) => d.dataset.foldKey),
    };
  });
  await registrar(paginaAdmin, '04-sala-rodada');
  await rolarAte(paginaAdmin, '.arena-rounds-grid');
  await registrar(paginaAdmin, '04b-sala-rodada-missoes');

  // --- Sorteio da vez ------------------------------------------------------
  medidas.sorteio = await medir(paginaAdmin, () => {
    const sorteio = document.querySelector('[data-arena-draw]');
    if (!sorteio) return null;
    return {
      modos: [...sorteio.querySelectorAll('.arena-draw-mode')].map((nó) => nó.innerText.replace(/\s+/g, ' ').trim()),
      // Quantas vezes a regra do modo aparece escrita: o texto curto embaixo do
      // botão repetia a dica logo abaixo.
      repeticoesDaRegra: [...sorteio.querySelectorAll('.arena-draw-mode small')].length,
      dica: sorteio.querySelector('.arena-draw-hint')?.textContent.trim(),
      bloqueio: sorteio.querySelector('.arena-draw-blocked')?.textContent.trim() || null,
    };
  });
  await registrar(paginaAdmin, '05-sorteio');

  // --- Celular -------------------------------------------------------------
  await paginaAdmin.setViewport({ width: 390, height: 844 });
  await registrar(paginaAdmin, '06-painel-celular');
  await registrar(paginaAdmin, '07-sala-celular');
  medidas.salaCelular = await medir(paginaAdmin, () => ({
    alturaDoCockpit: Math.round(document.querySelector('.arena-cockpit')?.getBoundingClientRect().height || 0),
    alturaDoDetalhe: Math.round(document.querySelector('[data-arena-detail]')?.getBoundingClientRect().height || 0),
    largura: window.innerWidth,
  }));
  await paginaAdmin.setViewport({ width: 1440, height: 900 });

  // --- Encerrar a rodada para ter relatório com dados ----------------------
  await post('arena_end_round', { room_id: operando.id });
  await dormir(1200);

  // --- Diálogos ------------------------------------------------------------
  await tentar('08-novo-desafio', () => diálogo('[data-arena-new-challenge]', '08-novo-desafio'));
  await tentar('09-nova-sala', () => diálogo('[onclick="openCreateRoomDialog()"]', '09-nova-sala'));
  await tentar('10-nova-sala-arena', async () => {
    await páginaSeletor(paginaAdmin, '[name=preset]', 'arena');
    await registrar(paginaAdmin, '10-nova-sala-arena');
  });
  await tentar('12-tempos', () => diálogo('[data-room-timing]', '12-tempos'));
  // Com a atividade em andamento o convite está na dobra: abrir antes de pedir a
  // projeção é o caminho do professor, e é o que a dobra promete.
  await tentar('14-projecao-em-atividade', async () => {
    await abrirDobra('[data-arena-detail-body] .arena-invite-fold');
    await registrar(paginaAdmin, '14-convite-na-dobra');
    await diálogo('[data-arena-detail-body] [data-action=open-tv]', '14b-projecao-em-atividade');
  });

  // --- Aulas e banco -------------------------------------------------------
  medidas.aulas = await medir(paginaAdmin, () => [...document.querySelectorAll('[data-arena-lesson-list] article')].map((cartão) => ({
    titulo: cartão.querySelector('.arena-lesson-head strong')?.textContent.trim(),
    resumo: cartão.querySelector('.arena-lesson-fold summary')?.textContent.trim(),
    ações: [...cartão.querySelectorAll('.arena-lesson-actions button')].map((nó) => nó.textContent.trim()),
    altura: Math.round(cartão.getBoundingClientRect().height),
  })));
  await rolarAte(paginaAdmin, '#lessons');
  await registrar(paginaAdmin, '15-aulas');

  // --- Relatório -----------------------------------------------------------
  const paginaRelatório = await abrirPagina(browser, {
    viewport: { width: 1440, height: 900 },
    cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
  });
  await paginaRelatório.goto(`${base}/report.php`);
  await dormir(900);
  medidas.relatorio = await medir(paginaRelatório, () => {
    const seções = [...document.querySelectorAll('.report-grid > *, .report-full-grid > *')];
    const px = (nó) => Math.round(nó.getBoundingClientRect().top + window.scrollY);
    return {
      alturaDaPagina: Math.round(document.documentElement.scrollHeight),
      secoes: seções.map((nó) => ({ classe: nó.className, altura: Math.round(nó.getBoundingClientRect().height) })),
      dobrasFechadas: [...document.querySelectorAll('details')].filter((d) => !d.open).map((d) => d.className),
      periodoEscrito: document.body.innerText.includes('Todo o período'),
    };
  });
  await registrar(paginaRelatório, '16-relatorio');
  await paginaRelatório.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.45)));
  await dormir(400);
  await registrar(paginaRelatório, '16b-relatorio-meio');
  await paginaRelatório.setViewport({ width: 390, height: 844 });
  medidas.relatorioCelular = await medir(paginaRelatório, () => ({ alturaDaPagina: Math.round(document.documentElement.scrollHeight), largura: window.innerWidth }));
  await registrar(paginaRelatório, '17-relatorio-celular');
  await paginaRelatório.close();

  // --- Prévia do aluno e TV ------------------------------------------------
  const prévia = await abrirPagina(browser, {
    viewport: { width: 390, height: 844 },
    cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
  });
  await prévia.goto(`${base}/aluno-preview.php?room=${operando.id}`);
  await dormir(900);
  medidas.prévia = await medir(prévia, () => {
    const barra = document.querySelector('[data-preview-bar], .arena-preview-bar');
    const atividade = document.querySelector('[data-arena-screen="lobby"]');
    const px = (nó) => (nó ? Math.round(nó.getBoundingClientRect().height) : null);
    return {
      alturaDaBarra: px(barra),
      alturaDoTopo: px(document.querySelector('.arena-topbar, header')),
      alturaDaAtividade: px(atividade),
      textoDaBarra: barra?.innerText?.trim().slice(0, 400) || null,
    };
  });
  await registrar(prévia, '18-previa-aluno');
  void 0;
  await tentar('18b-previa-aluno-missao', async () => {
    await prévia.evaluate(() => {
      const seletor = document.querySelector('[data-preview-state], [data-preview-mode]');
      if (seletor) { seletor.value = 'mission'; seletor.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await dormir(700);
    await registrar(prévia, '18b-previa-aluno-missao');
  });
  await prévia.close();

  const tv = await abrirPagina(browser, {
    viewport: { width: 1280, height: 720 },
    cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
  });
  await tv.goto(`${base}/tv-preview.php?room=${operando.id}`);
  await dormir(900);
  for (const modo of ['lobby', 'round', 'results', 'final']) {
    await tentar(`19-tv-${modo}`, async () => {
      const existe = await tv.evaluate((alvo) => Boolean(document.querySelector(`[data-tv-preview-mode=${alvo}]`)), modo);
      if (existe) {
        await tv.evaluate((alvo) => document.querySelector(`[data-tv-preview-mode=${alvo}]`).click(), modo);
        await dormir(600);
        await registrar(tv, `19-tv-${modo}`);
      } else {
        await registrar(tv, `19-tv-${modo}`);
      }
    });
  }
  await tv.close();

  // --- Portal, entrada, login ---------------------------------------------
  const portal = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
  await portal.goto(base);
  await registrar(portal, '20-portal-desktop');
  await portal.setViewport({ width: 390, height: 844 });
  await registrar(portal, '21-portal-celular');
  await portal.close();

  const paginaAluno = await abrirPagina(browser, { viewport: { width: 390, height: 844 } });
  await paginaAluno.goto(`${base}/play?pin=${encodeURIComponent(operando.pin || operando.code)}`);
  await dormir(600);
  await registrar(paginaAluno, '22-entrada-aluno');
  medidas.entradaAluno = await medir(paginaAluno, () => ({
    alturaDaPagina: Math.round(document.documentElement.scrollHeight),
    dobras: document.querySelectorAll('details').length,
  }));
  await paginaAluno.close();

  const loginNovo = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
  await loginNovo.goto(`${base}/admin-arena.php`);
  await dormir(600);
  await registrar(loginNovo, '23-login-professor');
  await loginNovo.close();

  writeFileSync(new URL('medida.json', dir), JSON.stringify({ rotulo, medidas, pendentes }, null, 2));
  console.log(`\n${rotulo}: ${pendentes.length} pendente(s)`);
  for (const linha of pendentes) console.log(`  - ${linha}`);
} catch (erro) {
  if (erro.message !== 'PARADA-PEDIDA') throw erro;
  pedidoDeParada = true;
  console.log('\nparada pedida: medição encerrada no ponto escolhido');
} finally {
  void pedidoDeParada;
  await browser.close();
  server.closeAllConnections();
  server.close();
  opened.close();
}

async function páginaSeletor(pagina, seletor, valor) {
  await pagina.evaluate(({ seletor: alvo, valor: escolhido }) => {
    const campo = document.querySelector(alvo);
    if (!campo) throw new Error(`sem ${alvo}`);
    campo.value = escolhido;
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }, { seletor, valor });
  await dormir(400);
}
