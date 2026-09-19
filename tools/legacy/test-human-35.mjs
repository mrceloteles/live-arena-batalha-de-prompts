// Teste humano simulado: 35 pessoas acessando e competindo entre si.
// Fluxo modo turma: cadastro -> admin inicia rodada 1 -> jogadores clicam
// "Pronto para a batalha!" -> 3 rodadas com casos de borda e metricas.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://localhost:3000';
const OUT_DIR = 'var/screenshots';
const N = 35;
const TIMEOUT_STATION = 7;

try { process.loadEnvFile('.env'); } catch {}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('pt-BR');
const log = (msg) => { try { appendFileSync('var/sim-35-progress.log', `[${ts()}] ${msg}\n`); } catch {} console.log(`[${ts()}] ${msg}`); };
const results = { pass: 0, fail: 0, checks: [] };
function check(name, ok, detail = '') {
  results.checks.push({ name, ok, detail });
  results.pass += ok ? 1 : 0;
  results.fail += ok ? 0 : 1;
  console.log(`   ${ok ? '✅ PASS' : '❌ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function api(action, body = {}, timeoutMs = 30000) {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/api.php?action=${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data, ms: Date.now() - started };
  } finally { clearTimeout(t); }
}
async function saveScreen(page, name) {
  try {
    await page.bringToFront(); // rAF só dispara em página em primeiro plano
    await delay(300);
    writeFileSync(`${OUT_DIR}/${name}`, await page.screenshot());
    log(`   📸 ${name}`);
  } catch (e) { log(`   ⚠️ screenshot ${name}: ${e.message}`); }
}
function humanPrompt(round, station) {
  const base = {
    1: 'Uma mulher sorridente de jaqueta vermelha tira uma selfie em primeiro plano numa trilha de montanha, com o cabelo loiro ao vento',
    2: 'Uma grande biblioteca subaquática dentro de uma cúpula transparente de vidro com um polvo laranja usando óculos redondos',
    3: 'Um pequeno robô branco rega uma grande orquídea azul bioluminescente numa estufa futurista à noite',
  }[round];
  const extra = [
    ' com vegetação seca e pinheiros ao fundo', ' em fotografia grande-angular natural',
    ' com céu nublado dramático', ' com cores vivas e iluminação dourada',
    ' e cardumes prateados na água turquesa', ' com borboletas amarelas voando',
    ' e cidade neon azul ao fundo', ' com gotas de chuva nos vidros',
    ' em estilo fotorrealista', ' com composição cinematográfica',
  ][station % 10];
  return (base + extra).trim();
}
async function roomStatus() { return (await api('room_status', { room_id: 'main' })).data.room; }
async function matchIds() {
  const room = await roomStatus();
  return new Map((room?.stations || []).filter((s) => s.match_id).map((s) => [s.id, s.match_id]));
}
async function waitFor(fn, timeoutMs, stepMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (await fn()) return true; await delay(stepMs); }
  return false;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  log('============================================================');
  log(`🎮 TESTE HUMANO: ${N} PESSOAS ACESSANDO E COMPETINDO`);
  log('============================================================');

  // 0. Admin: login, reset, configurar turma com 35
  log('\n[0] Admin — reset e turma com 35 PCs');
  const login = await api('admin_login', { password: ADMIN_PASSWORD });
  check('admin_login', login.status === 200 && login.data.admin_token);
  const adminToken = login.data.admin_token;
  check('admin_reset', (await api('admin_reset', { admin_token: adminToken })).status === 200);
  const cfg = await api('configure_classroom', { admin_token: adminToken, expected_players: N });
  check('configure_classroom(35)', cfg.status === 200 && cfg.data.room?.expected_stations === N, `expected_stations=${cfg.data.room?.expected_stations}`);
  // Baseline do relatorio (acumulado de todos os ciclos): medir delta ao final
  const baseReport = (await api('report_metrics', { admin_token: adminToken, start_date: '2020-01-01', end_date: '2030-01-01' })).data.metrics;

  // 1. Cadastro: 3 via navegador real, 32 via API escalonada
  log('\n[1] Cadastro de 35 jogadores');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const uiPages = [];
  const uiNames = [['Ana Beatriz Rocha', 'ana.beatriz@exemplo.com'], ['Bruno Carvalho', 'bruno.carvalho@exemplo.com'], ['Carla Mendes', 'carla.mendes@exemplo.com']];
  for (let i = 0; i < 3; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE}/game.php?station=${i + 1}&mode=wait_all`, { waitUntil: 'domcontentloaded' });
    await delay(400);
    const cta = await page.$('.start-cta');
    if (cta) await cta.click();
    await delay(300);
    await page.waitForSelector('.register-form', { timeout: 8000 });
    await page.type('[name="name"]', uiNames[i][0], { delay: 10 });
    await page.type('[name="email"]', uiNames[i][1], { delay: 6 });
    await page.type('[name="role"]', 'Participante', { delay: 6 });
    await page.type('[name="company"]', 'Evento', { delay: 6 });
    await (await page.$('[name="lgpd_accept"]'))?.click();
    await delay(100);
    await (await page.$('.form-footer button[type="submit"]'))?.click();
    await waitFor(() => page.evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen === 'wait-registration'), 10000);
    uiPages.push(page);
    log(`   👤 PC ${i + 1} (${uiNames[i][0]}) cadastrado pela interface`);
  }
  const sessions = new Map();
  for (let station = 4; station <= N; station++) {
    await delay(100);
    const r = await api('register', {
      station_id: station, name: `Jogador Humano ${station}`,
      email: `jogador${station}@exemplo.com`, role: 'Participante', company: 'Evento', lgpd_accept: true,
    });
    if (r.status === 200) sessions.set(station, r.data.session);
  }
  check('32 cadastros via API', sessions.size === N - 3, `ok=${sessions.size}`);
  const room35 = await roomStatus();
  for (const st of room35.stations.filter((s) => s.session_id && s.id <= 3)) sessions.set(st.id, { id: st.session_id, station_id: st.id, player_name: st.player_name });
  check('registered=35', room35.registered === N, `registered=${room35.registered}`);
  check('estacoes 1..35 unicas', (room35.stations || []).length === N && new Set(room35.stations.map((s) => s.id)).size === N);

  const tv = await browser.newPage();
  await tv.setViewport({ width: 1920, height: 1080 });
  await tv.goto(`${BASE}/main.php`, { waitUntil: 'domcontentloaded' });
  await delay(2000);
  await saveScreen(tv, '01_tv_35_cadastrados.png');

  // 2. Admin inicia rodada 1; jogadores UI clicam "Pronto para a batalha!"
  log('\n[2] Rodada 1 — admin inicia; jogadores entram na arena');
  const start = await api('start_classroom', { admin_token: adminToken });
  check('start_classroom abre instrucoes (relogio parado)', start.status === 200 && start.data.room?.phase === 'ready', `phase=${start.data.room?.phase}`);
  // O primeiro "Pronto para a batalha!" aceita a turma e inicia a rodada 1 com prazo completo
  const sm1 = await api('start_match', { session_id: sessions.get(1).id, mode: 'wait_all' });
  check('rodada 1 inicia no clique com prazo completo', sm1.status === 200 && sm1.data.match?.round_number === 1, `round=${sm1.data.match?.round_number}`);
  // Nota: o fluxo de clique "Pronto para a batalha!" (manual -> play) foi validado
  // separadamente em test-ui-flow.mjs. Aqui as paginas UI ficam em background
  // (rAF suprimido), entao a competicao roda via API e as paginas servem de tela.
  await delay(800);
  await saveScreen(tv, '02_tv_rodada1_playing.png');
  await saveScreen(uiPages[0], '03_pc1_rodada1_play.png');

  // 3. Rodada 1: rajada de 35 submissoes (dentro do prazo)
  log('\n[3] Rodada 1 — 35 submissões simultâneas');
  const ids1 = await matchIds();
  const burst = async (round, skipStation = 0) => {
    const ids = await matchIds();
    const t0 = Date.now();
    const out = await Promise.all([...sessions.entries()]
      .filter(([station]) => !(skipStation && station === skipStation))
      .map(([station, sess]) => api('submit_prompt', {
        match_id: ids.get(station), session_id: sess.id,
        prompt: humanPrompt(round, station), token: randomUUID(),
      }, 60000).then((r) => ({ station, r }))));
    return { out, ms: Date.now() - t0 };
  };
  const r1 = await burst(1);
  const r1ok = r1.out.filter((x) => x.r.status === 200 && x.r.data.ok).length;
  check('35 submissoes rodada 1 ok', r1ok === N, `ok=${r1ok}/${N} (rajada em ${r1.ms}ms)`);
  const r1fails = r1.out.filter((x) => x.r.status !== 200);
  if (r1fails.length) log(`      falhas: ${JSON.stringify(r1fails.slice(0, 3).map((x) => ({ station: x.station, status: x.r.status, err: x.r.data.error })))}`);
  await waitFor(async () => (await roomStatus()).scored === N, 30000);
  const r1Room = await roomStatus();
  check('35 pontuados rodada 1', r1Room.scored === N, `scored=${r1Room.scored}`);
  check('ranking rodada 1 com 35 entradas', r1Room.round_ranking?.length === N, `len=${r1Room.round_ranking?.length}`);
  const pos = new Set(r1Room.round_ranking.map((r) => r.position));
  check('posicoes 1..35 distintas no ranking', pos.size === N && Math.min(...pos) === 1 && Math.max(...pos) === N);
  // Idempotencia: reenvio da mesma resposta com token novo (mesmo prompt)
  const again = await api('submit_prompt', { match_id: ids1.get(1), session_id: sessions.get(1).id, prompt: humanPrompt(1, 1), token: randomUUID() });
  check('reenvio idempotente (mesma resposta)', again.status === 200 && again.data.idempotent === true, `status=${again.status} idempotent=${again.data.idempotent}`);
  // Token vazio deve ser rejeitado pela validacao
  const emptyToken = await api('submit_prompt', { match_id: ids1.get(1), session_id: sessions.get(1).id, prompt: humanPrompt(1, 1), token: '' });
  check('token vazio rejeitado -> 422', emptyToken.status === 422, `status=${emptyToken.status}`);
  await delay(1000);
  await saveScreen(tv, '04_tv_rodada1_results.png');
  await saveScreen(uiPages[0], '05_pc1_rodada1_score.png');

  // 4. Rodada 2: espera transicao (results 10s -> ready -> start_match)
  log('\n[4] Rodada 2 — transição e submissões escalonadas');
  await waitFor(async () => (await roomStatus()).phase === 'ready', 20000);
  const sm2 = await api('start_match', { session_id: sessions.get(1).id, mode: 'wait_all' });
  check('start_match rodada 2', sm2.status === 200 && sm2.data.match?.round_number === 2, `round=${sm2.data.match?.round_number}`);
  const r2 = await burst(2);
  const r2ok = r2.out.filter((x) => x.r.status === 200 && x.r.data.ok).length;
  check('35 submissoes rodada 2 ok', r2ok === N, `ok=${r2ok}/${N}`);
  await waitFor(async () => (await roomStatus()).scored === N, 30000);
  check('35 pontuados rodada 2', (await roomStatus()).scored === N);

  // 5. Rodada 3: casos de borda + 34 submetem + PC 7 timeout
  log('\n[5] Rodada 3 — casos de borda, 34 submetem, PC 7 não envia');
  await waitFor(async () => (await roomStatus()).phase === 'ready', 20000);
  await api('start_match', { session_id: sessions.get(1).id, mode: 'wait_all' });
  await waitFor(async () => (await roomStatus()).phase === 'playing' && (await roomStatus()).current_round === 3, 10000);

  const ids3 = await matchIds();
  const r3match5 = ids3.get(5);
  // Tokens unicos por execucao: a chave de idempotencia persiste entre ciclos,
  // entao reutilizar 'edge-token-1' colidiria com o ciclo anterior (409 correto).
  const edgeToken = (label) => `edge-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const edge1 = await api('submit_prompt', { match_id: r3match5, session_id: sessions.get(5).id, prompt: humanPrompt(3, 5), token: edgeToken('1') });
  check('1a submissao PC 5 ok', edge1.status === 200 && edge1.data.ok, `status=${edge1.status} (${edge1.data.error})`);
  const edge2 = await api('submit_prompt', { match_id: r3match5, session_id: sessions.get(5).id, prompt: humanPrompt(3, 5) + ' ALTERADO', token: edgeToken('2') });
  check('resposta diferente na mesma estacao -> 409', edge2.status === 409, `status=${edge2.status} (${edge2.data.error})`);
  const edge3 = await api('register', { station_id: 20, name: 'Tarde Demais', email: 'tarde@x.com', role: 'x', company: 'x', lgpd_accept: true });
  check('cadastro tardio bloqueado -> 409', edge3.status === 409, `status=${edge3.status}`);
  const edge4 = await api('submit_prompt', { match_id: ids3.get(5), session_id: sessions.get(9).id, prompt: 'x', token: randomUUID() });
  check('sessao errada no match -> 403', edge4.status === 403, `status=${edge4.status}`);
  const edge5 = await api('register', { station_id: 99, name: 'Fora Do Limite', email: 'fora@x.com', role: 'x', company: 'x', lgpd_accept: true });
  check('estacao 99 rejeitada', [422, 409].includes(edge5.status), `status=${edge5.status}`);

  const r3 = await burst(3, TIMEOUT_STATION);
  const r3ok = r3.out.filter((x) => x.r.status === 200 && x.r.data.ok).length;
  check('34 submissoes rodada 3 ok', r3ok === N - 1, `ok=${r3ok}/${N - 1}`);

  // Espera deadline do servidor zerar o PC 7
  const deadlineAt = (await roomStatus()).round?.deadline_at || 0;
  const waitSec = Math.max(0, deadlineAt + 2 - Date.now() / 1000) + 1;
  log(`   ⏳ Aguardando deadline (${waitSec.toFixed(0)}s) para timeout do PC ${TIMEOUT_STATION}...`);
  await delay(waitSec * 1000);
  await waitFor(async () => (await roomStatus()).phase === 'final_results', 30000);
  check('rodada 3 fechada pelo servidor (timeout)', (await roomStatus()).phase === 'final_results');
  const st7 = (await roomStatus()).stations?.find((s) => s.id === TIMEOUT_STATION);
  check(`PC ${TIMEOUT_STATION} zerado no timeout`, st7?.points === 0 && st7?.status === 'scored' && st7?.percent === 0, `points=${st7?.points} status=${st7?.status}`);

  // 6. Ranking final
  log('\n[6] Ranking final');
  const finalRoom = await roomStatus();
  const finalRanking = finalRoom.final_ranking || [];
  check('final_ranking com 35 entradas', finalRanking.length === N, `len=${finalRanking.length}`);
  const winner = finalRanking[0];
  check('campeao com maior pontuacao', winner && finalRanking.every((r) => r.total_points <= winner.total_points), `${winner?.player_name}: ${winner?.total_points}pts`);
  const sorted = finalRanking.every((r, i) => i === 0 || finalRanking[i - 1].total_points >= r.total_points);
  check('ranking ordenado por pontos', sorted);
  console.log('   🏆 TOP 5:');
  finalRanking.slice(0, 5).forEach((r, i) => console.log(`      ${i + 1}. ${r.player_name} — ${r.total_points} pts (${(r.avg_percent * 100).toFixed(1)}% méd.)`));
  await saveScreen(tv, '06_tv_final_results.png');
  await saveScreen(uiPages[0], '07_pc1_final_score.png');

  // 7. Performance do room_status (hot path do polling) com 35 PCs
  log('\n[7] Latência room_status (polling) com 35 PCs');
  const lat = [];
  for (let i = 0; i < 20; i++) { lat.push((await api('room_status', { room_id: 'main' })).ms); }
  lat.sort((a, b) => a - b);
  const p95 = lat[Math.floor(lat.length * 0.95)];
  check('room_status p95 < 300ms', p95 < 300, `min=${lat[0]}ms avg=${(lat.reduce((s, v) => s + v, 0) / lat.length).toFixed(0)}ms p95=${p95}ms max=${lat.at(-1)}ms`);

  // 8. Relatorio admin (acumulado: medir delta sobre a baseline deste ciclo)
  log('\n[8] Relatório administrativo');
  const report = await api('report_metrics', { admin_token: adminToken, start_date: '2020-01-01', end_date: '2030-01-01' });
  const m = report.data.metrics;
  const dPlayers = m?.cards?.players - (baseReport?.cards?.players || 0);
  const dMatches = m?.cards?.matches_scored - (baseReport?.cards?.matches_scored || 0);
  check('relatorio: +35 jogadores neste ciclo', dPlayers === N, `delta=${dPlayers}`);
  check('relatorio: +105 partidas pontuadas (35x3, PC 7 zerado no timeout conta)', dMatches === N * 3, `delta=${dMatches}`);

  // 9. Recuperacao de sessao (F5) no fim do jogo
  log('\n[9] F5 do jogador no fim do jogo');
  await uiPages[0].reload({ waitUntil: 'domcontentloaded' });
  await delay(2500);
  const scr = await uiPages[0].evaluate(() => document.querySelector('.screen.is-active')?.dataset?.screen || '');
  check('sessao recuperada apos F5', ['score', 'wait-results', 'manual', 'play', 'start'].includes(scr), `screen=${scr}`);

  await browser.close();
  log('\n============================================================');
  log(`📊 RESUMO: ${results.pass} PASS / ${results.fail} FAIL`);
  log('============================================================');
  writeFileSync('var/sim-35-results.json', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  writeFileSync('var/sim-35-results.json', JSON.stringify({ ...results, fatal: String(err?.stack || err) }, null, 2));
  process.exit(1);
});