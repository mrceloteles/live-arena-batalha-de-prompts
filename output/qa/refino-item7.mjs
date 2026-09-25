// EVIDÊNCIA DO ITEM 7 — o aluno AO VIVO, o voto e o painel durante e depois da
// partida. É o que faltava para a etapa 6 do refinamento de 16/09/2026 fechar o
// item 7 do plano (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`).
//
//   node output/qa/refino-item7.mjs
//
// Grava output/auditoria-refino-etapa6/item7/*.png e medida.json.
//
// POR QUE ESTE ROTEIRO EXISTE, E POR QUE ELE É DIFERENTE DOS OUTROS
//
// As capturas anteriores de aluno eram de PRÉVIA (`/aluno-preview.php`) ou de um
// punhado de estados. O plano pede o aluno de verdade: espera, missão de texto,
// missão com imagem, envio, avaliação, votação, Wild Card e encerramento — mais
// o painel durante e depois da partida. Aqui a turma entra pela API
// (`arena_join`), a sessão do aluno é a do produto (localStorage
// `arena.participant_id` + `arena.token`), e cada estado é montado pelo motor de
// verdade, com o juiz falso no lugar do modelo.
//
// A REGRA QUE ESTE ROTEIRO SEGUE: NENHUM PRINT MENTE
//
// A rodada de 15/09 produziu um `34-tv-votacao.png` que mostrava o estado
// ANTERIOR — a captura saiu, o estado não era o que ela dizia. Por isso, aqui,
// toda captura é precedida de `exigir()`: se o estado não estiver na tela, o
// roteiro NÃO fotografa, registra a falha e termina com código diferente de zero.
// Uma evidência ausente é um problema; uma evidência que mente é pior do que ela.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const dir = new URL('../auditoria-refino-etapa6/item7/', import.meta.url);
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
const cookieDoAdmin = { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' };
const post = async (action, payload = {}) => {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${action}: ${JSON.stringify(body)}`);
  return body;
};

const medidas = {};
const falhas = [];
const limites = [];

// Uma falha não derruba o roteiro: ela é registrada, e o roteiro segue para o
// estado seguinte (que também interessa). O que ela NUNCA faz é deixar passar a
// captura daquele estado — `exigir` é chamado antes de `registrar`.
function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

async function estado(nome, tarefa) {
  try {
    await tarefa();
  } catch (erro) {
    falhas.push(`${nome}: ${erro.message.split('\n')[0]}`);
    console.log(`  FALHOU ${nome}: ${erro.message.split('\n')[0]}`);
  }
}

const registrar = async (pagina, nome) => {
  await pagina.bringToFront();
  await dormir(300);
  await pagina.screenshot({ path: fileURLToPath(new URL(`${nome}.png`, dir)) });
  console.log(`  ${nome}.png`);
};

// --- A turma do fixture ------------------------------------------------------
const missao = (assunto) => `Crie um prompt que produza ${assunto}. Informe o público, a finalidade e os dados que precisam aparecer. A resposta deve estar pronta para uso pela escola.`;

const entrar = async (pin, nome) => {
  const resposta = await fetch(`${base}/api.php?action=arena_join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: pin, name: nome }),
  });
  const corpo = await resposta.json();
  if (!corpo.ok) throw new Error(`join ${nome}: ${JSON.stringify(corpo)}`);
  return { nome, id: corpo.participant.id, token: corpo.token };
};

await post('arena_set_open', { open: true });

// Sala A — a aula normal: três missões, a segunda com imagem (modalidade
// `reversa`, que é a que mostra a arte ao aluno no palco de referência).
const salaA = (await post('arena_create_room', { title: 'Mostra de projetos', preset: 'personalizado', expected_players: 6 })).room;
const missoes = [
  { title: 'Cartaz da feira', modality: 'precisao', mission: missao('o cartaz da feira de ciências'), context: 'A feira é na quadra, no sábado, para as famílias.', reference_text: 'Cartaz A3 com data, local, programação e contato.' },
  { title: 'Reversa: aquário profundo', modality: 'reversa', mission: 'Escreva o prompt que produziu esta imagem.', context: '', reference_text: 'Biblioteca submersa com luz azul e peixes.', reference_image: '/public/assets/figma/challenge-underwater-library.webp' },
  { title: 'Convite da mostra', modality: 'precisao', mission: missao('o convite da mostra de projetos'), context: 'A mostra é aberta à comunidade.', reference_text: 'Convite com data, local e contato.' },
];
for (const [indice, dados] of missoes.entries()) {
  const { challenge } = await post('arena_save_challenge', {
    ...dados,
    // Duas tentativas na missão de imagem: é o estado em que o aluno vê, depois
    // da resposta, nota, feedback E o caminho de tentar de novo.
    attempts: indice === 1 ? 2 : 1,
    duration_seconds: null,
    criteria: [{ criterion: 'objetivo', weight: 40 }, { criterion: 'contexto', weight: 30 }, { criterion: 'formato', weight: 30 }],
  });
  await post('arena_add_round', { room_id: salaA.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: salaA.id });
const pinA = salaA.pin || salaA.code;
const turmaA = [];
for (const nome of ['Ana', 'Bruno', 'Caio', 'Duda', 'Elis', 'Fábio']) turmaA.push(await entrar(pinA, nome));
const codigoDaRodada = async (roomId) => (await post('arena_room_detail', { room_id: roomId })).detail.rounds.find((r) => r.status === 'open');
const enviarDeTodos = async (roomId, turma) => {
  const rodada = await codigoDaRodada(roomId);
  for (const aluno of turma) {
    await post('arena_submit', {
      participant_id: aluno.id, token: aluno.token, round_id: rodada.id,
      prompt: `Cartaz para a mostra ${aluno.nome}: título, data, local, programação e contato, em linguagem clara e sem dados inventados.`,
    });
  }
};

const browser = await abrirNavegador({ protocolTimeout: 300_000 });

// A sessão do aluno é a do produto: localStorage, como o `arena.client` guarda.
const abrirAluno = async (aluno, largura, altura) => {
  const pagina = await abrirPagina(browser, { viewport: { width: largura, height: altura } });
  pagina.on('pageerror', (erro) => falhas.push(`pageerror ${aluno.nome}: ${erro.message.slice(0, 140)}`));
  await pagina.goto(`${base}/play`, { waitUntil: 'domcontentloaded' });
  await pagina.evaluate((sessao) => {
    localStorage.setItem('arena.participant_id', String(sessao.id));
    localStorage.setItem('arena.token', sessao.token);
  }, aluno);
  await pagina.goto(`${base}/play`, { waitUntil: 'domcontentloaded' });
  await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-mission-panel]')), { descricao: `a tela do aluno ${aluno.nome}` });
  await dormir(500);
  return pagina;
};

// O que a tela do aluno mostra, em números. A pergunta que estes campos
// respondem é a do aceite do plano: "um estado principal por vez", "nenhum
// cartão vazio na missão inicial", "a votação ativa não exibe a espera junto".
const LER_ALUNO = `(() => {
  const visivel = (no) => Boolean(no) && no.checkVisibility();
  const tira = (raiz) => (raiz ? [...raiz.children].filter(visivel).map((no) => String(no.className).split(' ')[0] || no.tagName.toLowerCase()) : []);
  const vazio = document.querySelector('[data-arena-mission-empty]');
  const missao = document.querySelector('[data-arena-mission]');
  const cartao = document.querySelector('[data-arena-mode-vote]');
  const painel = document.querySelector('[data-arena-mission-panel]');
  // A missão reversa e a clássica têm um <img> cada, e o que não é da
  // modalidade da vez fica sem src no DOM — pegar o PRIMEIRO no documento mede o
  // errado. A foto é a que tem fonte.
  const foto = (no) => (no && no.getAttribute('src')
    ? { temSrc: true, carregou: no.complete && no.naturalWidth > 0, largura: no.naturalWidth, altura: no.naturalHeight, visivel: visivel(no) }
    : null);
  const imagem = [...document.querySelectorAll('[data-arena-reversa-image], [data-arena-classic-image]')].map(foto).find(Boolean) || null;
  const campo = document.querySelector('[data-arena-prompt-form] textarea');
  const enviar = document.querySelector('[data-arena-prompt-form] button[type=submit]');
  const caixa = (no) => { if (!visivel(no)) return null; const r = no.getBoundingClientRect(); return { topo: Math.round(r.top), altura: Math.round(r.height) }; };
  return {
    vazioVisivel: visivel(vazio),
    // O painel da missão guarda o cartão de espera dentro dele. O atributo
    // hidden mente aqui — em 16/09 ele estava posto E o painel pintado —, então
    // quem responde é a pintura.
    painelPintado: visivel(painel),
    atributoHiddenDoPainel: Boolean(painel) && painel.hasAttribute('hidden'),
    tituloDaEspera: document.querySelector('[data-arena-empty-title]')?.textContent.trim() || null,
    missaoVisivel: visivel(missao),
    cartaoDeVotoVisivel: visivel(cartao),
    // A orientação de esperar NÃO pode aparecer junto com a votação: são duas
    // situações diferentes comunicadas ao mesmo tempo.
    esperaJuntoDaVotacao: visivel(missao) && visivel(cartao),
    perguntaDoVoto: document.querySelector('[data-arena-vote-question]')?.textContent.trim() || null,
    opcoesDoVoto: [...document.querySelectorAll('[data-arena-vote-choice]')].filter(visivel).length,
    statusDoVoto: document.querySelector('[data-arena-vote-status]')?.textContent.trim() || null,
    tituloDaMissao: document.querySelector('[data-arena-mission-title]')?.textContent.trim() || null,
    rodada: document.querySelector('[data-arena-round-count]')?.textContent.trim() || null,
    imagem,
    campoDeResposta: Boolean(campo) && visivel(campo),
    rascunho: campo ? campo.value : null,
    caixaDoCampo: caixa(campo),
    caixaDoEnviar: caixa(enviar),
    enviarHabilitado: enviar ? !enviar.disabled : null,
    rodape: document.querySelector('[data-arena-submit-hint], .arena-attempts')?.textContent.trim() || null,
    nota: document.querySelector('.arena-result-score strong')?.textContent.trim() || null,
    temFeedback: visivel(document.querySelector('[data-arena-feedback]')) || Boolean(document.querySelector('[data-arena-feedback]')?.innerText.trim()),
    caixasVisiveis: [...document.querySelectorAll('details')].filter(visivel).length,
    blocosDaEspera: tira(vazio),
    blocosDaMissao: tira(missao),
    ranking: [...document.querySelectorAll('[data-arena-ranking] .arena-ranking-row, .arena-ranking-row')].filter(visivel).length,
    textoDoFim: (document.querySelector('[data-arena-mission-panel]')?.innerText || '').trim().slice(0, 300),
  };
})()`;

const lerAluno = (pagina) => pagina.evaluate(LER_ALUNO);

// Rolar DENTRO do contêiner que rola: a casca do aluno esconde o overflow e o
// miolo é quem rola — `window.scrollTo` não move nada aqui, e um print do topo
// deixaria o campo e o envio de fora.
const rolarAte = (pagina, seletor) => pagina.evaluate((sel) => {
  const alvo = document.querySelector(sel);
  if (!alvo) throw new Error(`não existe ${sel} para rolar até`);
  alvo.scrollIntoView({ block: 'center' });
  let no = alvo.parentElement;
  while (no && no !== document.body && no !== document.documentElement) {
    if (no.scrollHeight > no.clientHeight + 4) return { quemRola: String(no.className).split(' ')[0] || no.tagName.toLowerCase(), topo: Math.round(no.scrollTop) };
    no = no.parentElement;
  }
  return { quemRola: 'documento', topo: Math.round(window.scrollY) };
}, seletor);

const aoTopo = (pagina) => pagina.evaluate(() => {
  let no = document.querySelector('[data-arena-mission-panel]');
  while (no && no !== document.body) {
    no.scrollTop = 0;
    no = no.parentElement;
  }
  window.scrollTo(0, 0);
});

const esperarAluno = (pagina, condicao, descricao) =>
  esperarPor(pagina, condicao, { descricao });

try {
  // =========================================================================
  // 1. ESPERA — sala publicada, rodada ainda não aberta
  // =========================================================================
  await estado('aluno-espera', async () => {
    const ana = await abrirAluno(turmaA[0], 390, 844);
    await esperarAluno(ana, () => {
      const vazio = document.querySelector('[data-arena-mission-empty]');
      return Boolean(vazio) && vazio.checkVisibility();
    }, 'a espera do aluno');
    const lido = await lerAluno(ana);
    exigir(lido.vazioVisivel && !lido.missaoVisivel, `o aluno deveria estar na espera e não está (missão visível: ${lido.missaoVisivel})`);
    medidas.alunoEspera390 = lido;
    await registrar(ana, '01-aluno-espera-390');
    await ana.setViewport({ width: 1440, height: 900 });
    await dormir(400);
    medidas.alunoEspera1440 = await lerAluno(ana);
    await registrar(ana, '02-aluno-espera-1440');
    await ana.close();
  });

  // =========================================================================
  // 2. MISSÃO DE TEXTO — a primeira da sala
  // =========================================================================
  await post('arena_start_round', { room_id: salaA.id });
  await estado('aluno-missao-texto', async () => {
    const ana = await abrirAluno(turmaA[0], 390, 844);
    await esperarAluno(ana, () => {
      const missao = document.querySelector('[data-arena-mission]');
      return Boolean(missao) && missao.checkVisibility()
        && (document.querySelector('[data-arena-mission-title]')?.textContent || '').includes('Cartaz');
    }, 'a missão de texto na tela do aluno');
    const lido = await lerAluno(ana);
    exigir(lido.missaoVisivel && !lido.cartaoDeVotoVisivel, 'a missão e a votação apareceram juntas');
    exigir(lido.tituloDaMissao?.includes('Cartaz'), `a missão na tela não é a primeira: ${lido.tituloDaMissao}`);
    // Aceite do plano: nenhum cartão vazio pendant a missão inicial.
    exigir(lido.blocosDaMissao.length > 0, 'a missão não tem bloco nenhum visível');
    medidas.alunoMissaoTexto390 = lido;
    await registrar(ana, '03-aluno-missao-texto-390-topo');
    // O campo e o envio ficam abaixo da dobra: a segunda captura mostra o que a
    // pessoa precisa alcançar, e o medidor registra quem rolou.
    const rolado = await rolarAte(ana, '[data-arena-prompt-form] button[type=submit]');
    medidas.alunoMissaoTexto390.rolagem = rolado;
    medidas.alunoMissaoTexto390.caixaDoEnviarDepoisDeRolar = (await lerAluno(ana)).caixaDoEnviar;
    await registrar(ana, '04-aluno-missao-texto-390-fim');
    await ana.setViewport({ width: 1440, height: 900 });
    await dormir(400);
    medidas.alunoMissaoTexto1440 = await lerAluno(ana);
    await registrar(ana, '05-aluno-missao-texto-1440');
    await ana.close();
  });

  // =========================================================================
  // 3. PAINEL DO PROFESSOR DURANTE A PARTIDA — com a rolagem interna medida
  // =========================================================================
  const medirPainel = (pagina, roomId) => pagina.evaluate((id) => {
    const visivel = (no) => Boolean(no) && no.checkVisibility();
    const detalhe = document.querySelector('[data-arena-detail-body]');
    const rolante = [...document.querySelectorAll('*')].filter((no) => no.scrollHeight > no.clientHeight + 8 && visivel(no));
    const principal = rolante.find((no) => no.scrollHeight > 200) || null;
    const botao = (texto) => [...document.querySelectorAll('[data-arena-detail-body] button, [data-arena-detail-body] summary')]
      .filter(visivel).filter((no) => no.textContent.trim().toLowerCase().includes(texto)).length;
    return {
      sala: id,
      detalheVisivel: visivel(detalhe),
      alturaDoDetalhe: detalhe ? Math.round(detalhe.getBoundingClientRect().height) : null,
      rolagemDaPagina: Math.round(document.documentElement.scrollHeight) - window.innerHeight,
      areasQueRolam: rolante.length,
      quemRola: principal ? { classe: String(principal.className).split(' ')[0] || principal.tagName.toLowerCase(), conteudo: principal.scrollHeight, janela: principal.clientHeight } : null,
      missoesVisiveis: [...document.querySelectorAll('.arena-round-card')].filter(visivel).length,
      participantesVisiveis: [...document.querySelectorAll('.arena-roster-item')].filter(visivel).length,
      temGerenciar: botao('gerenciar'),
      botaoDeAvancar: botao('iniciar') + botao('avançar') + botao('encerrar rodada'),
      primeiroBotaoDeAcao: (() => {
        const alvo = [...document.querySelectorAll('[data-arena-detail-body] button')].filter(visivel)
          .find((no) => /iniciar|avançar|encerrar|pausar|retomar|publicar/i.test(no.textContent));
        if (!alvo) return null;
        return { texto: alvo.textContent.trim(), topo: Math.round(alvo.getBoundingClientRect().top) };
      })(),
    };
  }, roomId);

  const abrirPainel = async (largura, altura) => {
    const pagina = await abrirPagina(browser, { viewport: { width: largura, height: altura }, cookie: cookieDoAdmin });
    pagina.on('pageerror', (erro) => falhas.push(`pageerror painel: ${erro.message.slice(0, 140)}`));
    await pagina.goto(`${base}/admin-arena.php`, { waitUntil: 'domcontentloaded' });
    await esperarPor(pagina, (id) => Boolean(document.querySelector(`[data-room-id="${id}"] [data-action=detail]`)), { descricao: 'o cartão da sala no painel', args: salaA.id });
    await pagina.evaluate((id) => document.querySelector(`[data-room-id="${id}"] [data-action=detail]`)?.click(), salaA.id);
    await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-detail-body] .arena-round-card')), { descricao: 'o detalhe da sala' });
    await dormir(800);
    return pagina;
  };

  await estado('painel-durante', async () => {
    const painel = await abrirPainel(1440, 900);
    const lido = await medirPainel(painel, salaA.id);
    exigir(lido.detalheVisivel, 'o detalhe da sala não abriu');
    exigir(lido.missoesVisiveis === 3, `esperava as três missões no detalhe e vi ${lido.missoesVisiveis}`);
    medidas.painelDurante1440 = lido;
    await registrar(painel, '06-painel-durante-1440');
    await painel.setViewport({ width: 390, height: 844 });
    await dormir(600);
    medidas.painelDurante390 = await medirPainel(painel, salaA.id);
    await registrar(painel, '07-painel-durante-390');
    await painel.close();
  });

  // =========================================================================
  // 4. MISSÃO COM IMAGEM — a segunda, depois de fechar a primeira
  // =========================================================================
  await enviarDeTodos(salaA.id, turmaA);
  await post('arena_end_round', { room_id: salaA.id });
  // Fechar a rodada em exibição de resultados é um passo separado: sem ele o
  // servidor recusa abrir a missão seguinte ("Conclua a rodada atual e seus
  // resultados antes de iniciar outra missão").
  await post('arena_close_round', { room_id: salaA.id });
  await post('arena_start_round', { room_id: salaA.id });
  await estado('aluno-missao-imagem', async () => {
    const ana = await abrirAluno(turmaA[0], 390, 844);
    await esperarAluno(ana, () => {
      const img = document.querySelector('[data-arena-reversa-image]');
      return Boolean(img) && img.complete && img.naturalWidth > 0;
    }, 'a missão com imagem');
    const lido = await lerAluno(ana);
    exigir(lido.imagem?.carregou && lido.imagem?.visivel, `a imagem da missão não está pintada e carregada (${JSON.stringify(lido.imagem)})`);
    exigir(lido.tituloDaMissao?.includes('Reversa'), `a missão na tela não é a de imagem: ${lido.tituloDaMissao}`);
    medidas.alunoMissaoImagem390 = lido;
    await registrar(ana, '08-aluno-missao-imagem-390-topo');
    await rolarAte(ana, '[data-arena-prompt-form] button[type=submit]');
    await registrar(ana, '09-aluno-missao-imagem-390-fim');
    await ana.setViewport({ width: 1440, height: 900 });
    await dormir(400);
    await aoTopo(ana);
    medidas.alunoMissaoImagem1440 = await lerAluno(ana);
    await registrar(ana, '10-aluno-missao-imagem-1440');
    await ana.close();
  });

  // =========================================================================
  // 5. ENVIO (RASCUNHO) E AVALIAÇÃO — o mesmo aluno, antes e depois
  // =========================================================================
  await estado('aluno-rascunho-e-avaliacao', async () => {
    const ana = await abrirAluno(turmaA[0], 390, 844);
    await esperarAluno(ana, () => {
      const campo = document.querySelector('[data-arena-prompt-form] textarea');
      return Boolean(campo) && campo.checkVisibility();
    }, 'o campo de resposta do aluno');
    // Rascunho: o que o aluno escreveu e ainda não enviou. O produto guarda em
    // `sessionStorage`, então este estado tem de aparecer no campo e no envio.
    await ana.evaluate(() => {
      const campo = document.querySelector('[data-arena-prompt-form] textarea');
      campo.value = 'Prompt: biblioteca submersa, luz azul suave, peixes pequenos ao fundo, composição horizontal, estilo render 3D, sem texto na imagem.';
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await dormir(300);
    const rascunho = await lerAluno(ana);
    exigir(rascunho.rascunho?.includes('biblioteca submersa'), 'o rascunho não chegou ao campo');
    exigir(rascunho.enviarHabilitado === true, 'o envio está desabilitado com rascunho preenchido');
    medidas.alunoRascunho390 = rascunho;
    await rolarAte(ana, '[data-arena-prompt-form] button[type=submit]');
    await registrar(ana, '11-aluno-rascunho-390');

    // Envio de verdade, pelo botão da tela — não pela API: é o clique do aluno
    // que a evidência precisa cobrir.
    await ana.evaluate(() => document.querySelector('[data-arena-prompt-form] button[type=submit]').click());
    await esperarAluno(ana, () => {
      const nota = document.querySelector('.arena-result-score strong');
      const feedback = document.querySelector('[data-arena-feedback]');
      return Boolean(nota) && Boolean(feedback) && (feedback.innerText || '').trim().length > 20;
    }, 'a avaliação com nota e feedback');
    const avaliacao = await lerAluno(ana);
    exigir(avaliacao.temFeedback, 'a avaliação chegou sem feedback');
    exigir(Boolean(avaliacao.nota), 'a avaliação chegou sem nota');
    medidas.alunoAvaliacao390 = avaliacao;
    await aoTopo(ana);
    await registrar(ana, '12-aluno-avaliacao-390-topo');
    await rolarAte(ana, '[data-arena-feedback]');
    await registrar(ana, '13-aluno-avaliacao-390-fim');
    await ana.setViewport({ width: 1440, height: 900 });
    await dormir(400);
    await aoTopo(ana);
    medidas.alunoAvaliacao1440 = await lerAluno(ana);
    await registrar(ana, '14-aluno-avaliacao-1440');
    await ana.close();
  });

  // A rodada fecha para os outros cinco (a da Ana já foi enviada pelo clique).
  const rodadaDaImagem = await codigoDaRodada(salaA.id);
  for (const aluno of turmaA.slice(1)) {
    await post('arena_submit', {
      participant_id: aluno.id, token: aluno.token, round_id: rodadaDaImagem.id,
      prompt: `Prompt da ${aluno.nome}: biblioteca submersa, luz azul, peixes ao fundo, sem texto.`,
    });
  }
  await post('arena_end_round', { room_id: salaA.id });
  await post('arena_close_round', { room_id: salaA.id });

  // =========================================================================
  // 6. ENCERRAMENTO DO ALUNO — sala encerrada, ranking na tela
  // =========================================================================
  await post('arena_end_room', { room_id: salaA.id });
  await estado('aluno-encerramento', async () => {
    const ana = await abrirAluno(turmaA[0], 390, 844);
    await esperarAluno(ana, () => /classifica|campe|final|encerrad/i.test(document.querySelector('[data-arena-mission-panel]')?.innerText || ''), 'o encerramento do aluno');
    const lido = await lerAluno(ana);
    exigir(lido.ranking > 0 || /campe|classifica/i.test(lido.textoDoFim), `o encerramento não trouxe classificação: ${lido.textoDoFim.slice(0, 120)}`);
    medidas.alunoEncerramento390 = lido;
    await registrar(ana, '15-aluno-encerramento-390');
    await ana.setViewport({ width: 1440, height: 900 });
    await dormir(400);
    medidas.alunoEncerramento1440 = await lerAluno(ana);
    await registrar(ana, '16-aluno-encerramento-1440');
    await ana.close();
  });

  // =========================================================================
  // 7. PAINEL DEPOIS DA PARTIDA
  // =========================================================================
  await estado('painel-depois', async () => {
    const painel = await abrirPainel(1440, 900);
    const lido = await medirPainel(painel, salaA.id);
    exigir(lido.detalheVisivel, 'o detalhe da sala não abriu depois da partida');
    medidas.painelDepois1440 = lido;
    await registrar(painel, '17-painel-depois-1440');
    await painel.setViewport({ width: 390, height: 844 });
    await dormir(600);
    medidas.painelDepois390 = await medirPainel(painel, salaA.id);
    await registrar(painel, '18-painel-depois-390');
    await painel.close();
  });

  // =========================================================================
  // 8. O WILD CARD — a votação do aluno e a votação na TV
  // =========================================================================
  // Sala Arena: o Wild Card abre com três rodadas configuradas, na primeira
  // (`competitorPlan`), e os três prompts sorteados NÃO votam — o votante sai do
  // resto da turma. É a regra do motor, não uma escolha do roteiro.
  const salaB = (await post('arena_create_room', {
    title: 'Batalha contra o Juiz', preset: 'arena', expected_players: 12,
    arena_rounds: 3, arena_boss_health: 3, arena_damage_threshold: 60,
    arena_attacks_per_round: 2, arena_teams: true,
  })).room;
  const { challenge: desafioB } = await post('arena_save_challenge', {
    title: 'Post do lançamento', modality: 'precisao',
    mission: missao('o post de lançamento do clube de robótica'),
    reference_text: 'Post com data, local e chamada para ação.',
    criteria: [{ criterion: 'objetivo', weight: 100 }],
  });
  await post('arena_add_round', { room_id: salaB.id, challenge_id: desafioB.id });
  await post('arena_publish_room', { room_id: salaB.id });
  const pinB = salaB.pin || salaB.code;
  const turmaB = [];
  for (const nome of ['Gabi', 'Hugo', 'Igor', 'Joana', 'Kaio', 'Lia']) turmaB.push(await entrar(pinB, nome));
  await post('arena_start_round', { room_id: salaB.id });
  await enviarDeTodos(salaB.id, turmaB);
  await post('arena_end_round', { room_id: salaB.id });
  await post('arena_mode_draw', { room_id: salaB.id, wildcard: true });
  const arena = (await post('arena_room_detail', { room_id: salaB.id })).detail.arena;
  const opcoes = arena?.wildcard?.options || [];
  const dentro = new Set(opcoes.map((o) => String(o.participant_id)));
  const votante = turmaB.find((p) => !dentro.has(String(p.id)));
  const emCampo = turmaB.find((p) => dentro.has(String(p.id)));

  await estado('aluno-votacao-wildcard', async () => {
    exigir(arena?.phase === 'wildcard', `a sala Arena não está no Wild Card (fase ${arena?.phase})`);
    exigir(opcoes.length === 3, `o Wild Card abriu com ${opcoes.length} opções, não três`);
    exigir(Boolean(votante) && Boolean(emCampo), 'sem votante fora do Wild Card ou sem aluno em campo');
    const pagina = await abrirAluno(votante, 390, 844);
    await esperarAluno(pagina, () => {
      const cartao = document.querySelector('[data-arena-mode-vote]');
      return Boolean(cartao) && cartao.checkVisibility() && document.querySelectorAll('[data-arena-vote-choice]').length > 0;
    }, 'o cartão de votação do Wild Card');
    const lido = await lerAluno(pagina);
    // Aceite do plano: a votação ativa não exibe a orientação de esperar junto.
    exigir(!lido.missaoVisivel, 'a votação e a missão apareceram ao mesmo tempo');
    exigir(lido.opcoesDoVoto === 3, `o votante viu ${lido.opcoesDoVoto} opções, não três`);
    // A afirmação que o atributo `hidden` escondia: o painel da missão não pode
    // estar PINTADO enquanto a turma vota.
    exigir(!lido.painelPintado, 'o painel da missão continua pintado durante a votação');
    exigir(!lido.vazioVisivel, 'a ilustração de espera ainda está na tela durante a votação');
    medidas.alunoVotacao390 = lido;
    await registrar(pagina, '19-aluno-votacao-390');
    await pagina.setViewport({ width: 1440, height: 900 });
    await dormir(400);
    medidas.alunoVotacao1440 = await lerAluno(pagina);
    await registrar(pagina, '20-aluno-votacao-1440');
    await pagina.close();

    // O outro lado da mesma regra: quem está em campo vê o cartão e não vota.
    const campo = await abrirAluno(emCampo, 390, 844);
    await esperarAluno(campo, () => {
      const cartao = document.querySelector('[data-arena-mode-vote]');
      return Boolean(cartao) && cartao.checkVisibility();
    }, 'a tela de quem está no Wild Card');
    const lidoCampo = await lerAluno(campo);
    exigir(lidoCampo.opcoesDoVoto === 0, `quem está no Wild Card viu ${lidoCampo.opcoesDoVoto} opções para votar`);
    medidas.alunoWildCardDentro390 = lidoCampo;
    await registrar(campo, '21-aluno-wildcard-em-campo-390');
    await campo.close();
  });

  await estado('tv-votacao', async () => {
    // A sessão da projeção é emitida AGORA e para ESTA sala: a sessão viaja num
    // cookie do navegador, e emitir token de outra sala depois derruba a TV em
    // cena para "Conectando a sala…".
    const resposta = await fetch(`${base}/api.php?action=arena_tv_token`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: salaB.id }),
    });
    exigir(resposta.ok, `arena_tv_token: ${resposta.status}`);
    const cookieTv = resposta.headers.get('set-cookie').split(';')[0];
    const tv = await abrirPagina(browser, {
      viewport: { width: 1920, height: 1080 },
      cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
    });
    tv.on('pageerror', (erro) => falhas.push(`pageerror tv: ${erro.message.slice(0, 140)}`));
    await tv.goto(`${base}/tv.php?pin=${encodeURIComponent(pinB)}`, { waitUntil: 'domcontentloaded' });
    await esperarPor(tv, () => Boolean(document.querySelector('.arena-tv-question')), { descricao: 'a pergunta do Wild Card na TV' });
    const lido = await tv.evaluate(() => {
      const conteudo = document.querySelector('[data-tv-content]');
      const pergunta = document.querySelector('.arena-tv-question');
      const painelDaMissao = document.querySelector('[data-tv-stage]');
      return {
        classeDoConteudo: conteudo ? String(conteudo.className).split(' ').slice(0, 3).join(' ') : null,
        pergunta: pergunta?.querySelector('small')?.textContent.trim() || null,
        opcoes: [...document.querySelectorAll('.arena-tv-options li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)),
        rodapeDaPergunta: document.querySelector('.arena-tv-question-foot')?.textContent.trim() || null,
        // A TV mostra a pergunta OU o palco da MISSÃO, nunca os dois. O alvo é o
        // bloco da rodada (`.arena-tv-round`), e não o palco inteiro: o palco é o
        // contêiner que contém a própria pergunta, e perguntar a ele se ele
        // mostra a pergunta era uma medida que se respondia sozinha.
        rodadaNoAr: (() => { const bloco = document.querySelector('.arena-tv-round'); return Boolean(bloco) && bloco.checkVisibility(); })(),
        blocosPintados: [...document.querySelectorAll('[data-tv-content] > *')].filter((no) => no.checkVisibility()).map((no) => String(no.className).split(' ')[0]),
        alturaDaBarra: Math.round(document.querySelector('.arena-tv-topbar').getBoundingClientRect().height),
        topoDoConteudo: Math.round(conteudo.getBoundingClientRect().top),
      };
    });
    exigir(/WILD CARD/i.test(lido.pergunta || ''), `a TV não está mostrando o Wild Card: ${lido.pergunta}`);
    exigir(lido.opcoes.length === 3, `a TV mostrou ${lido.opcoes.length} opções, não três`);
    exigir(!lido.rodadaNoAr, 'a TV mostrou a missão e a pergunta do Wild Card ao mesmo tempo');
    medidas.tvVotacao1920 = lido;
    await registrar(tv, '22-tv-votacao-1920x1080');
    await tv.setViewport({ width: 1280, height: 720 });
    await dormir(500);
    medidas.tvVotacao1280 = await tv.evaluate(() => ({
      pergunta: document.querySelector('.arena-tv-question small')?.textContent.trim() || null,
      opcoes: document.querySelectorAll('.arena-tv-options li').length,
      rolagem: Math.round(document.documentElement.scrollHeight) - window.innerHeight,
    }));
    await registrar(tv, '23-tv-votacao-1280x720');
    await tv.close();
  });

  writeFileSync(new URL('medida.json', dir), JSON.stringify({ medidas, falhas, limites }, null, 2));
  console.log(`\n${falhas.length} falha(s), ${limites.length} limite(s) declarado(s)`);
  for (const linha of falhas) console.log(`  - ${linha}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  opened.close();
}

// Um estado que não foi provado NÃO é sucesso: o roteiro termina vermelho para
// que a falta apareça em quem roda, e não só no arquivo de medida.
process.exit(falhas.length ? 1 : 0);
