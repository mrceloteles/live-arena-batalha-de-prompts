import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const OUT_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/e058706f-b91b-44c7-8ef5-c1a43f6a0aea/screenshots';

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('🚀 Iniciando captura completa de telas...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const desktopViewport = { width: 1440, height: 900 };
  const mobileViewport = { width: 390, height: 844, isMobile: true, hasTouch: true };
  const tvViewport = { width: 1920, height: 1080 };

  const page = await browser.newPage();
  await page.setViewport(desktopViewport);

  // 1. Portal Home Desktop
  console.log('📸 1. Portal Home Desktop...');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await delay(500);
  await page.screenshot({ path: join(OUT_DIR, '01_portal_home_desktop.png'), fullPage: true });

  // 1b. Portal Home Mobile
  console.log('📸 1b. Portal Home Mobile...');
  await page.setViewport(mobileViewport);
  await page.screenshot({ path: join(OUT_DIR, '01b_portal_home_mobile.png'), fullPage: true });
  await page.setViewport(desktopViewport);

  // 2. Player Join Screen Desktop
  console.log('📸 2. Player Join Desktop...');
  await page.goto(`${BASE}/play`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(OUT_DIR, '02_player_join_desktop.png') });

  // 2b. Player Join Mobile
  console.log('📸 2b. Player Join Mobile...');
  await page.setViewport(mobileViewport);
  await page.screenshot({ path: join(OUT_DIR, '02b_player_join_mobile.png') });
  await page.setViewport(desktopViewport);

  // 3. Admin Login (unauthenticated)
  console.log('📸 3. Admin Login...');
  await page.goto(`${BASE}/admin-arena.php`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(OUT_DIR, '03_admin_login.png') });

  // Do admin login via form
  console.log('🔑 Realizando login do admin...');
  await page.type('input[name="password"]', 'Batalha@Prompts2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('button[type="submit"]'),
  ]);
  await delay(1500);

  // 4. Admin Dashboard
  console.log('📸 4. Admin Dashboard...');
  await page.screenshot({ path: join(OUT_DIR, '04_admin_dashboard.png'), fullPage: true });

  // Create or select room
  console.log('🏗️ Criando sala para testes...');
  const titleInput = await page.$('form[data-arena-create-room] input[name="title"]');
  if (titleInput) {
    await page.type('form[data-arena-create-room] input[name="title"]', 'TURMA ENGENHARIA DE PROMPTS 2026');
    await page.click('form[data-arena-create-room] button[type="submit"]');
    await delay(2500);
  }

  // Reload and select first room if not selected
  await page.goto(`${BASE}/admin-arena.php`, { waitUntil: 'domcontentloaded' });
  await delay(1500);
  const detailBtn = await page.$('.arena-room-card button[data-action="detail"], [data-action="detail"]');
  if (detailBtn) {
    await detailBtn.click();
    await delay(1500);
  }
  await page.screenshot({ path: join(OUT_DIR, '05_admin_room_detail.png'), fullPage: true });

  // Extract room pin/code
  const roomCode = await page.evaluate(() => {
    const codeEl = document.querySelector('.arena-cockpit-code strong, .arena-room-card .arena-room-code');
    return codeEl ? codeEl.innerText.trim().replace(/\s+/g, '') : null;
  });
  console.log('Room Code:', roomCode);

  // Get TV URL
  let tvUrl = `${BASE}/tv.php`;
  const openTvLink = await page.$('a[data-action="open-tv"]');
  if (openTvLink) {
    // Click open-tv to trigger dialog and get popup url
    await openTvLink.click();
    await delay(1000);
    tvUrl = await page.evaluate(() => {
      const a = document.querySelector('.arena-proj-actions a');
      return a ? a.href : null;
    }) || tvUrl;
  }
  console.log('TV URL:', tvUrl);

  // 5. TV Screen Waiting
  console.log('📸 6. TV Screen...');
  const tvPage = await browser.newPage();
  await tvPage.setViewport(tvViewport);
  await tvPage.goto(tvUrl, { waitUntil: 'domcontentloaded' });
  await delay(2000);
  await tvPage.screenshot({ path: join(OUT_DIR, '06_tv_projection_waiting.png') });

  // 6. Player joins
  console.log('📸 7. Player joins room...');
  const playerPage = await browser.newPage();
  await playerPage.setViewport(desktopViewport);
  await playerPage.goto(`${BASE}/play`, { waitUntil: 'domcontentloaded' });
  if (roomCode) {
    await playerPage.type('input[name="code"]', roomCode);
  }
  await playerPage.type('input[name="name"]', 'Lucas Rossi');
  await playerPage.click('button[type="submit"]');
  await delay(2000);

  await playerPage.screenshot({ path: join(OUT_DIR, '07_player_waiting_mission_desktop.png') });
  await tvPage.screenshot({ path: join(OUT_DIR, '07b_tv_waiting_with_player.png') });

  // 7. Start Round
  console.log('🚀 Iniciando rodada pelo admin...');
  await page.bringToFront();
  // Close dialog if open
  await page.evaluate(() => {
    const d = document.querySelector('[data-arena-dialog]');
    if (d && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  });
  await delay(500);

  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.arena-start-big, button[data-action="start"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Botão start clicado:', clicked);
  await delay(2500);

  // 8. Player Active Mission
  console.log('📸 8. Player Active Mission...');
  await playerPage.bringToFront();
  await delay(2000);
  await playerPage.screenshot({ path: join(OUT_DIR, '08_player_active_mission_desktop.png'), fullPage: true });

  await playerPage.setViewport(mobileViewport);
  await delay(500);
  await playerPage.screenshot({ path: join(OUT_DIR, '08b_player_active_mission_mobile.png'), fullPage: true });
  await playerPage.setViewport(desktopViewport);

  // 8c. TV Active Mission
  await tvPage.bringToFront();
  await delay(500);
  await tvPage.screenshot({ path: join(OUT_DIR, '08c_tv_active_mission.png') });

  // 9. Player Submits Prompt
  console.log('✍️ Enviando prompt do jogador...');
  await playerPage.bringToFront();
  const promptInput = await playerPage.$('textarea[name="prompt"]');
  if (promptInput) {
    await promptInput.type('Fotografia grande-angular profissional de uma jovem mulher sorridente com cabelos loiros ao vento usando jaqueta esportiva vermelha vibrante em primeiro plano, tirando selfie em uma trilha de montanha rochosa com pinheiros e montanhas ao fundo sob céu nublado.');
    await delay(500);
    await playerPage.screenshot({ path: join(OUT_DIR, '08d_player_prompt_filled.png') });
    await playerPage.click('button[data-arena-send]');
    console.log('Aguardando nota...');
    await delay(4000);
    await playerPage.screenshot({ path: join(OUT_DIR, '09_player_round_result_desktop.png'), fullPage: true });

    await playerPage.setViewport(mobileViewport);
    await delay(500);
    await playerPage.screenshot({ path: join(OUT_DIR, '09b_player_round_result_mobile.png'), fullPage: true });
    await playerPage.setViewport(desktopViewport);
  }

  // 10. End round / results
  console.log('🛑 Encerrando rodada no admin...');
  await page.bringToFront();
  const endRoundBtn = await page.$('button[data-action="end-round"]');
  if (endRoundBtn) {
    await endRoundBtn.click();
    await delay(2500);
  }

  // TV Round Results
  console.log('📸 10. TV Round Results...');
  await tvPage.bringToFront();
  await delay(1500);
  await tvPage.screenshot({ path: join(OUT_DIR, '10_tv_round_results.png') });

  // 11. Report Page
  console.log('📸 11. Admin Report...');
  const reportPage = await browser.newPage();
  await reportPage.setViewport(desktopViewport);
  await reportPage.goto(`${BASE}/report.php`, { waitUntil: 'domcontentloaded' });
  await delay(2000);
  await reportPage.screenshot({ path: join(OUT_DIR, '11_admin_report_desktop.png'), fullPage: true });

  console.log('✅ TODAS AS TELAS FORAM CAPTURADAS COM SUCESSO EM:', OUT_DIR);
  await browser.close();
}

run().catch((err) => {
  console.error('Erro na captura:', err);
  process.exit(1);
});
