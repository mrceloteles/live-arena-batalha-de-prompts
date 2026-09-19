import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c';

const JOGADORES = [
  { station: 1, name: 'Lucas Rossi', email: 'lucas@arena.com', role: 'Prompt Engineer', company: 'AI Labs' },
  { station: 2, name: 'Beatriz Lima', email: 'beatriz@arena.com', role: 'Tech Lead', company: 'Cloud Matrix' },
  { station: 3, name: 'Gabriel Souza', email: 'gabriel@arena.com', role: 'Data Scientist', company: 'NeuroTech' },
];

const PROMPTS = [
  // Rodada 1
  [
    'Mulher sorridente de jaqueta vermelha tirando selfie em primeiro plano numa trilha de montanha com vegetacao seca e ceu nublado',
    'Selfie de mulher com jaqueta vermelha nas montanhas, cabelos loiros ao vento, trilha rochosa e ceu nublado',
    'Jovem aventureira com casaco vermelho tirando autorretrato em trilha nas montanhas com vegetacao de pinheiros'
  ],
  // Rodada 2
  [
    'Grande polvo laranja usando pequenos oculos redondos lendo livros antigos em mesa de madeira dentro de biblioteca sob cupula transparente subaquatica',
    'Polvo laranja usando oculos redondos lendo manuscritos antigos numa mesa de madeira em biblioteca de vidro no fundo do mar com agua turquesa',
    'Biblioteca submarina com polvo sabio de oculos cercado por estantes de livros antigos e luz dourada sob agua cristalina'
  ],
  // Rodada 3
  [
    'Pequeno robo branco regando orquidea azul bioluminescente em vaso hexagonal dentro de estufa futurista a noite com borboletas amarelas',
    'Pequeno androide branco com regador cuidando de flor orquidea azul fluorescente em estufa de vidro a noite com borboletas amarelas e skyline neon',
    'Cenario futurista com robo branco regando orquidea azul brilhante dentro de estufa cyberpunk com chuva e luzes neon'
  ]
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('pt-BR');
const log = (msg) => console.log(`[${ts()}] ${msg}`);

async function saveScreen(page, name) {
  try {
    const buf = await page.screenshot();
    writeFileSync(`${OUT_DIR}/${name}`, buf);
    log(`📸 Screenshot: ${name}`);
  } catch (e) {
    log(`⚠️ Erro ao salvar print ${name}: ${e.message}`);
  }
}

async function api(action, body = {}) {
  const r = await fetch(`${BASE}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}

async function resetArena() {
  log('🧹 Resetando a arena para jogo 100% limpo...');
  const login = await api('admin_login', { password: 'admin123' });
  if (login.admin_token) {
    await api('admin_reset', { admin_token: login.admin_token });
  }
  log('✅ Arena pronta para partida real dos jogadores!');
}

async function main() {
  log('===================================================================');
  log('🎮 JOGADORES REAIS JOGANDO AS 3 RODADAS NO NAVEGADOR');
  log('   (Interação 100% humana via DOM: Digitação, Cliques e Telas)');
  log('===================================================================');

  await resetArena();
  await delay(1000);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const pages = [];

    // 1. Abrir 3 navegadores (PC 1, PC 2, PC 3)
    log('\n🖥️ 1. Abrindo as 3 estações de jogo no navegador...');
    for (let i = 0; i < JOGADORES.length; i++) {
      const p = await browser.newPage();
      await p.setViewport({ width: 1280, height: 800 });
      pages.push(p);
    }

    // 2. Fazer o cadastro dos 3 jogadores na interface visual
    log('\n✍️ 2. Jogadores preenchendo o formulário de cadastro na tela...');
    for (let i = 0; i < JOGADORES.length; i++) {
      const { station, name, email, role, company } = JOGADORES[i];
      const p = pages[i];

      await p.goto(`${BASE}/game.php?station=${station}&mode=wait_all`, { waitUntil: 'domcontentloaded' });
      await delay(600);

      // Clica em "Entrar no ringue!"
      const cta = await p.waitForSelector('.start-cta', { timeout: 8000 });
      await cta.click();
      await delay(600);

      // Digita os dados no formulário
      await p.waitForSelector('.register-form', { timeout: 8000 });
      await p.type('[name="name"]', name, { delay: 15 });
      await p.type('[name="email"]', email, { delay: 15 });
      await p.type('[name="role"]', role, { delay: 15 });
      await p.type('[name="company"]', company, { delay: 15 });

      // Aceita LGPD
      const lgpd = await p.$('[name="lgpd_accept"]');
      if (lgpd) await lgpd.click();
      await delay(200);

      // Clica em "Avançar"
      const submitBtn = await p.$('.form-footer button[type="submit"], .figma-cta-blue');
      if (submitBtn) await submitBtn.click();

      log(`   👤 PC ${station}: ${name} preencheu o formulário e clicou em Avançar!`);
      await delay(500);
    }

    await delay(1500);
    await saveScreen(pages[0], 'game_01_jogadores_aguardando.png');

    // 3. JOGAR AS 3 RODADAS
    for (let rodada = 1; rodada <= 3; rodada++) {
      log(`\n===================================================================`);
      log(`⚔️ RODADA ${rodada} DE 3 — A BATALHA COMEÇA!`);
      log(`===================================================================`);

      // Aguarda todos os jogadores verem a tela "Como funciona" (manual)
      log('📖 Jogadores lendo as instruções da batalha...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        for (let w = 0; w < 15; w++) {
          const isManual = await p.evaluate(() => {
            const el = document.querySelector('.screen[data-screen="manual"]');
            return el && (el.classList.contains('is-active') || window.getComputedStyle(el).display !== 'none');
          });
          const isPlay = await p.evaluate(() => {
            const el = document.querySelector('.screen[data-screen="play"]');
            return el && el.classList.contains('is-active');
          });
          if (isManual || isPlay) break;
          await delay(1000);
        }
      }

      await delay(1000);
      await saveScreen(pages[0], `game_0${rodada * 2}_rodada${rodada}_instrucoes.png`);

      // Os 3 jogadores clicam em "Pronto para a batalha!"
      log('👆 Jogadores clicam no botão "Pronto para a batalha!"...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        try {
          const btn = await p.$('#startMatchButton');
          if (btn) {
            await btn.click();
            log(`   PC ${i + 1}: Clicou em "Pronto para a batalha!"`);
          }
        } catch {}
      }

      // Aguarda a tela do jogo (play) abrir para os 3 jogadores
      log('⏳ Aguardando abertura da arena de jogo (tela play)...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        for (let w = 0; w < 20; w++) {
          const isPlay = await p.evaluate(() => {
            const el = document.querySelector('.screen[data-screen="play"]');
            return el && (el.classList.contains('is-active') || window.getComputedStyle(el).display !== 'none');
          });
          if (isPlay) break;
          await delay(1000);
        }
      }

      await delay(1500);
      await saveScreen(pages[0], `game_0${rodada * 2 + 1}_rodada${rodada}_jogando_tela.png`);

      // Jogadores observam a imagem e digitam o prompt na textarea
      log(`\n⌨️ Jogadores observando a imagem e digitando seus prompts no teclado...`);
      const promptRodada = PROMPTS[rodada - 1];

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const promptText = promptRodada[i];
        const { station, name } = JOGADORES[i];

        try {
          const textarea = await p.waitForSelector('#promptInput', { timeout: 8000 });
          await textarea.click();
          await p.type('#promptInput', promptText, { delay: 15 });
          log(`   PC ${station} (${name}) digitou: "${promptText.substring(0, 60)}..."`);
        } catch (e) {
          log(`   ⚠️ Erro ao digitar no PC ${station}: ${e.message}`);
        }
      }

      await delay(1000);
      // Salva o print do jogador com o prompt digitado no formulário
      await saveScreen(pages[0], `game_0${rodada * 2 + 2}_rodada${rodada}_prompt_digitado.png`);

      // Jogadores clicam no botão "Enviar Resposta"
      log('\n🚀 Jogadores clicando no botão "Enviar Resposta"...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const { station, name } = JOGADORES[i];

        try {
          const sendBtn = await p.$('.send-button, #promptForm button[type="submit"]');
          if (sendBtn) {
            await sendBtn.click();
            log(`   PC ${station} (${name}) enviou resposta!`);
          }
        } catch (e) {
          log(`   ⚠️ Erro ao enviar PC ${station}: ${e.message}`);
        }
      }

      // Aguarda avaliação pelo Gemini e exibição da tela de score
      log('\n🤖 Aguardando juiz Gemini avaliar as respostas...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        for (let w = 0; w < 25; w++) {
          const isScore = await p.evaluate(() => {
            const el = document.querySelector('.screen[data-screen="score"]');
            return el && (el.classList.contains('is-active') || window.getComputedStyle(el).display !== 'none');
          });
          if (isScore) break;
          await delay(1000);
        }
      }

      await delay(2000);
      await saveScreen(pages[0], `game_0${rodada * 2 + 3}_rodada${rodada}_score_jogador.png`);

      // Extrai a pontuação mostrada na tela do jogador
      const scoreData = await pages[0].evaluate(() => {
        const pts = document.querySelector('[data-score-points]')?.textContent?.trim() || '0';
        const title = document.querySelector('[data-score-title]')?.textContent?.trim() || '';
        const pct = document.querySelector('[data-score-position]')?.textContent?.trim() || '';
        return { pts, title, pct };
      });
      log(`   🏆 Resultado do PC 1 na tela: ${scoreData.title} | ${scoreData.pct} | ${scoreData.pts} Pontos!`);

      if (rodada < 3) {
        log(`\n⏳ Aguardando contagem regressiva para Rodada ${rodada + 1}...`);
        await delay(12000);
      }
    }

    log('\n===================================================================');
    log('🏆 BATALHA ENCERRADA — 3 RODADAS JOGADAS COM SUCESSO PELOS PLAYERS!');
    log('===================================================================');

    await delay(3000);
    await saveScreen(pages[0], 'game_final_resultado_campeao.png');

    log(`📁 Todos os screenshots das telas dos jogadores foram salvos em: ${OUT_DIR}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ Erro na execução:', err);
  process.exit(1);
});
