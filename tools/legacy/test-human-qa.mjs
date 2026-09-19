import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);

async function saveScreen(page, name) {
  const buf = await page.screenshot();
  writeFileSync(`${OUT_DIR}/${name}`, buf);
  log(`📸 Screenshot salvo: ${name}`);
}

async function main() {
  log('===============================================================');
  log('👤 TESTE DE QA COMO USUÁRIO HUMANO (PUPPETEER REAL TIME)');
  log('===============================================================');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 1. O humano acessa a página do jogo
    log('1. Humano abre http://localhost:3000/game.php?station=1&mode=wait_all');
    await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'networkidle0' });
    await delay(800);
    await saveScreen(page, 'qa_humano_01_tela_inicial.png');

    // 2. O humano clica em "Entrar no ringue!"
    log('2. Humano clica no botão "Entrar no ringue!"');
    const startCta = await page.waitForSelector('.start-cta', { timeout: 8000 });
    await startCta.click();
    await delay(1000);
    await saveScreen(page, 'qa_humano_02_formulario_cadastro.png');

    // Inspeciona visualmente as dimensões e posicionamento do card
    const cardInfo = await page.evaluate(() => {
      const card = document.querySelector('.register-card');
      const footer = document.querySelector('.form-footer');
      const submitBtn = document.querySelector('.form-footer button[type="submit"]');
      const logo = document.querySelector('.flow-topbar-logo');
      const illustration = document.querySelector('.register-hero-img, .register-illustration img');

      return {
        viewportHeight: window.innerHeight,
        card: card ? {
          top: card.getBoundingClientRect().top,
          bottom: card.getBoundingClientRect().bottom,
          height: card.getBoundingClientRect().height,
          fullyVisible: card.getBoundingClientRect().bottom <= window.innerHeight
        } : null,
        footer: footer ? {
          top: footer.getBoundingClientRect().top,
          bottom: footer.getBoundingClientRect().bottom,
          visible: footer.getBoundingClientRect().bottom <= window.innerHeight
        } : null,
        submitBtn: submitBtn ? {
          text: submitBtn.textContent.trim(),
          visible: submitBtn.getBoundingClientRect().bottom <= window.innerHeight
        } : null,
        logo: logo ? {
          width: logo.getBoundingClientRect().width,
          height: logo.getBoundingClientRect().height
        } : null,
        illustration: illustration ? {
          width: illustration.getBoundingClientRect().width,
          height: illustration.getBoundingClientRect().height
        } : null
      };
    });

    log(`   📊 Inspeção do Card: ${JSON.stringify(cardInfo, null, 2)}`);

    // 3. O humano preenche seus dados campo por campo com digitação realista
    log('3. Humano digita os campos de cadastro...');
    await page.type('[name="name"]', 'Marcelo Designer', { delay: 30 });
    await page.type('[name="email"]', 'marcelo@arena.com', { delay: 30 });
    await page.type('[name="role"]', 'Product Lead', { delay: 30 });
    await page.type('[name="company"]', 'Live Arena Corp', { delay: 30 });
    await delay(500);

    // 4. O humano clica no checkbox da LGPD
    log('4. Humano marca o checkbox da LGPD...');
    const lgpd = await page.$('[name="lgpd_accept"]');
    if (lgpd) await lgpd.click();
    await delay(500);
    await saveScreen(page, 'qa_humano_03_formulario_preenchido.png');

    // 5. O humano clica no botão "Avançar"
    log('5. Humano clica no botão "Avançar"...');
    const submitBtn = await page.$('.form-footer button[type="submit"], .figma-cta-blue');
    if (submitBtn) await submitBtn.click();
    await delay(1500);
    await saveScreen(page, 'qa_humano_04_pos_cadastro_espera.png');

    log('\n✨ TESTE HUMANO DE QA CONCLUÍDO COM SUCESSO!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ Erro no teste QA:', err);
  process.exit(1);
});
