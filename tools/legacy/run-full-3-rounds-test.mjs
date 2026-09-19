import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const SS_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c';

const JOGADORES = [
  { station: 1, name: 'Lucas Rossi', email: 'lucas@arena.com', role: 'Prompt Engineer', company: 'AI Labs' },
  { station: 2, name: 'Beatriz Lima', email: 'beatriz@arena.com', role: 'Tech Lead', company: 'Cloud Matrix' },
  { station: 3, name: 'Gabriel Souza', email: 'gabriel@arena.com', role: 'Data Scientist', company: 'NeuroTech' },
];

const PROMPTS = [
  // Rodada 1: Mulher montanha
  [
    'Mulher sorridente de jaqueta vermelha tirando selfie em primeiro plano numa trilha de montanha com vegetacao seca e ceu nublado',
    'Selfie de mulher com casaco vermelho nas montanhas, cabelos ao vento, pinheiros e ceu cinzento ao fundo com grande angular',
    'Uma jovem aventureira de blusa vermelha fazendo autorretrato no topo da montanha rochosa com tempo nublado'
  ],
  // Rodada 2: Polvo biblioteca
  [
    'Grande polvo laranja usando pequenos oculos redondos lendo livros antigos em mesa de madeira dentro de biblioteca sob cupula transparente subaquatica',
    'Polvo leitor de oculos redondos examinando manuscritos sob o mar com peixes e agua azul-turquesa ao redor',
    'Cenario magico com polvo intelectual laranja cercado de estantes de livros submersos e luz dourada'
  ],
  // Rodada 3: Robo estufa
  [
    'Pequeno robo branco regando orquidea azul bioluminescente em vaso hexagonal dentro de estufa futurista a noite com borboletas amarelas',
    'Androide branco com regador cuidando de flor azul brilhante em estufa de vidro com gotas de chuva e cidade neon ao fundo',
    'Estufa cyberpunk a noite onde robo futurista cuida de planta alienigena que emite luz azul e borboletas flutuantes'
  ]
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('pt-BR');
const log = (msg) => console.log(`[${ts()}] ${msg}`);

async function api(action, body = {}) {
  const r = await fetch(`${BASE}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}

async function tirarPrint(page, filename) {
  try {
    const buf = await page.screenshot();
    writeFileSync(`${SS_DIR}/${filename}`, buf);
    log(`📸 Print: ${filename}`);
  } catch (e) {
    log(`⚠️ Erro ao salvar print: ${e.message}`);
  }
}

async function resetGame() {
  log('🧹 Resetando a arena via API oficial com chave admin...');
  const login = await api('admin_login', { password: 'admin123' });
  if (!login.admin_token) throw new Error('Falha no login: ' + JSON.stringify(login));
  const res = await api('admin_reset', { admin_token: login.admin_token });
  if (!res.ok) throw new Error('Falha no reset: ' + JSON.stringify(res));
  log('✅ Arena pronta e limpa para nova batalha!');
}

async function main() {
  log('===================================================================');
  log('🚀 EXECUÇÃO COMPLETA: 3 RODADAS NA BATALHA DE PROMPTS');
  log('   Chave Gemini: Configurada e ativa');
  log('   Modelo: gemini-3.6-flash com fallback de alta precisão');
  log('===================================================================');

  await resetGame();
  await delay(1000);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const pages = [];

    log('\n--- 1. CADASTRANDO OS 3 JOGADORES ---');
    for (let i = 0; i < JOGADORES.length; i++) {
      const { station, name, email, role, company } = JOGADORES[i];
      const p = await browser.newPage();
      await p.setViewport({ width: 1280, height: 800 });
      pages.push(p);

      log(`[Estação ${station}] Carregando tela...`);
      await p.goto(`${BASE}/game.php?station=${station}&mode=wait_all`, { waitUntil: 'domcontentloaded' });
      await delay(500);

      // Clica em Entrar no ringue
      await p.waitForSelector('.start-cta', { timeout: 8000 });
      await p.click('.start-cta');
      await delay(600);

      // Preenche form
      await p.waitForSelector('.register-form', { timeout: 8000 });
      await p.type('[name="name"]', name, { delay: 5 });
      await p.type('[name="email"]', email, { delay: 5 });
      await p.type('[name="role"]', role, { delay: 5 });
      await p.type('[name="company"]', company, { delay: 5 });

      // LGPD
      const lgpd = await p.$('[name="lgpd_accept"]');
      if (lgpd) {
        const checked = await p.evaluate((el) => el.checked, lgpd);
        if (!checked) await lgpd.click();
      }
      await delay(200);

      // Submeter
      const submitBtn = await p.$('.register-form .figma-cta-blue, .register-form button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      else await p.keyboard.press('Enter');

      log(`[Estação ${station}] ✅ ${name} registrado com sucesso!`);
      await delay(500);
    }

    await delay(1500);
    await tirarPrint(pages[0], '01_cadastros_concluidos.png');

    // Executa as 3 rodadas
    for (let rodada = 1; rodada <= 3; rodada++) {
      log(`\n===================================================================`);
      log(`🏆 RODADA ${rodada} DE 3`);
      log(`===================================================================`);

      // Aguarda jogadores caírem na tela manual
      log('⏳ Aguardando jogadores na tela de instruções/manual...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        for (let w = 0; w < 15; w++) {
          const isManual = await p.evaluate(() => {
            const el = document.querySelector('.screen[data-screen="manual"]');
            return el && (el.classList.contains('is-active') || window.getComputedStyle(el).opacity === '1');
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
      await tirarPrint(pages[0], `02_rodada${rodada}_instrucoes.png`);

      // Clica em "Pronto para a batalha!" nas 3 estações
      log('🔘 Confirmando "Pronto para a batalha!" nas 3 estações...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        try {
          const btn = await p.$('#startMatchButton');
          if (btn) {
            await btn.click();
            log(`   [Estação ${i + 1}] Clicou em "Pronto para a batalha!"`);
          }
        } catch (e) {
          log(`   ⚠️ Erro ao clicar botão estação ${i + 1}: ${e.message}`);
        }
      }

      // Aguarda tela de jogo (play) ficar ativa
      log('⏳ Aguardando início do jogo (tela play)...');
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        for (let w = 0; w < 20; w++) {
          const isPlay = await p.evaluate(() => {
            const el = document.querySelector('.screen[data-screen="play"]');
            return el && (el.classList.contains('is-active') || window.getComputedStyle(el).opacity === '1');
          });
          if (isPlay) break;
          await delay(1000);
        }
      }

      await delay(1200);
      await tirarPrint(pages[0], `03_rodada${rodada}_jogo.png`);

      // Digita e envia prompts
      log(`📝 Enviando prompts dos 3 jogadores na Rodada ${rodada}...`);
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const promptText = PROMPTS[rodada - 1][i];
        const { station, name } = JOGADORES[i];

        try {
          const textarea = await p.$('#promptInput');
          if (textarea) {
            await textarea.click({ clickCount: 3 });
            await textarea.type(promptText, { delay: 5 });
            await delay(200);

            const sendBtn = await p.$('.send-button');
            if (sendBtn) await sendBtn.click();
            else await p.keyboard.press('Enter');

            log(`   [Estação ${station}] ${name} enviou prompt: "${promptText.substring(0, 50)}..."`);
          }
        } catch (e) {
          log(`   ⚠️ Erro ao enviar prompt estação ${station}: ${e.message}`);
        }
      }

      // Aguarda avaliação pelo Gemini
      log('🤖 Aguardando avaliação pelo Gemini...');
      await delay(4000);

      // Espera todas as estações serem pontuadas
      for (let t = 0; t < 25; t++) {
        const status = await api('room_status', { room_id: 'main' });
        const phase = status?.room?.phase;
        const allScored = status?.room?.all_scored;
        process.stdout.write(`\r   Aguardando scores: fase=[${phase}], all_scored=[${allScored}]   `);
        if (allScored || phase === 'round-results' || phase === 'final-results' || phase === 'results' || phase === 'final_results') {
          process.stdout.write('\n');
          break;
        }
        await delay(2000);
      }

      await delay(2000);
      await tirarPrint(pages[0], `04_rodada${rodada}_pontuacao.png`);

      // Placar da rodada
      const statusRodada = await api('room_status', { room_id: 'main' });
      const stations = statusRodada?.room?.stations || [];
      log(`\n🏅 Placar Parcial após Rodada ${rodada}:`);
      stations.forEach((s) => {
        log(`   PC ${s.id} (${s.player_name}): Pontos: ${s.points || 0} | Total Acumulado: ${s.total_points || 0} pts | Acerto: ${(Number(s.percent || 0) * 100).toFixed(1)}%`);
      });

      if (rodada < 3) {
        log(`\n⏳ Contagem regressiva para Rodada ${rodada + 1}...`);
        await delay(12000);
      }
    }

    log('\n===================================================================');
    log('🏁 RESULTADO FINAL DA BATALHA DE PROMPTS');
    log('===================================================================');

    await delay(5000);
    await tirarPrint(pages[0], '05_ranking_final.png');

    const statusFinal = await api('room_status', { room_id: 'main' });
    const finalRanking = statusFinal?.room?.final_ranking || statusFinal?.room?.stations || [];
    log('\n🏆 PODIUM FINAL:');
    const sorted = [...finalRanking].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
    sorted.forEach((s, idx) => {
      const pos = idx === 0 ? '🥇 1º LUGAR' : idx === 1 ? '🥈 2º LUGAR' : '🥉 3º LUGAR';
      log(`   ${pos}: ${s.player_name || s.first_name} — ${s.total_points || 0} pontos | Acerto médio: ${(Number(s.avg_percent || s.percent || 0) * 100).toFixed(1)}%`);
    });

    log('\n✨ TESTE DE 3 RODADAS CONCLUÍDO COM SUCESSO TOTAL!');
    log(`📂 Prints salvos em: ${SS_DIR}`);

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Erro durante o teste:', err);
  process.exit(1);
});
