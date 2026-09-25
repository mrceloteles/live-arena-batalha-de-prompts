// O painel travar ou só a FOTO travar?
//
// A jornada do professor morre em `Page.captureScreenshot timed out` logo depois
// de "aceitar as sugestões de tempo". Duas causas possíveis, e a diferença é
// enorme: (a) a thread principal fica presa num laço — defeito do produto, o
// professor trava junto; (b) a página está viva e respondendo, e é a captura que
// não fecha (camada de composição, animação sem fim). Esta sonda separa as duas:
// mede o tempo de `evaluate`, o de um laço de 5M de iterações (orçamento de CPU
// da thread), pergunta ao rAF se o quadro está andando e conta tarefas longas.
//
// Uso: BASE=http://127.0.0.1:3000 node tmp/qa/sonda-travamento-painel.mjs
import { setTimeout as esperar } from 'node:timers/promises';
import puppeteer from 'puppeteer';

process.loadEnvFile('.env');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SENHA = process.env.ADMIN_PASSWORD;

const login = await fetch(`${BASE}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: SENHA }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = async (acao, carga = {}) => {
  const resposta = await fetch(`${BASE}/api.php?action=${acao}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(carga),
  });
  const corpo = await resposta.json();
  if (!resposta.ok) throw new Error(`${acao}: ${JSON.stringify(corpo)}`);
  return corpo;
};

const titulo = `QA SONDA TRAVAMENTO ${Date.now() % 100000}`;
const { room } = await post('arena_create_room', { title: titulo, preset: 'personalizado', expected_players: 2 });
const { challenge } = await post('arena_save_challenge', {
  title: `${titulo} — missão`, modality: 'precisao',
  mission: 'Escreva o prompt da missão.', reference_text: 'Gabarito do juiz.',
  criteria: [{ criterion: 'objetivo', weight: 100 }],
});
await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
console.log(`sala ${titulo} · PIN ${room.pin || room.code}`);

const navegador = await puppeteer.launch({ headless: true, args: ['--disable-lcd-text'] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 960 });
pagina.on('pageerror', (erro) => console.log('PAGEERROR:', erro.message));
await pagina.setCookie({ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' });
await pagina.goto(`${BASE}/admin-arena.php`);

// Observador de tarefas longas: se a thread travar, elas aparecem.
await pagina.evaluate(() => {
  window.__longas = [];
  try {
    new PerformanceObserver((lista) => window.__longas.push(...lista.getEntries().map((e) => Math.round(e.duration))))
      .observe({ entryTypes: ['longtask'] });
  } catch {}
});

const clicar = (seletor) => pagina.evaluate((sel) => {
  const no = document.querySelector(sel);
  if (!no) throw new Error(`não achei ${sel}`);
  no.click();
}, seletor);

await pagina.waitForSelector(`[data-room-id="${room.id}"] [data-action=detail]`, { timeout: 30_000 });
await clicar(`[data-room-id="${room.id}"] [data-action=detail]`);
await pagina.waitForSelector(`[data-room-id="${room.id}"] [data-action=detail]`);
await pagina.waitForSelector('[data-room-timing]');
await clicar('[data-room-timing]');
await pagina.waitForSelector('[data-room-timing-form] [data-timing-item]');
await clicar('[data-timing-apply-suggestions]');
await pagina.waitForFunction(() => !/sem cronômetro/.test(document.querySelector('[data-timing-total]')?.textContent || ''));
console.log('sugestões aplicadas:', await pagina.$eval('[data-timing-total]', (n) => n.textContent.trim()));

// --- diagnóstico: a thread responde? o quadro anda?
const rodada = async (rotulo) => {
  const t0 = Date.now();
  const eco = await Promise.race([
    pagina.evaluate(() => 2 + 2),
    esperar(10_000).then(() => 'ESTOUROU 10s'),
  ]);
  const antes = Date.now();
  const cpu = await Promise.race([
    pagina.evaluate(() => {
      const t = performance.now();
      let soma = 0;
      for (let i = 0; i < 5_000_000; i += 1) soma += i;
      return { ms: Math.round(performance.now() - t), soma };
    }),
    esperar(10_000).then(() => null),
  ]);
  const quadro = await Promise.race([
    pagina.evaluate(() => new Promise((resolve) => requestAnimationFrame((t) => resolve(Math.round(t))))),
    esperar(5_000).then(() => 'SEM QUADRO'),
  ]);
  console.log(`${rotulo}: eco=${eco} (${Date.now() - t0} ms) · laço 5M=${cpu ? `${cpu.ms} ms` : 'ESTOUROU'} · rAF=${quadro}`);
  if (cpu) console.log(`  (o laço levou ${antes ? Date.now() - antes : '?'} ms na máquina)`);
};

await rodada('depois das sugestões');
await pagina.screenshot({ path: 'tmp/qa/jornada/sonda-antes.png', timeout: 15_000 })
  .then(() => console.log('foto imediata: ok'))
  .catch((erro) => console.log('foto imediata: FALHOU —', erro.message.split('\n')[0]));
await esperar(2500);
await rodada('2,5 s depois');
await pagina.screenshot({ path: 'tmp/qa/jornada/sonda-depois.png', timeout: 15_000 })
  .then(() => console.log('foto 2,5 s depois: ok'))
  .catch((erro) => console.log('foto 2,5 s depois: FALHOU —', erro.message.split('\n')[0]));

console.log('tarefas longas (ms):', (await pagina.evaluate(() => window.__longas || [])).slice(-12));
console.log('animações sem fim:', await pagina.evaluate(() => {
  const nomes = new Set();
  for (const el of document.querySelectorAll('*')) {
    const estilo = getComputedStyle(el);
    if (estilo.animationName && estilo.animationName !== 'none' && estilo.animationIterationCount === 'infinite') {
      nomes.add(`${el.className || el.tagName} → ${estilo.animationName} (${estilo.animationDuration})`);
    }
  }
  return [...nomes];
}));
await navegador.close();
