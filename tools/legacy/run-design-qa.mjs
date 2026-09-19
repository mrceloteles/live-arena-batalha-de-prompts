import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const outDir = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c/design_qa';

async function runAudit() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const auditReport = {
    viewports: {},
    screensData: {},
    typography: {},
    colorContrast: {},
    spacing: {},
    hierarchy: {},
    touchTargets: {}
  };

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport(vp);

    // 1. Portal (index.php)
    await page.goto('http://localhost:3000/index.php', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(outDir, `portal_${vp.name}.png`), fullPage: true });

    // 2. Main TV (main.php)
    await page.goto('http://localhost:3000/main.php', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(outDir, `tv_idle_${vp.name}.png`) });

    const tvStages = ['idle', 'registration', 'instructions', 'playing', 'results'];
    for (const stage of tvStages) {
      await page.evaluate((st) => {
        document.querySelectorAll('.main-stage').forEach(el => {
          el.classList.remove('is-active');
          el.hidden = true;
        });
        const target = document.querySelector(`.main-stage[data-main-stage="${st}"]`);
        if (target) {
          target.classList.add('is-active');
          target.hidden = false;
        }
        document.body.setAttribute('data-tv-stage', st);
      }, stage);
      await new Promise(r => setTimeout(r, 200));
      await page.screenshot({ path: path.join(outDir, `tv_${stage}_${vp.name}.png`) });
    }

    // 3. Player Game (game.php)
    await page.goto('http://localhost:3000/game.php?station=1&mode=wait_all', { waitUntil: 'networkidle0' });
    
    const gameScreens = ['start', 'register', 'wait-registration', 'manual', 'play', 'wait-results', 'score'];
    for (const scr of gameScreens) {
      await page.evaluate((s) => {
        document.querySelectorAll('.screen').forEach(el => {
          el.classList.remove('is-active');
          el.hidden = true;
        });
        const target = document.querySelector(`.screen[data-screen="${s}"]`);
        if (target) {
          target.classList.add('is-active');
          target.hidden = false;
        }
        document.body.dataset.currentScreen = s;
      }, scr);
      await new Promise(r => setTimeout(r, 200));
      await page.screenshot({ path: path.join(outDir, `game_${scr}_${vp.name}.png`) });

      if (vp.name === 'desktop') {
        const metrics = await page.evaluate((sName) => {
          const scrEl = document.querySelector(`.screen[data-screen="${sName}"]`);
          if (!scrEl) return null;

          // Typography
          const textNodes = Array.from(scrEl.querySelectorAll('h1, h2, p, span, strong, button, input, label'));
          const fontSamples = textNodes.slice(0, 15).map(el => {
            const cs = window.getComputedStyle(el);
            return {
              tag: el.tagName,
              text: (el.innerText || el.placeholder || '').slice(0, 25),
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              lineHeight: cs.lineHeight,
              color: cs.color,
              fontFamily: cs.fontFamily.split(',')[0].replace(/"/g, '')
            };
          });

          // Card specs
          const card = scrEl.querySelector('.figma-card, .battle-card, .play-card');
          const cardSpec = card ? {
            padding: window.getComputedStyle(card).padding,
            borderRadius: window.getComputedStyle(card).borderRadius,
            boxShadow: window.getComputedStyle(card).boxShadow,
            background: window.getComputedStyle(card).backgroundColor
          } : null;

          // Buttons
          const buttons = Array.from(scrEl.querySelectorAll('button, .figma-cta')).map(b => {
            const cs = window.getComputedStyle(b);
            const rect = b.getBoundingClientRect();
            return {
              text: b.innerText.trim().slice(0, 25),
              height: Math.round(rect.height),
              borderRadius: cs.borderRadius,
              background: cs.backgroundColor,
              color: cs.color
            };
          });

          return { fontSamples, cardSpec, buttons };
        }, scr);

        auditReport.screensData[scr] = metrics;
      }
    }

    await page.close();
  }

  fs.writeFileSync(path.join(outDir, 'detailed_design_audit.json'), JSON.stringify(auditReport, null, 2));
  await browser.close();
  console.log('Comprehensive Design QA Completed!');
}

runAudit().catch(console.error);
