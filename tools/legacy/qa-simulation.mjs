import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runQaSimulation() {
  console.log('Iniciando simulação de QA Humana...');
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();

  // 1. Tela da TV (main.php)
  console.log('Capturando Tela da TV (main.php)...');
  await page.goto('http://localhost:3000/main.php', { waitUntil: 'load' });
  await delay(2000);
  await page.screenshot({ path: join(__dirname, 'tv-screen.png') });

  // 2. Tela do Jogador - Cadastro (game.php)
  console.log('Navegando para o PC do Jogador (game.php)...');
  await page.goto('http://localhost:3000/game.php?station=1&mode=wait_all', { waitUntil: 'load' });
  await delay(1000);
  await page.screenshot({ path: join(__dirname, 'player-start.png') });
  
  // Simular clique humano para iniciar
  console.log('Simulando clique em "Entrar no ringue"...');
  await page.click('[data-go="register"]');
  await delay(1000); // aguardar animação de transição

  console.log('Preenchendo formulário como humano...');
  await page.type('input[name="name"]', 'QA Tester Automático', { delay: 100 });
  await page.type('input[name="email"]', 'qa@teste.com', { delay: 100 });
  await page.type('input[name="role"]', 'Analista', { delay: 100 });
  await page.type('input[name="company"]', 'Google', { delay: 100 });
  await page.click('input[name="lgpd_accept"]');
  await delay(500);
  
  await page.screenshot({ path: join(__dirname, 'player-registration.png') });
  
  console.log('Enviando cadastro...');
  await page.click('#registerForm button[type="submit"]');
  await delay(2000); // aguardar requisição e transição
  
  console.log('Capturando tela de espera (wait-registration)...');
  await page.screenshot({ path: join(__dirname, 'player-wait.png') });

  await browser.close();
  console.log('Simulação concluída com sucesso!');
}

runQaSimulation().catch(console.error);
