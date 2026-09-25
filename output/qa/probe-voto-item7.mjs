// Sonda: o que está PINTADO quando a votação do Wild Card está na tela?
//
// Três perguntas, uma execução:
// 1. o painel da missão está escondido durante a votação? (e a espera dentro dele?)
// 2. o que a TV mostra no Wild Card — a pergunta, o palco da missão, os dois?
// 3. a imagem da missão `reversa` carrega? (o harness mediu o <img> errado)
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const dir = new URL('../auditoria-refino-etapa6/item7/probe/', import.meta.url);
mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const server = createServer(createApplication({
  repositories, judge: createFakeJudge(),
  arenaJudge: async () => ({ percent: 80, breakdown: { a: 80 }, feedback: 'ok' }),
  adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
if (!login.ok) throw new Error(`admin_login: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = async (action, payload = {}) => {
  const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const b = await r.json();
  if (!r.ok) throw new Error(`${action}: ${JSON.stringify(b)}`);
  return b;
};
const entrar = async (pin, name) => {
  const r = await fetch(`${base}/api.php?action=arena_join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: pin, name }) });
  const b = await r.json();
  if (!b.ok) throw new Error(`join ${name}: ${JSON.stringify(b)}`);
  return { name, id: b.participant.id, token: b.token };
};

await post('arena_set_open', { open: true });

// --- Sala de missão, com a missão `reversa` que tem imagem -------------------
const salaA = (await post('arena_create_room', { title: 'Mostra', preset: 'personalizado', expected_players: 6 })).room;
const { challenge } = await post('arena_save_challenge', {
  title: 'Reversa: aquário profundo', modality: 'reversa',
  mission: 'Escreva o prompt que produziu esta imagem.',
  reference_text: 'Biblioteca submersa com luz azul e peixes.',
  reference_image: '/public/assets/figma/challenge-underwater-library.webp',
  criteria: [{ criterion: 'objetivo', weight: 100 }],
});
await post('arena_add_round', { room_id: salaA.id, challenge_id: challenge.id });
await post('arena_publish_room', { room_id: salaA.id });
const pinA = salaA.pin || salaA.code;
const ana = await entrar(pinA, 'Ana');

// --- Sala Arena, até o Wild Card --------------------------------------------
const salaB = (await post('arena_create_room', {
  title: 'Arena', preset: 'arena', expected_players: 12,
  arena_rounds: 3, arena_boss_health: 3, arena_damage_threshold: 60, arena_attacks_per_round: 2, arena_teams: true,
})).room;
const { challenge: desafioB } = await post('arena_save_challenge', {
  title: 'Post', modality: 'precisao', mission: 'Escreva o prompt do post.',
  reference_text: 'Post com data e local.', criteria: [{ criterion: 'objetivo', weight: 100 }],
});
await post('arena_add_round', { room_id: salaB.id, challenge_id: desafioB.id });
await post('arena_publish_room', { room_id: salaB.id });
const pinB = salaB.pin || salaB.code;
const turma = [];
for (const nome of ['Gabi', 'Hugo', 'Igor', 'Joana', 'Kaio', 'Lia']) turma.push(await entrar(pinB, nome));
await post('arena_start_round', { room_id: salaB.id });
const rodada = (await post('arena_room_detail', { room_id: salaB.id })).detail.rounds.find((r) => r.status === 'open');
for (const aluno of turma) {
  await post('arena_submit', { participant_id: aluno.id, token: aluno.token, round_id: rodada.id, prompt: `Prompt de ${aluno.name} com contexto, público e formato.` });
}
await post('arena_end_round', { room_id: salaB.id });
await post('arena_mode_draw', { room_id: salaB.id, wildcard: true });
const arena = (await post('arena_room_detail', { room_id: salaB.id })).detail.arena;
const dentro = new Set((arena.wildcard?.options || []).map((o) => String(o.participant_id)));
const votante = turma.find((p) => !dentro.has(String(p.id)));
console.log(`fase ${arena.phase} · ${arena.wildcard.options.length} opções · votante ${votante.name}`);

const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const abrirAluno = async (aluno, largura, altura) => {
  const p = await abrirPagina(browser, { viewport: { width: largura, height: altura } });
  p.on('pageerror', (e) => console.log('  pageerror', e.message.slice(0, 120)));
  await p.goto(`${base}/play`, { waitUntil: 'domcontentloaded' });
  await p.evaluate((s) => { localStorage.setItem('arena.participant_id', String(s.id)); localStorage.setItem('arena.token', s.token); }, aluno);
  await p.goto(`${base}/play`, { waitUntil: 'domcontentloaded' });
  await esperarPor(p, () => Boolean(document.querySelector('[data-arena-mission-panel]')), { descricao: 'a tela do aluno' });
  await dormir(700);
  return p;
};

const DIAGNOSTICO = `(() => {
  const linha = (rotulo, no) => {
    if (!no) return { rotulo, existe: false };
    const s = getComputedStyle(no);
    const r = no.getBoundingClientRect();
    const pai = no.parentElement;
    return {
      rotulo,
      existe: true,
      atributoHidden: no.hasAttribute('hidden'),
      display: s.display,
      visibility: s.visibility,
      checkVisibility: no.checkVisibility(),
      retangulo: Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top),
      pai: pai ? (String(pai.className).split(' ')[0] + (pai.hasAttribute('hidden') ? '[hidden]' : '')) : null,
      displayDoPai: pai ? getComputedStyle(pai).display : null,
      texto: (no.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
    };
  };
  const cadeia = (no) => {
    const lista = [];
    let n = no;
    while (n && n !== document.documentElement) {
      lista.push(String(n.tagName.toLowerCase()) + '.' + String(n.className).split(' ')[0]
        + (n.hasAttribute('hidden') ? '[hidden]' : '') + (n.hasAttribute('data-arena-screen') ? '[screen]' : ''));
      n = n.parentElement;
    }
    return lista;
  };
  // TODAS as regras que casam e declaram display, na ordem das folhas: é o que
  // diz quem venceu o catch-all importante de [data-arena-screen] [hidden].
  const regras = (no) => {
    const saida = [];
    const varrer = (lista, contexto) => {
      for (const r of lista) {
        if (r.cssRules && r.conditionText !== undefined) { varrer(r.cssRules, r.conditionText); continue; }
        if (!r.selectorText || !r.style || !/display/.test(r.style.cssText)) continue;
        for (const sel of r.selectorText.split(',')) {
          const s = sel.trim();
          try { if (no.matches(s)) { saida.push((contexto ? '@' + contexto + ' ' : '') + s + ' {' + r.style.cssText.slice(0, 70) + '}'); break; } } catch { /* seletor não suportado */ }
        }
      }
    };
    for (const folha of document.styleSheets) {
      let conteudo; try { conteudo = folha.cssRules; } catch { continue; }
      varrer(conteudo, '');
    }
    return saida;
  };
  const alvo = document.querySelector('[data-arena-mission-panel]');
  return {
    cartaoDeVoto: linha('cartaoDeVoto', document.querySelector('[data-arena-mode-vote]')),
    painelDaMissao: linha('painelDaMissao', alvo),
    espera: linha('espera', document.querySelector('[data-arena-mission-empty]')),
    missao: linha('missao', document.querySelector('[data-arena-mission]')),
    opcoes: [...document.querySelectorAll('[data-arena-vote-choice]')].map((n) => ({ checkVisibility: n.checkVisibility(), texto: n.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60) })),
    cadeiaDoPainel: cadeia(alvo),
    regrasDeDisplayNoPainel: regras(alvo),
  };
})()`;

// --- 1. O votante: o que está pintado ---------------------------------------
const votantePagina = await abrirAluno(votante, 390, 844);
console.log('\n=== VOTANTE: quem está na tela ===');
console.log(JSON.stringify(await votantePagina.evaluate(DIAGNOSTICO), null, 2));
await votantePagina.screenshot({ path: fileURLToPath(new URL('votante.png', dir)) });
await votantePagina.close();

// --- 2. A TV no Wild Card ----------------------------------------------------
const resposta = await fetch(`${base}/api.php?action=arena_tv_token`, {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: salaB.id }),
});
const cookieTv = resposta.headers.get('set-cookie').split(';')[0];
const tv = await abrirPagina(browser, {
  viewport: { width: 1920, height: 1080 },
  cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
});
await tv.goto(`${base}/tv.php?pin=${encodeURIComponent(pinB)}`, { waitUntil: 'domcontentloaded' });
await esperarPor(tv, () => Boolean(document.querySelector('.arena-tv-question')), { descricao: 'a pergunta na TV' });
await dormir(500);
console.log('\n=== TV: o que está na tela ===');
console.log(JSON.stringify(await tv.evaluate(`(() => {
  const visivel = (no) => Boolean(no) && no.checkVisibility();
  const conteudo = document.querySelector('[data-tv-content]');
  const palco = document.querySelector('[data-tv-stage]');
  const filhos = (raiz) => raiz ? [...raiz.children].map((no) => ({ classe: String(no.className).split(' ')[0], visivel: visivel(no), altura: Math.round(no.getBoundingClientRect().height) })) : [];
  return {
    classeDoConteudo: String(conteudo.className),
    palcoEhFilhoDe: palco && palco.parentElement ? String(palco.parentElement.className).split(' ')[0] : null,
    conteudoEhFilhoDe: conteudo.parentElement ? String(conteudo.parentElement.className).split(' ')[0] : null,
    filhosDoPalco: filhos(palco),
    filhosDoConteudo: filhos(conteudo),
    perguntaVisivel: visivel(document.querySelector('.arena-tv-question')),
    pergunta: document.querySelector('.arena-tv-question small') ? document.querySelector('.arena-tv-question small').textContent.trim() : null,
    opcoes: [...document.querySelectorAll('.arena-tv-options li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim().slice(0, 50)),
    rodadaVisivel: visivel(document.querySelector('.arena-tv-round')),
    textoDaRodada: (document.querySelector('.arena-tv-round') ? document.querySelector('.arena-tv-round').innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 90),
  };
})()`), null, 2));
await tv.screenshot({ path: fileURLToPath(new URL('tv.png', dir)) });
await tv.close();

// --- 3. A imagem da missão `reversa`, na sala de missão ----------------------
await post('arena_start_round', { room_id: salaA.id });
await dormir(300);
const paginaDaImagem = await abrirAluno(ana, 390, 844);
await esperarPor(paginaDaImagem, () => {
  const img = document.querySelector('[data-arena-reversa-image]');
  return Boolean(img) && img.complete && img.naturalWidth > 0;
}, { descricao: 'a imagem da missão reversa' });
console.log('\n=== IMAGEM DA MISSÃO ===');
console.log(JSON.stringify(await paginaDaImagem.evaluate(`(() => {
  const visivel = (no) => Boolean(no) && no.checkVisibility();
  const fila = (no) => { if (!no) return null; const r = no.getBoundingClientRect(); return { visivel: visivel(no), display: getComputedStyle(no).display, temSrc: Boolean(no.getAttribute('src')), carregou: no.complete && no.naturalWidth > 0, medida: no.naturalWidth + 'x' + no.naturalHeight, retangulo: Math.round(r.width) + 'x' + Math.round(r.height) }; };
  return {
    reversa: fila(document.querySelector('[data-arena-reversa-image]')),
    classica: fila(document.querySelector('[data-arena-classic-image]')),
    palco: fila(document.querySelector('[data-arena-reversa]')),
    titulo: document.querySelector('[data-arena-mission-title]') ? document.querySelector('[data-arena-mission-title]').textContent.trim() : null,
  };
})()`), null, 2));
await paginaDaImagem.screenshot({ path: fileURLToPath(new URL('missao-imagem.png', dir)) });
await paginaDaImagem.close();

await browser.close();
server.closeAllConnections();
server.close();
opened.close();
console.log('\nprints e diagnóstico em output/auditoria-refino-etapa6/item7/probe/');
