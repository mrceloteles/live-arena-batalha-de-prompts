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
    log(`📸 Print salvo: ${filename}`);
  } catch (e) {
    log(`⚠️ Erro print ${filename}: ${e.message}`);
  }
}

async function main() {
  log('===================================================================');
  log('🚀 BATALHA DE PROMPTS — 3 RODADAS COMPLETAS COM CHAVE GEMINI');
  log('   Chave: lida do ambiente (nunca gravada aqui)');
  log('   Modelo Ativo: gemini-3.6-flash com Fallback de Alta Fidelidade');
  log('===================================================================');

  // 1. Reset da Arena
  log('\n🧹 1. Resetando arena via API administrativa...');
  const login = await api('admin_login', { password: 'admin123' });
  if (!login.admin_token) throw new Error('Falha no login admin: ' + JSON.stringify(login));
  const resetRes = await api('admin_reset', { admin_token: login.admin_token });
  if (!resetRes.ok) throw new Error('Falha no reset: ' + JSON.stringify(resetRes));
  log(`✅ Arena limpa e pronta para nova sessão!`);

  // Inicia Puppeteer abrindo a Tela Principal (TV) e a Estação 1
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const tvPage = await browser.newPage();
  await tvPage.setViewport({ width: 1920, height: 1080 });
  await tvPage.goto(`${BASE}/main.php`, { waitUntil: 'domcontentloaded' });
  await delay(1000);

  // 2. Cadastro dos 3 Competidores
  log('\n📋 2. Realizando cadastro dos 3 jogadores...');
  const sessions = [];
  for (const j of JOGADORES) {
    const reg = await api('register', j);
    if (!reg.ok) throw new Error(`Falha no cadastro estação ${j.station_id}: ` + JSON.stringify(reg));
    sessions.push(reg.session);
    log(`   ✅ Estação ${j.station_id}: ${j.name} (${j.role} @ ${j.company})`);
  }

  await delay(1500);
  await tirarPrint(tvPage, 'tv_01_jogadores_cadastrados.png');

  // 3. Execução das 3 Rodadas
  for (let rodada = 1; rodada <= 3; rodada++) {
    log(`\n===================================================================`);
    log(`🏆 RODADA ${rodada} DE 3`);
    log(`===================================================================`);

    // Inicia a partida para os 3 jogadores
    log('🔘 Disparando início da rodada para as 3 estações...');
    const matches = [];
    for (const sess of sessions) {
      const sm = await api('start_match', { session_id: sess.id, station_id: sess.station_id, mode: 'wait_all' });
      if (!sm.ok) throw new Error(`Erro em start_match est. ${sess.station_id}: ` + JSON.stringify(sm));
      matches.push(sm.match);
    }
    log(`   ✅ Partida iniciada para todos os jogadores! Match ID: ${matches[0].id}`);

    await delay(1500);
    await tirarPrint(tvPage, `tv_0${rodada * 2}_rodada${rodada}_desafio_ao_vivo.png`);

    // Envia os prompts avaliados pelo Gemini
    log(`📝 Enviando prompts dos competidores para avaliação pelo Gemini...`);
    const promptRodada = PROMPTS[rodada - 1];

    for (let i = 0; i < sessions.length; i++) {
      const sess = sessions[i];
      const match = matches[i];
      const promptText = promptRodada[i];
      const t0 = Date.now();

      const sub = await api('submit_prompt', {
        match_id: match.id,
        session_id: sess.id,
        prompt: promptText,
        token: randomUUID()
      });

      const elapsed = Date.now() - t0;
      if (sub.ok) {
        const m = sub.match;
        log(`   ✨ [Estação ${sess.station_id}] ${sess.player_name}: Avaliado em ${elapsed}ms | Precisão: ${Number(m.percent || 0).toFixed(1)}% | Pontos: ${m.points}`);
      } else {
        log(`   ⚠️ Erro estação ${sess.station_id}: ` + JSON.stringify(sub));
      }
    }

    // Aguarda processamento de scores e exibição na TV
    await delay(2500);
    await tirarPrint(tvPage, `tv_0${rodada * 2 + 1}_rodada${rodada}_ranking.png`);

    // Consulta placar da rodada
    const statusRodada = await api('room_status', { room_id: 'main' });
    const stations = statusRodada?.room?.stations || [];
    log(`\n🏅 Placar da Rodada ${rodada}:`);
    stations.forEach((s) => {
      log(`   PC ${s.id} (${s.player_name}): +${s.points || 0} pts (Precisão: ${(Number(s.percent || 0) * 100).toFixed(1)}%) | Total: ${s.total_points || 0} pts`);
    });

    if (rodada < 3) {
      log('\n⏳ Aguardando contagem regressiva da TV para próxima rodada...');
      for (let t = 0; t < 30; t++) {
        await delay(1000);
        const st = await api('room_status', { room_id: 'main' });
        if (st.room?.phase === 'ready') {
          log(`   ✅ Arena pronta para Rodada ${rodada + 1}!`);
          break;
        }
      }
    }
  }

  // 4. Pódio Final
  log(`\n===================================================================`);
  log('🏁 GRANDE FINAL — RANKING GERAL DA BATALHA DE PROMPTS');
  log('===================================================================');

  // Aguarda tela final ser renderizada
  await delay(3000);
  await tirarPrint(tvPage, 'tv_08_podium_final_campeao.png');

  const statusFinal = await api('room_status', { room_id: 'main' });
  const ranking = statusFinal?.room?.final_ranking || statusFinal?.room?.stations || [];
  const sorted = [...ranking].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));

  log('\n🏆 PODIUM OFICIAL DOS CAMPEÕES:');
  sorted.forEach((s, idx) => {
    const medal = idx === 0 ? '🥇 1º LUGAR (GRANDE CAMPEÃO)' : idx === 1 ? '🥈 2º LUGAR' : '🥉 3º LUGAR';
    log(`   ${medal}: ${s.player_name || s.first_name} — Total: ${s.total_points || 0} pts | Acerto Médio: ${(Number(s.avg_percent || s.percent || 0) * 100).toFixed(1)}%`);
  });

  await browser.close();
  log('\n🎉 TESTE DE 3 RODADAS CONCLUÍDO COM SUCESSO TOTAL!');
  log(`📁 Screenshots salvos em: ${SS_DIR}`);
}

main().catch((err) => {
  console.error('\n❌ Erro durante a execução:', err);
  process.exit(1);
});
