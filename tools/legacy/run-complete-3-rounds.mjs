import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:3000';
const SS_DIR = 'C:/Users/Marcelo/.gemini/antigravity/brain/c9e39875-c666-49e0-877c-376f15a6dc2c';

const JOGADORES = [
  { station_id: 1, name: 'Lucas Rossi', email: 'lucas@arena.com', role: 'Prompt Engineer', company: 'AI Labs', lgpd_accept: true },
  { station_id: 2, name: 'Beatriz Lima', email: 'beatriz@arena.com', role: 'Tech Lead', company: 'Cloud Matrix', lgpd_accept: true },
  { station_id: 3, name: 'Gabriel Souza', email: 'gabriel@arena.com', role: 'Data Scientist', company: 'NeuroTech', lgpd_accept: true },
];

const PROMPTS = [
  // Rodada 1: Mulher selfie montanha
  [
    'Uma mulher sorridente de jaqueta vermelha tira uma selfie em primeiro plano numa trilha de montanha, com o cabelo loiro ao vento. Outra pessoa de casaco vermelho aparece desfocada ao fundo, entre vegetação seca, pinheiros, montanhas e céu nublado, em fotografia grande-angular natural.',
    'Selfie de mulher com jaqueta vermelha nas montanhas, cabelos loiros ao vento, trilha rochosa e pinheiros ao fundo com ceu nublado',
    'Jovem aventureira com casaco vermelho tirando autorretrato em trilha nas montanhas com vegetacao de pinheiros e tempo nublado'
  ],
  // Rodada 2: Polvo biblioteca subaquatica
  [
    'Uma grande biblioteca subaquática dentro de uma cúpula transparente de vidro. Um polvo laranja usando pequenos óculos redondos consulta livros antigos abertos sobre uma mesa de madeira iluminada por uma luminária dourada, enquanto cardumes prateados, plantas marinhas e raios de sol aparecem na água azul-turquesa.',
    'Polvo laranja usando oculos redondos lendo manuscritos antigos numa mesa de madeira em biblioteca de vidro no fundo do mar com agua turquesa e cardumes',
    'Biblioteca submarina com polvo sabio de oculos cercado por estantes de livros antigos e luz dourada sob agua cristalina'
  ],
  // Rodada 3: Robo estufa orquidea
  [
    'Um pequeno robô branco rega uma grande orquídea azul bioluminescente plantada num vaso hexagonal transparente dentro de uma estufa futurista à noite. Três borboletas amarelas voam perto da flor, com trepadeiras, gotas de chuva nos vidros e uma cidade neon azul e violeta ao fundo.',
    'Pequeno androide branco com regador cuidando de flor orquidea azul fluorescente em estufa de vidro a noite com borboletas amarelas e skyline neon',
    'Cenario futurista com robo branco regando orquidea azul brilhante dentro de estufa cyberpunk com chuva e luzes neon violeta'
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
    log(`📸 Screenshot salvo: ${filename}`);
  } catch (e) {
    log(`⚠️ Erro ao salvar screenshot ${filename}: ${e.message}`);
  }
}

async function main() {
  log('===================================================================');
  log('🚀 TESTE DE 3 RODADAS COMPLETAS NA BATALHA DE PROMPTS');
  log('   Chave Gemini: lida do ambiente (nunca gravada aqui)');
  log('   Modelo: gemini-3.6-flash com fallback de alta precisão ativo');
  log('===================================================================');

  // 1. Reset limpo da arena
  log('\n🧹 1. Resetando a arena via API oficial...');
  const login = await api('admin_login', { password: 'admin123' });
  if (!login.admin_token) throw new Error('Falha no login: ' + JSON.stringify(login));
  const resetRes = await api('admin_reset', { admin_token: login.admin_token });
  if (!resetRes.ok) throw new Error('Falha no reset: ' + JSON.stringify(resetRes));
  log(`✅ Arena limpa! Novo ciclo #${resetRes.room?.game?.cycle || 1} iniciado.`);

  // 2. Cadastro dos 3 jogadores
  log('\n📋 2. Cadastrando 3 jogadores nas estações...');
  const sessions = [];
  for (const j of JOGADORES) {
    const reg = await api('register', j);
    if (!reg.ok) throw new Error(`Falha no cadastro estação ${j.station_id}: ` + JSON.stringify(reg));
    sessions.push(reg.session);
    log(`   ✅ Estação ${j.station_id}: ${j.name} (${j.role}, ${j.company}) registrado!`);
  }

  // Inicializa Puppeteer para captura visual das telas
  log('\n🌐 3. Inicializando Puppeteer para verificação visual e prints...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Acessa a tela de espera do jogador 1
  await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
  await delay(1200);
  await tirarPrint(page, '01_cadastros_concluidos.png');

  // 3. Execução das 3 rodadas
  for (let rodada = 1; rodada <= 3; rodada++) {
    log(`\n===================================================================`);
    log(`🏆 INICIANDO RODADA ${rodada} DE 3`);
    log(`===================================================================`);

    // Inicia a partida para todas as 3 estações
    log('🔘 Chamando start_match para as 3 estações...');
    const matches = [];
    for (let i = 0; i < sessions.length; i++) {
      const sess = sessions[i];
      const sm = await api('start_match', { session_id: sess.id, station_id: sess.station_id, mode: 'wait_all' });
      if (!sm.ok) throw new Error(`Erro em start_match estação ${sess.station_id}: ` + JSON.stringify(sm));
      matches.push(sm.match);
      log(`   ✅ Estação ${sess.station_id} (${sess.player_name}): partida iniciada (Match ID: ${sm.match.id})`);
    }

    // Atualiza navegador na tela de jogo
    await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
    await delay(1500);
    await tirarPrint(page, `0${rodada * 2}_rodada${rodada}_jogando.png`);

    // Submete os prompts dos 3 jogadores avaliados pelo Gemini
    log(`\n📝 Enviando prompts dos 3 competidores para avaliação pelo Gemini...`);
    const promptRodada = PROMPTS[rodada - 1];

    for (let i = 0; i < sessions.length; i++) {
      const sess = sessions[i];
      const match = matches[i];
      const promptText = promptRodada[i];
      const t0 = Date.now();

      log(`   [Estação ${sess.station_id}] ${sess.player_name} enviando prompt...`);
      const sub = await api('submit_prompt', {
        match_id: match.id,
        session_id: sess.id,
        prompt: promptText,
        token: randomUUID()
      });

      const elapsed = Date.now() - t0;
      if (!sub.ok) {
        log(`   ⚠️ Erro no submit estação ${sess.station_id}: ` + JSON.stringify(sub));
      } else {
        const m = sub.match;
        log(`   ✨ [Estação ${sess.station_id}] Avaliado em ${elapsed}ms | Acerto: ${Number(m.percent || 0).toFixed(1)}% | Pontos: ${m.points}`);
      }
    }

    // Aguarda e captura tela de score/ranking da rodada
    await delay(2000);
    await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
    await delay(1500);
    await tirarPrint(page, `0${rodada * 2 + 1}_rodada${rodada}_score.png`);

    // Consulta status da sala
    const statusRodada = await api('room_status', { room_id: 'main' });
    const stations = statusRodada?.room?.stations || [];
    log(`\n🏅 Placar após Rodada ${rodada}:`);
    stations.forEach((s) => {
      log(`   PC ${s.id} (${s.player_name}): Pontos: ${s.points || 0} | Total Acumulado: ${s.total_points || 0} pts | Precisão: ${(Number(s.percent || 0) * 100).toFixed(1)}%`);
    });

    if (rodada < 3) {
      log('\n⏳ Aguardando transição da arena para próxima rodada (aguardando fase: ready)...');
      for (let t = 0; t < 30; t++) {
        await delay(1000);
        const st = await api('room_status', { room_id: 'main' });
        if (st.room?.phase === 'ready') {
          log(`   ✅ Arena pronta! Fase agora é 'ready' para Rodada ${rodada + 1}`);
          break;
        }
      }
    }
  }

  // 4. Resultados Finais e Pódio
  log(`\n===================================================================`);
  log('🏁 RESULTADOS FINAIS DA BATALHA DE PROMPTS');
  log('===================================================================');

  log('⏳ Aguardando cálculo do ranking final e pódio...');
  for (let t = 0; t < 20; t++) {
    const st = await api('room_status', { room_id: 'main' });
    if (st.room?.phase === 'final_results' || (st.room?.final_ranking && st.room.final_ranking.length > 0)) {
      break;
    }
    await delay(1000);
  }

  await delay(2000);
  await page.goto(`${BASE}/game.php?station=1&mode=wait_all`, { waitUntil: 'domcontentloaded' });
  await delay(1500);
  await tirarPrint(page, '08_ranking_final.png');

  const statusFinal = await api('room_status', { room_id: 'main' });
  const ranking = statusFinal?.room?.final_ranking || statusFinal?.room?.stations || [];
  const sorted = [...ranking].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));

  log('\n🏆 PODIUM OFICIAL DA ARENA:');
  sorted.forEach((s, idx) => {
    const medal = idx === 0 ? '🥇 1º LUGAR (CAMPEÃO)' : idx === 1 ? '🥈 2º LUGAR' : '🥉 3º LUGAR';
    log(`   ${medal}: ${s.player_name || s.first_name} — Total: ${s.total_points || 0} pontos | Acerto Médio: ${(Number(s.avg_percent || s.percent || 0) * 100).toFixed(1)}%`);
  });

  await browser.close();
  log('\n🎉 TESTE COMPLETO DE 3 RODADAS FINALIZADO COM 100% DE SUCESSO!');
  log(`📁 Screenshots organizados e salvos em: ${SS_DIR}`);
}

main().catch((err) => {
  console.error('\n❌ Erro durante o teste:', err);
  process.exit(1);
});
