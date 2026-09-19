/**
 * test-3-rodadas.mjs — Teste completo de 3 rodadas sem API Gemini
 * Campos corretos: name, email, role, company, lgpd_accept
 */
import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SS_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c';

// Prompts alinhados com os desafios configurados no servidor
const PROMPTS = [
  'Mulher sorridente de jaqueta vermelha tirando selfie em trilha de montanha com céu nublado vegetação seca e pinheiros ao fundo grande angular',
  'Polvo laranja usando óculos redondos consultando livros antigos numa grande biblioteca dentro de cúpula de vidro subaquática com luz dourada e cardumes prateados',
  'Robô branco regando orquídea azul bioluminescente em vaso hexagonal transparente em estufa futurista à noite com borboletas amarelas e cidade neon ao fundo',
];

const JOGADORES = [
  { station: 1, name: 'Ana Lima',   email: 'ana@arena.com',   role: 'Designer',  company: 'Studio X'  },
  { station: 2, name: 'Bruno Melo', email: 'bruno@arena.com', role: 'Dev',        company: 'Tech Co'   },
  { station: 3, name: 'Carla Dias', email: 'carla@arena.com', role: 'Marketing',  company: 'Brand Lab' },
];

const delay = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('pt-BR');
const log = msg => console.log(`[${ts()}] ${msg}`);

// POST /api.php?action=ACTION com body JSON
async function api(action, body = {}) {
  const r = await fetch(`${BASE}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}

async function getRoomStatus() {
  return api('room_status', { room_id: 'main' });
}

async function aguardarFase(faseAlvo, timeoutMs = 120000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const data = await getRoomStatus();
      const fase = data?.room?.phase || '?';
      process.stdout.write(`\r   [${ts()}] Fase: [${fase}] → aguardando [${faseAlvo}]   `);
      if (fase === faseAlvo) { process.stdout.write('\n'); return data; }
    } catch {}
    await delay(2000);
  }
  process.stdout.write('\n');
  log(`⚠️  Timeout aguardando fase "${faseAlvo}"`);
  return null;
}

async function salvarPrint(page, nome) {
  try {
    const ss = await page.screenshot();
    writeFileSync(`${SS_DIR}/${nome}`, ss);
    log(`  📸 ${nome}`);
  } catch (e) { log(`  ⚠️  Erro print: ${e.message}`); }
}

async function cadastrarJogador(browser, jogador) {
  const { station, name, email, role, company } = jogador;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto(`${BASE}/game.php?station=${station}&mode=wait_all`, {
    waitUntil: 'networkidle2', timeout: 20000
  });
  await delay(600);

  await page.waitForSelector('.start-cta', { timeout: 10000 });
  await page.click('.start-cta');
  await delay(1000);
  await page.waitForSelector('.register-form', { timeout: 8000 });

  const fill = async (sel, val) => {
    const el = await page.$(sel);
    if (el) { await el.click({ clickCount: 3 }); await el.type(val, { delay: 12 }); }
    else log(`  ⚠️  Campo "${sel}" não encontrado`);
  };

  // Campos corretos do HTML
  await fill('[name="name"]', name);
  await fill('[name="email"]', email);
  await fill('[name="role"]', role);
  await fill('[name="company"]', company);

  // LGPD (name="lgpd_accept")
  try {
    const lgpd = await page.$('[name="lgpd_accept"]');
    if (lgpd) {
      const checked = await page.evaluate(el => el.checked, lgpd);
      if (!checked) await lgpd.click();
    }
  } catch {}
  await delay(300);

  // Submete
  const btn = await page.$('.register-form button[type="submit"], .register-form .figma-cta-blue');
  if (btn) await btn.click();
  else await page.keyboard.press('Enter');

  await delay(2000);
  log(`  ✅ Estação ${station} — ${name} cadastrado`);
  return page;
}

async function jogarRodada(page, jogador, rodada, prompt) {
  const { station, name } = jogador;

  // Aguarda tela de jogo
  try {
    await page.waitForFunction(
      () => document.querySelector('[data-screen="play"]')?.classList.contains('is-active'),
      { timeout: 30000, polling: 800 }
    );
  } catch {
    log(`  ⚠️  [Est. ${station}] Tela play não detectada`);
  }
  await delay(500);

  const textarea = await page.$('.prompt-form textarea, [name="prompt"]');
  if (!textarea) { log(`  ⚠️  [Est. ${station}] Textarea não encontrada`); return false; }

  await textarea.click({ clickCount: 3 });
  await textarea.type(prompt, { delay: 8 });
  await delay(400);

  const sendBtn = await page.$('.send-button');
  if (sendBtn) await sendBtn.click();
  else await page.keyboard.press('Enter');

  log(`  📤 Est.${station} (${name}) — prompt enviado rodada ${rodada}`);
  return true;
}

// ==================== MAIN ====================
async function main() {
  log('🚀 TESTE 3 RODADAS COMPLETAS — SEM API GEMINI (fallback)');
  log('='.repeat(58));

  // 1. Login admin para obter token
  log('\n🔐 Login admin...');
  const loginResp = await api('admin_login', { password: 'admin123' });
  const adminToken = loginResp?.admin_token;
  if (adminToken) log(`   Token obtido ✅`);
  else log(`   Login falhou: ${JSON.stringify(loginResp)} — tentando sem reset`);

  // 2. Reset via admin_reset
  if (adminToken) {
    log('🔄 Resetando sala...');
    const reset = await api('admin_reset', { admin_token: adminToken });
    log(`   Reset: ${reset.ok ? 'OK ✅' : JSON.stringify(reset)}`);
  }
  await delay(2000);

  const statusInicial = await getRoomStatus();
  log(`   Fase inicial: ${statusInicial?.room?.phase}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    // ── CADASTROS ─────────────────────────────────────────
    log('\n📋 CADASTRANDO 3 JOGADORES (Ana, Bruno, Carla)...\n');
    const pages = [];
    for (const jogador of JOGADORES) {
      const page = await cadastrarJogador(browser, jogador);
      pages.push(page);
    }

    await delay(2000);
    await salvarPrint(pages[0], 'fase01_apos_cadastros.png');

    const statusCad = await getRoomStatus();
    log(`\n   Fase: ${statusCad?.room?.phase} | Registrados: ${statusCad?.room?.registered}/${statusCad?.room?.expected_stations}`);
    statusCad?.room?.stations?.forEach(s =>
      log(`   PC${s.id}: ${s.player_name || '(vazio)'} — ${s.status}`)
    );

    // ── 3 RODADAS ─────────────────────────────────────────
    for (let r = 1; r <= 3; r++) {
      log(`\n${'─'.repeat(58)}`);
      log(`🏆 RODADA ${r}/3`);
      log('─'.repeat(58));

      log('\n⏳ Aguardando fase "playing"...');
      const faseData = await aguardarFase('playing', 120000);

      if (!faseData) {
        log('⚠️  Tentando forçar start_match via API...');
        const st = await getRoomStatus();
        const stations = st?.room?.stations || [];
        for (const s of stations) {
          if (s.session_id && s.registered) {
            const sm = await api('start_match', {
              session_id: s.session_id,
              station_id: s.id,
              room_id: 'main'
            });
            log(`  start_match PC${s.id}: ${sm.ok ? 'OK' : JSON.stringify(sm)}`);
          }
        }
        await delay(3000);
      }

      await delay(1500);
      await salvarPrint(pages[0], `rodada${r}_inicio.png`);

      // Todos enviam prompts em paralelo
      log(`\n  🎮 Enviando prompts...`);
      log(`  📝 "${PROMPTS[r-1].substring(0, 80)}..."`);
      await Promise.all(JOGADORES.map((j, i) => jogarRodada(pages[i], j, r, PROMPTS[r-1])));

      // Aguarda resultado
      log(`\n  ⏳ Aguardando pontuação...`);
      for (let t = 0; t < 30; t++) {
        const st = await getRoomStatus();
        const fase = st?.room?.phase;
        const allScored = st?.room?.all_scored;
        process.stdout.write(`\r     all_scored=${allScored}, fase=${fase}   `);
        if (allScored || ['round-results', 'final-results'].includes(fase)) {
          process.stdout.write('\n');
          break;
        }
        await delay(3000);
      }
      process.stdout.write('\n');

      await delay(2000);
      await salvarPrint(pages[0], `rodada${r}_score.png`);

      // Mostra placar
      const placar = await getRoomStatus();
      const stations = placar?.room?.stations || [];
      log(`\n  🏅 Placar rodada ${r}:`);
      stations.forEach(s => {
        const pts = s.points || 0;
        const pct = s.percent ? ` (${(s.percent * 100).toFixed(1)}%)` : '';
        log(`     PC${s.id} ${s.player_name || ''}: ${pts} pts${pct} | rounds: ${s.rounds_completed}`);
      });

      if (r < 3) {
        log('\n  ↩️  Aguardando próxima rodada...');
        for (let t = 0; t < 30; t++) {
          const d = await getRoomStatus();
          const f = d?.room?.phase;
          process.stdout.write(`\r     Fase: ${f}   `);
          if (f !== 'playing') { process.stdout.write('\n'); break; }
          await delay(2000);
        }
        process.stdout.write('\n');
      }
    }

    // ── RESULTADO FINAL ────────────────────────────────────
    log(`\n${'═'.repeat(58)}`);
    log('🏆 RESULTADO FINAL DAS 3 RODADAS');
    log('═'.repeat(58));

    await aguardarFase('final-results', 45000).catch(() => {});
    await delay(3000);
    await salvarPrint(pages[0], 'resultado_final.png');

    const finalStatus = await getRoomStatus();
    const ranking = finalStatus?.room?.final_ranking || [];
    if (ranking.length > 0) {
      log('\n  RANKING FINAL:');
      ranking.forEach((s, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i+1}.`;
        log(`  ${medal} ${s.player_name || s.first_name} — ${s.total_points ?? 0} pts (${s.rounds_completed} rodadas)`);
      });
    }

    log(`\n✅ TESTE CONCLUÍDO!`);
    log(`📂 Prints: ${SS_DIR}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n❌ ERRO FATAL:', err.message, err.stack);
  process.exit(1);
});
