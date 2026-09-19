// Teste focado do fluxo da UI em modo turma: cadastro real -> admin inicia -> telas.
import puppeteer from 'puppeteer';
import { appendFileSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch {}
const BASE = 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => { appendFileSync('var/ui-flow.log', `[${new Date().toLocaleTimeString('pt-BR')}] ${m}\n`); console.log(m); };

async function api(action, body = {}) {
  const r = await fetch(`${BASE}/api.php?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

(async () => {
  appendFileSync('var/ui-flow.log', '===== NOVO TESTE =====\n');
  const login = await api('admin_login', { password: ADMIN_PASSWORD });
  const adminToken = login.data.admin_token;
  log('reset: ' + (await api('admin_reset', { admin_token: adminToken })).status);
  log('config 2 PCs: ' + (await api('configure_classroom', { admin_token: adminToken, expected_players: 2 })).status);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('dialog', async (d) => { log('⚠️ DIALOG NATIVO: ' + d.message()); await d.dismiss(); });
  page.on('console', (m) => { if (m.type() === 'error') log('🖥 console.error: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => log('🖥 pageerror: ' + String(e).slice(0, 200)));

  await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
  log('carregou game.php station=1');
  await delay(600);
  const cta = await page.$('.start-cta');
  log('start-cta presente: ' + Boolean(cta));
  await cta.click();
  await delay(400);
  const formVisible = await page.evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen);
  log('apos clique no CTA, screen: ' + formVisible);
  await page.type('[name="name"]', 'Teste Fluxo', { delay: 5 });
  await page.type('[name="email"]', 'fluxo@teste.com', { delay: 5 });
  await page.type('[name="role"]', 'QA', { delay: 5 });
  await page.type('[name="company"]', 'Teste', { delay: 5 });
  await (await page.$('[name="lgpd_accept"]'))?.click();
  await delay(200);
  await (await page.$('.form-footer button[type="submit"]'))?.click();
  log('clicou Avancar (submit)');
  for (let i = 0; i < 15; i++) {
    await delay(1000);
    const s = await page.evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen || '');
    log(`  t+${i + 1}s screen=${s}`);
    if (s === 'wait-registration') break;
  }

  log('--> admin inicia a turma');
  const started = await api('start_classroom', { admin_token: adminToken });
  log('start_classroom: ' + started.status + ' phase=' + started.data.room?.phase);

  for (let i = 0; i < 15; i++) {
    await delay(1000);
    const s = await page.evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen || '');
    log(`  apos inicio t+${i + 1}s screen=${s}`);
    if (s === 'play' || s === 'manual') break;
  }

  // Se estiver na manual, clica e observa
  const cur = await page.evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen || '');
  if (cur === 'manual') {
    log('na tela manual -> clicando Pronto para a batalha!');
    const btn = await page.$('#startMatchButton');
    log('botao presente: ' + Boolean(btn));
    if (btn) await btn.click();
    for (let i = 0; i < 15; i++) {
      await delay(1000);
      const s = await page.evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen || '');
      log(`  apos clique t+${i + 1}s screen=${s}`);
      if (s === 'play') break;
    }
  }

  await browser.close();
  log('FIM');
})().catch((e) => { log('ERRO: ' + (e?.stack || e)); process.exit(1); });