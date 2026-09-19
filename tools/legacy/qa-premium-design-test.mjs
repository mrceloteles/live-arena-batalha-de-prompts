import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c/qa_premium_design';
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'laptop_1280',  width: 1280, height: 800 },
  { name: 'tablet_1024',  width: 1024, height: 768 },
  { name: 'mobile_375',   width: 375,  height: 812 },
];

const SCREENS = ['start', 'register', 'wait-registration', 'manual', 'play', 'wait-results', 'score'];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);

async function main() {
  log('================================================================');
  log('🎨 EXECUTANDO QA DESIGN AUDIT COM A SKILL PREMIUM-WEB-DESIGN');
  log('================================================================');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const auditResults = [];

  try {
    const page = await browser.newPage();

    // 1. Auditar cada tela do game.php em todas as resoluções
    for (const vp of VIEWPORTS) {
      log(`\n📱 Avaliando viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      await page.setViewport({ width: vp.width, height: vp.height });

      for (const scr of SCREENS) {
        // Usa o parâmetro debug_screen para inspecionar cada tela de forma isolada
        const url = `${BASE}/game.php?station=1&mode=wait_all&debug_screen=${scr}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await delay(500);

        const filename = `${vp.name}_${scr}.png`;
        const ss = await page.screenshot();
        writeFileSync(`${OUT_DIR}/${filename}`, ss);

        // Análise de métricas computadas via DOM
        const metrics = await page.evaluate((screenName) => {
          const activeScreen = document.querySelector(`.screen[data-screen="${screenName}"]`);
          if (!activeScreen) return { error: 'screen not found' };

          const rect = activeScreen.getBoundingClientRect();
          const bodyOverflow = document.body.scrollHeight > window.innerHeight;
          const card = activeScreen.querySelector('.register-card, .wait-card, .manual-card, .score-card, .battle-card');
          const cardRect = card ? card.getBoundingClientRect() : null;

          // Logo Live Arena check
          const logo = document.querySelector('.flow-topbar-logo, .live-arena-logo, img[src*="live-arena"]');
          const logoRect = logo ? logo.getBoundingClientRect() : null;

          // CTA button check
          const cta = activeScreen.querySelector('.start-cta, .figma-cta, button[type="submit"]');
          const ctaRect = cta ? cta.getBoundingClientRect() : null;

          return {
            screen: screenName,
            viewport: { w: window.innerWidth, h: window.innerHeight },
            overflowY: bodyOverflow,
            screenVisible: activeScreen.classList.contains('is-active'),
            card: cardRect ? { w: Math.round(cardRect.width), h: Math.round(cardRect.height), top: Math.round(cardRect.top), left: Math.round(cardRect.left) } : null,
            logo: logoRect ? { w: Math.round(logoRect.width), h: Math.round(logoRect.height), visible: logoRect.width > 0 && logoRect.height > 0 } : null,
            cta: ctaRect ? { w: Math.round(ctaRect.width), h: Math.round(ctaRect.height), visible: ctaRect.top < window.innerHeight } : null,
          };
        }, scr);

        auditResults.push({ viewport: vp.name, screen: scr, filename, ...metrics });
        log(`   📸 [${scr}] Capturado e avaliado -> ${filename}`);
      }
    }

    // 2. Auditar Tela Principal (TV / Telão - main.php) em 1080p e 4K
    const tvViewports = [
      { name: 'tv_1080p', width: 1920, height: 1080 },
      { name: 'tv_1440p', width: 2560, height: 1440 },
    ];

    for (const tvp of tvViewports) {
      log(`\n📺 Avaliando Telão (main.php) em ${tvp.name} (${tvp.width}x${tvp.height})...`);
      await page.setViewport({ width: tvp.width, height: tvp.height });
      await page.goto(`${BASE}/main.php`, { waitUntil: 'domcontentloaded' });
      await delay(800);

      const filename = `${tvp.name}_main.png`;
      const ss = await page.screenshot();
      writeFileSync(`${OUT_DIR}/${filename}`, ss);
      log(`   📸 Telão capturado -> ${filename}`);
    }

    // Salva o relatório consolidado de auditoria JSON
    writeFileSync(`${OUT_DIR}/audit_summary.json`, JSON.stringify(auditResults, null, 2));
    log(`\n✅ AUDITORIA CONCLUÍDA! Relatório e screenshots salvos em: ${OUT_DIR}`);

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Erro durante a auditoria:', err);
  process.exit(1);
});
