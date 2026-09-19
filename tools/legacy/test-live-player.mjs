import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:3000';
const OUT_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c';

const JOGADORES = [
  { station_id: 1, name: 'Lucas Rossi', email: 'lucas@arena.com', role: 'Prompt Engineer', company: 'AI Labs', lgpd_accept: true },
  { station_id: 2, name: 'Beatriz Lima', email: 'beatriz@arena.com', role: 'Tech Lead', company: 'Cloud Matrix', lgpd_accept: true },
  { station_id: 3, name: 'Gabriel Souza', email: 'gabriel@arena.com', role: 'Data Scientist', company: 'NeuroTech', lgpd_accept: true },
];

const PROMPTS = [
  // Rodada 1
  [
    'Uma mulher sorridente de jaqueta vermelha tira uma selfie em primeiro plano numa trilha de montanha, com o cabelo loiro ao vento. Outra pessoa de casaco vermelho aparece desfocada ao fundo, entre vegetação seca, pinheiros, montanhas e céu nublado, em fotografia grande-angular natural.',
    'Selfie de mulher com casaco vermelho nas montanhas, cabelos ao vento, pinheiros e ceu cinzento ao fundo',
    'Uma jovem aventureira de blusa vermelha fazendo autorretrato no topo da montanha rochosa com tempo nublado'
  ],
  // Rodada 2
  [
    'Uma grande biblioteca subaquática dentro de uma cúpula transparente de vidro. Um polvo laranja usando pequenos óculos redondos consulta livros antigos abertos sobre uma mesa de madeira iluminada por uma luminária dourada, enquanto cardumes prateados, plantas marinhas e raios de sol aparecem na água azul-turquesa.',
    'Polvo laranja usando oculos redondos lendo manuscritos antigos numa mesa de madeira em biblioteca submarina',
    'Biblioteca submarina com polvo sabio de oculos cercado por estantes de livros antigos sob agua cristalina'
  ],
  // Rodada 3
  [
    'Um pequeno robô branco rega uma grande orquídea azul bioluminescente plantada num vaso hexagonal transparente dentro de uma estufa futurista à noite. Três borboletas amarelas voam perto da flor, com trepadeiras, gotas de chuva nos vidros e uma cidade neon azul e violeta ao fundo.',
    'Pequeno androide branco com regador cuidando de flor orquidea azul fluorescente em estufa de vidro a noite',
    'Estufa cyberpunk a noite onde robo futurista cuida de planta alienigena que emite luz azul e borboletas'
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

async function saveScreen(page, name) {
  try {
    const buf = await page.screenshot();
    writeFileSync(`${OUT_DIR}/${name}`, buf);
    log(`📸 Print do jogador: ${name}`);
  } catch (e) {
    log(`⚠️ Erro ao tirar print ${name}: ${e.message}`);
  }
}

async function main() {
  log('===================================================================');
  log('🎮 PARTIDA AO VIVO: JOGADORES JOGANDO AS 3 RODADAS');
  log('===================================================================');

  // 1. Reset da Arena
  const login = await api('admin_login', { password: 'admin123' });
  if (login.admin_token) await api('admin_reset', { admin_token: login.admin_token });
  log('✅ Arena pronta e limpa!');

  // 2. Cadastro dos 3 Jogadores
  const sessions = [];
  for (const j of JOGADORES) {
    const reg = await api('register', j);
    sessions.push(reg.session);
    log(`   👤 ${j.name} registrado na Estação ${j.station_id}!`);
  }

  // 3. Abre o navegador do Jogador 1 (Lucas Rossi)
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Injeta a sessão no sessionStorage do navegador para o jogador estar 100% logado
  await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((sess) => {
    sessionStorage.setItem('batalha_session', JSON.stringify(sess));
    localStorage.setItem('batalha_session', JSON.stringify(sess));
  }, sessions[0]);

  // Executa as 3 rodadas
  for (let rodada = 1; rodada <= 3; rodada++) {
    log(`\n===================================================================`);
    log(`🏆 INICIANDO RODADA ${rodada} DE 3`);
    log(`===================================================================`);

    // Inicia a partida para as 3 estações
    const matches = [];
    for (const s of sessions) {
      const sm = await api('start_match', { session_id: s.id, station_id: s.station_id, mode: 'wait_all' });
      matches.push(sm.match);
    }
    log(`   ⚔️ Partida iniciada na arena! Match ID: ${matches[0].id}`);

    // Jogador 1 recarrega na tela de jogo com o desafio ativo
    await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
    await delay(1200);
    await saveScreen(page, `jogador1_rodada${rodada}_01_vendo_desafio.png`);

    // Jogador 1 clica na textarea e digita o prompt de verdade como humano
    const promptJogador1 = PROMPTS[rodada - 1][0];
    log(`   ✍️ Jogador 1 digitando o prompt na tela...`);
    try {
      const textarea = await page.waitForSelector('#promptInput', { timeout: 6000 });
      await textarea.click();
      await page.type('#promptInput', promptJogador1, { delay: 12 });
      log(`   ✅ Prompt digitado com sucesso!`);
    } catch (e) {
      log(`   ⚠️ Digitação: ${e.message}`);
    }

    await delay(800);
    await saveScreen(page, `jogador1_rodada${rodada}_02_prompt_digitado.png`);

    // Jogador 1 clica no botão "Enviar Resposta"
    log(`   🚀 Jogador 1 clicando no botão "Enviar Resposta"...`);
    const sendBtn = await page.$('.send-button, #promptForm button[type="submit"]');
    if (sendBtn) {
      await sendBtn.click();
      log(`   ✅ Botão clicado! Resposta enviada.`);
    }

    // Submete os outros 2 jogadores em paralelo
    for (let i = 1; i < sessions.length; i++) {
      const s = sessions[i];
      const m = matches[i];
      await api('submit_prompt', {
        match_id: m.id,
        session_id: s.id,
        prompt: PROMPTS[rodada - 1][i],
        token: randomUUID()
      });
      log(`   ✅ PC ${s.station_id} (${s.player_name}) enviou resposta.`);
    }

    // Aguarda avaliação pelo Gemini
    log(`   🤖 Juiz Gemini avaliando e calculando pontuações...`);
    await delay(3000);

    // Jogador 1 vê a sua pontuação e o ranking da rodada na sua tela
    await saveScreen(page, `jogador1_rodada${rodada}_03_tela_score.png`);

    // Consulta e loga o resultado da rodada
    const st = await api('room_status', { room_id: 'main' });
    const p1 = st.room?.stations?.find(s => s.id === 1);
    log(`   🏅 Resultado Jogador 1: ${p1?.points || 0} pts | Acerto: ${(Number(p1?.percent || 0) * 100).toFixed(1)}%`);

    if (rodada < 3) {
      log(`\n⏳ Aguardando transição para próxima rodada...`);
      for (let t = 0; t < 25; t++) {
        await delay(1000);
        const check = await api('room_status', { room_id: 'main' });
        if (check.room?.phase === 'ready') break;
      }
    }
  }

  // Final da Batalha
  log(`\n===================================================================`);
  log('🏁 FIM DE JOGO — PÓDIO DOS JOGADORES');
  log('===================================================================');
  await delay(3000);
  await saveScreen(page, 'jogador1_final_podio.png');

  const finalSt = await api('room_status', { room_id: 'main' });
  const rank = finalSt.room?.final_ranking || finalSt.room?.stations || [];
  rank.sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));

  log('\n🏆 CLASSIFICAÇÃO FINAL DOS JOGADORES:');
  rank.forEach((s, idx) => {
    const medal = idx === 0 ? '🥇 1º Lugar' : idx === 1 ? '🥈 2º Lugar' : '🥉 3º Lugar';
    log(`   ${medal}: ${s.player_name || s.first_name} — ${s.total_points || 0} pts | Precisão Média: ${(Number(s.avg_percent || s.percent || 0) * 100).toFixed(1)}%`);
  });

  await browser.close();
  log('\n✨ PARTIDA COMPLETA DAS 3 RODADAS JOGADA COM ÊXITO!');
}

main().catch(err => {
  console.error('❌ Erro na partida:', err);
  process.exit(1);
});
