import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000/game.php?station=1&mode=wait_all', { waitUntil: 'networkidle0' });

await page.evaluate(() => {
  document.querySelectorAll('.screen').forEach(el => { el.classList.remove('is-active'); el.hidden = true; });
  const reg = document.querySelector('.screen[data-screen="register"]');
  reg.classList.add('is-active');
  reg.hidden = false;
  document.body.dataset.currentScreen = 'register';
});

await new Promise(r => setTimeout(r, 600));

await page.screenshot({ path: 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c/design_qa/redesigned_registration.png' });
console.log('Successfully captured redesigned_registration.png!');
await browser.close();
