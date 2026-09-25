// Captura e mede a etapa 5 do refinamento visual de 16/09/2026: os FORMULÁRIOS
// longos — novo desafio, tempo das missões e nova sala.
//
//   node output/qa/refino-etapa5.mjs antes
//   node output/qa/refino-etapa5.mjs depois
//
// Grava output/auditoria-refino-etapa5/<rotulo>/*.png e medida.json.
//
// O que cada número prova, e por quê. O plano pede quatro coisas concretas:
// 1. novo desafio: menos "caixa dentro de caixa" — então mede-se, por dobra
//    interna, a borda e o fundo declarados, e o vão entre os dois grupos;
// 2. tempo das missões: não duplicar a mesma duração em selo e campo — mede-se o
//    texto do selo ANTES de mexer no campo (o estado em que o professor chega) e
//    depois de digitar um valor diferente, que é quando o selo passa a dizer
//    algo que o campo não diz. A sala de cinco missões é a que rola; a de uma é
//    onde o aviso "todas já têm cronômetro" aparece;
// 3. padronizar "usar sugestão" com os secundários — mede-se o estilo computado
//    dele ao lado do estilo de "Salvar tempos", em vez de julgar no olho;
// 4. salvar alcançável na tela baixa — mede-se se o botão cai dentro da janela
//    visível do corpo do diálogo com a rolagem no topo, e se o último campo
//    fica inteiro acima da barra quando a rolagem chega ao fim.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor, clicarAte } from '../../test/support/navegador.mjs';

const rotulo = (process.argv[2] || 'antes').replace(/[^a-z0-9-]/gi, '');
const dir = new URL(`../auditoria-refino-etapa5/${rotulo}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const senha = 'browser-test-password';
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const server = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Bom caminho.' }),
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

await post('arena_set_open', { open: true });
const criarDesafio = (titulo, seconds = null) => post('arena_save_challenge', {
  title: titulo, modality: seconds ? 'precisao' : 'reversa',
  mission: `Escreva o prompt que gera ${titulo.toLowerCase()} para a turma do ensino médio.`,
  context: 'Turma do ensino médio.', reference_text: `Referência de ${titulo}.`,
  duration_seconds: seconds || undefined,
  criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
});

// A sala longa: cinco missões, quatro sem cronômetro. É a que rola e a que tem
// sugestões a aceitar. A sala de uma missão é onde vive o aviso "todas já têm
// cronômetro" — o estado que o plano diz poder ser omitido.
const { room } = await post('arena_create_room', { title: 'Sala da aula', preset: 'personalizado', expected_players: 6 });
const { challenge: comTempo } = await criarDesafio('Cartaz da feira', 120);
await post('arena_add_round', { room_id: room.id, challenge_id: comTempo.id });
for (const titulo of ['Post de robótica', 'Convite da mostra', 'Bilhete da reunião', 'Legenda do vídeo']) {
  const { challenge } = await criarDesafio(titulo);
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
}
const { room: salaCurta } = await post('arena_create_room', { title: 'Sala só com tempo', preset: 'personalizado', expected_players: 3 });
await post('arena_add_round', { room_id: salaCurta.id, challenge_id: comTempo.id });

const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const medidas = {};
const pendentes = [];
const pagina = await abrirPagina(browser, {
  viewport: { width: 1440, height: 900 },
  cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
});

const registrar = async (nome) => {
  await pagina.bringToFront();
  try {
    await dormir(350);
    await pagina.screenshot({ path: fileURLToPath(new URL(`${nome}.png`, dir)) });
    console.log(`  ${nome}`);
  } catch (erro) {
    pendentes.push(`${nome}: ${erro.message.split('\n')[0]}`);
    console.log(`  PENDENTE ${nome}: ${erro.message.split('\n')[0]}`);
  }
};

const ESTILO = `(no) => {
  const s = getComputedStyle(no);
  const r = no.getBoundingClientRect();
  return {
    largura: Math.round(r.width), altura: Math.round(r.height),
    fundo: s.backgroundColor, gradiente: s.backgroundImage !== 'none',
    cor: s.color, borda: s.borderTopWidth + ' ' + s.borderTopColor,
    raio: s.borderRadius, sombra: s.boxShadow === 'none' ? null : s.boxShadow.slice(0, 40),
    fonte: s.fontSize, peso: s.fontWeight, padding: s.padding,
  };
}`;

// O diálogo é um só no DOM: o que muda entre as medições é o formulário dentro
// dele. Estas linhas leem o que é comum — corpo rolável, barra de salvar e se
// ela está dentro da janela visível, e qual controle fica mais perto dela.
const BASE_DO_DIALOGO = `() => {
  const estilo = ${ESTILO};
  const dialogo = document.querySelector('[data-arena-dialog]');
  const corpo = dialogo.querySelector('[data-arena-dialog-body]');
  const cartao = dialogo.querySelector('.arena-dialog-card');
  const submit = [...corpo.querySelectorAll('button[type=submit]')].pop();
  const cr = corpo.getBoundingClientRect();
  const sr = submit?.getBoundingClientRect();
  const s = submit ? getComputedStyle(submit) : null;
  // O último controle antes do botão: é ele que a barra não pode cobrir.
  // offsetParent não serve aqui: o conteúdo de uma dobra FECHADA continua com
  // caixa no Chrome (content-visibility, não display none), então o "último
  // campo" seria um campo que ninguém vê.
  const pintado = (n) => n.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true });
  const antesDoBotao = [...corpo.querySelectorAll('input:not([type=hidden]),select,textarea')]
    .filter(pintado)
    .pop();
  const ur = antesDoBotao ? antesDoBotao.getBoundingClientRect() : null;
  return {
    corpo: {
      scrollTop: Math.round(corpo.scrollTop),
      scrollHeight: Math.round(corpo.scrollHeight),
      clientHeight: Math.round(corpo.clientHeight),
      rolagem: Math.round(corpo.scrollHeight - corpo.clientHeight),
      scrolladores: [...dialogo.querySelectorAll('*')].filter((n) => {
        const g = getComputedStyle(n);
        return /auto|scroll/.test(g.overflowY) && n.scrollHeight > n.clientHeight + 2;
      }).map((n) => [n.tagName.toLowerCase(), String(n.className || '').trim().split(/\\s+/)[0]].filter(Boolean).join('.')),
    },
    ultimoCampo: antesDoBotao ? {
      nome: antesDoBotao.name || antesDoBotao.type,
      topoNaJanela: Math.round(ur.top - cr.top),
      fundoNaJanela: Math.round(ur.bottom - cr.top),
      inteiroNaJanela: ur.top >= cr.top - 1 && ur.bottom <= cr.bottom + 1,
    } : null,
    barra: submit ? {
      rotulo: submit.textContent.trim(),
      posicao: s.position,
      topoNaJanela: Math.round(sr.top - cr.top),
      dentroDaJanela: sr.top >= cr.top - 1 && sr.bottom <= cr.bottom + 1,
      tapaUltimoCampo: ur ? ur.bottom > sr.top + 1 : null,
      estilo: estilo(submit),
    } : null,
  };
}`;

const medirNovoDesafio = () => pagina.evaluate(`(() => {
  const form = document.querySelector('[data-challenge-form]');
  const grupos = [...form.querySelectorAll('.arena-form-group')];
  return {
    ...(${BASE_DO_DIALOGO})(),
    folgas: {
      form: getComputedStyle(form).gap,
      grupo: getComputedStyle(grupos[0]).gap,
      entreGrupos: Math.round(grupos[1].getBoundingClientRect().top - grupos[0].getBoundingClientRect().bottom),
    },
    grupos: grupos.map((g) => ({
      legenda: g.querySelector(':scope > legend')?.textContent.trim(),
      borda: getComputedStyle(g).borderTopWidth,
      padding: getComputedStyle(g).padding,
      altura: Math.round(g.getBoundingClientRect().height),
      divisores: [...g.querySelectorAll('.arena-form-fold')].map((f) => ({
        borda: getComputedStyle(f).borderTopWidth + ' ' + getComputedStyle(f).borderTopStyle,
        fundo: getComputedStyle(f).backgroundColor,
        raio: getComputedStyle(f).borderRadius,
        padding: getComputedStyle(f).padding,
      })),
    })),
    dobras: [...form.querySelectorAll('.arena-form-fold')].map((f) => ({
      chave: f.dataset.formFold || 'criterios',
      dentroDeGrupo: Boolean(f.closest('.arena-form-group')),
      aberta: f.open,
      alca: f.querySelector('summary')?.textContent.replace(/\\s+/g, ' ').trim(),
      altura: Math.round(f.getBoundingClientRect().height),
    })),
    alturaDoForm: Math.round(form.getBoundingClientRect().height),
  };
})()`);

const medirTempos = () => pagina.evaluate(`(() => {
  const form = document.querySelector('[data-room-timing-form]');
  const estilo = ${ESTILO};
  const linhas = [...form.querySelectorAll('[data-timing-item]')].map((item) => {
    const selo = item.querySelector('.arena-timing-now');
    const campo = item.querySelector('[data-timing-input]');
    return {
      titulo: item.querySelector('legend strong')?.textContent.trim(),
      campo: campo?.value,
      selo: selo ? {
        texto: selo.textContent.trim(),
        pintado: selo.checkVisibility ? selo.checkVisibility() : selo.offsetParent !== null,
        display: getComputedStyle(selo).display,
      } : null,
      selosNaLinha: item.querySelectorAll('.arena-timing-now').length,
    };
  });
  const acoes = form.querySelector('.arena-timing-actions');
  const sugestao = form.querySelector('[data-timing-use]');
  return {
    ...(${BASE_DO_DIALOGO})(),
    linhas,
    acoesDoTopo: acoes ? {
      texto: acoes.textContent.replace(/\\s+/g, ' ').trim(),
      pintado: acoes.checkVisibility ? acoes.checkVisibility() : true,
      altura: Math.round(acoes.getBoundingClientRect().height),
      filhos: [...acoes.children].map((n) => n.tagName),
    } : null,
    botaoAceitar: form.querySelector('[data-timing-apply-suggestions]')
      ? estilo(form.querySelector('[data-timing-apply-suggestions]')) : null,
    botaoSugestao: sugestao ? { rotulo: sugestao.textContent.trim(), ...estilo(sugestao) } : null,
    total: form.querySelector('[data-timing-total]')?.textContent.trim(),
  };
})()`);

const medirNovaSala = () => pagina.evaluate(`(() => {
  const form = document.querySelector('[data-arena-create-room]');
  const dica = form.querySelector('[data-arena-preset-hint]');
  const resumo = form.querySelector('[data-arena-room-arena]');
  const sd = dica ? getComputedStyle(dica) : null;
  return {
    ...(${BASE_DO_DIALOGO})(),
    dica: dica ? {
      tag: dica.tagName.toLowerCase(),
      classe: dica.className,
      texto: dica.textContent.trim(),
      altura: Math.round(dica.getBoundingClientRect().height),
      margem: sd.margin,
      fonte: sd.fontSize,
      peso: sd.fontWeight,
      cor: sd.color,
      reserva: sd.minHeight,
    } : null,
    resumo: resumo ? {
      aberto: resumo.open,
      escondido: resumo.hidden,
      alca: resumo.querySelector('summary')?.textContent.replace(/\\s+/g, ' ').trim(),
      altura: Math.round(resumo.getBoundingClientRect().height),
      camposDentro: resumo.querySelectorAll('input,select').length,
    } : null,
    campos: [...form.querySelectorAll('label > span')].slice(0, 3).map((n) => n.textContent.trim()),
  };
})()`);

const fecharDialogo = async () => {
  await pagina.evaluate(() => document.querySelector('[data-arena-dialog-close]')?.click());
  await dormir(350);
};

const abrirDetalheDaSala = async (id) => {
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-room-list] [data-room-id]')), { descricao: 'a lista de salas' });
  await pagina.evaluate((alvo) => {
    document.querySelector(`[data-room-id="${alvo}"] [data-action=detail]`)?.click();
  }, id);
  await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-detail-body] .arena-round-card')), { descricao: 'o detalhe da sala' });
  await dormir(600);
};

const abrirTodosOsFoldes = () => pagina.evaluate(() => {
  document.querySelectorAll('[data-arena-dialog] details').forEach((d) => { d.open = true; });
});
const rolarAoTopo = () => pagina.evaluate(() => { document.querySelector('[data-arena-dialog-body]').scrollTop = 0; });
const rolarAoFim = () => pagina.evaluate(() => {
  const corpo = document.querySelector('[data-arena-dialog-body]');
  corpo.scrollTop = corpo.scrollHeight;
});

try {
  await pagina.goto(`${base}/admin-arena.php`);
  await abrirDetalheDaSala(room.id);

  // --- Nova sala: a dica do modo de jogo e o resumo da partida --------------
  await pagina.evaluate(() => document.querySelector('[onclick="openCreateRoomDialog()"]')?.click());
  await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-create-room]')), { descricao: 'o formulário de nova sala' });
  await pagina.evaluate(() => document.querySelector('[data-arena-preset]')?.dispatchEvent(new Event('change', { bubbles: true })));
  await pagina.select('[data-arena-preset]', 'arena');
  await dormir(400);
  medidas.novaSala = await medirNovaSala();
  await registrar('01-nova-sala-1440');
  await pagina.setViewport({ width: 1280, height: 720 });
  await dormir(400);
  await rolarAoTopo();
  medidas.novaSalaBaixa = await medirNovaSala();
  await registrar('02-nova-sala-1280x720');
  await pagina.setViewport({ width: 1440, height: 900 });
  await dormir(300);
  await fecharDialogo();

  // --- Novo desafio: caixa dentro de caixa e a barra de salvar -------------
  await clicarAte(pagina, '[data-arena-new-challenge]',
    () => Boolean(document.querySelector('[data-arena-dialog]')?.open && document.querySelector('[data-challenge-form]')),
    { descricao: 'o formulário de novo desafio' });
  await dormir(300);
  medidas.novoDesafio = await medirNovoDesafio();
  await registrar('03-novo-desafio-fechado-1440');
  // O formulário longo de verdade é o de todas as dobras abertas.
  await abrirTodosOsFoldes();
  await dormir(400);
  medidas.novoDesafioAberto = await medirNovoDesafio();
  await registrar('04-novo-desafio-aberto-1440');
  await pagina.setViewport({ width: 1280, height: 720 });
  await dormir(400);
  await rolarAoTopo();
  medidas.novoDesafioBaixaTopo = await medirNovoDesafio();
  await registrar('05-novo-desafio-1280x720-topo');
  await rolarAoFim();
  await dormir(300);
  medidas.novoDesafioBaixaFim = await medirNovoDesafio();
  await registrar('06-novo-desafio-1280x720-fim');
  await pagina.setViewport({ width: 390, height: 844 });
  await dormir(400);
  await rolarAoTopo();
  medidas.novoDesafioCelular = await medirNovoDesafio();
  await registrar('07-novo-desafio-celular');
  await pagina.setViewport({ width: 1440, height: 900 });
  await dormir(300);
  await fecharDialogo();

  // --- Tempo das missões: cinco linhas, quatro sem cronômetro --------------
  await pagina.bringToFront();
  await clicarAte(pagina, '[data-room-timing]',
    () => Boolean(document.querySelector('[data-room-timing-form] [data-timing-item]')),
    { descricao: 'o ajuste dos tempos da aula abrir' });
  await dormir(350);
  medidas.tempos = await medirTempos();
  await registrar('08-tempos-1440');
  // O momento em que o selo passa a dizer algo que o campo não diz: um rascunho
  // diferente do que está no ar.
  await pagina.evaluate(() => {
    const campo = document.querySelector('[data-timing-input]');
    campo.value = '3:00';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await dormir(300);
  medidas.temposComRascunho = await medirTempos();
  await registrar('09-tempos-rascunho');
  await pagina.setViewport({ width: 1280, height: 720 });
  await dormir(400);
  await rolarAoTopo();
  medidas.temposBaixa = await medirTempos();
  await registrar('10-tempos-1280x720');
  await pagina.setViewport({ width: 1440, height: 900 });
  await dormir(300);
  await fecharDialogo();

  // --- A sala em que TODAS as missões já têm cronômetro --------------------
  await abrirDetalheDaSala(salaCurta.id);
  await clicarAte(pagina, '[data-room-timing]',
    () => Boolean(document.querySelector('[data-room-timing-form] [data-timing-item]')),
    { descricao: 'o ajuste dos tempos da sala curta abrir' });
  await dormir(350);
  medidas.temposTudoComCronometro = await medirTempos();
  await registrar('11-tempos-todas-com-cronometro');
  await fecharDialogo();

  writeFileSync(new URL('medida.json', dir), JSON.stringify({ rotulo, medidas, pendentes }, null, 2));
  console.log(`\n${rotulo}: ${pendentes.length} pendente(s)`);
  for (const linha of pendentes) console.log(`  - ${linha}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  opened.close();
}
