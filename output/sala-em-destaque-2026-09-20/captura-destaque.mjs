// Evidência visual da frente "a lista seleciona, a sala em destaque comanda".
//
// O que este script fotografa, no painel de verdade (o servidor da 3000, com o
// `ADMIN_PASSWORD` do `.env`):
//
//   1. a lista como SELETOR — três salas, uma linha cada, estado + online;
//   2. a sala em RASCUNHO selecionada: "Abrir sala" como a ação da vez;
//   3. o ••• ABERTO: os comandos administrativos onde eles moram;
//   4. a sala em LOBBY com três alunos: "Iniciar missão" como a ação da vez;
//   5. a sala EM JOGO, com dois envios e o placar na faixa;
//   6. a MESMA tela em 390 px: o comando empilhado, nada fora da tela.
//
// Uso: node tmp/qa/captura-destaque.mjs   (servidor de pé na 3000)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = 'tmp/qa/destaque';

// A senha sai do `.env` do checkout — o script nunca a imprime.
const env = readFileSync('.env', 'utf8');
const SENHA = /^ADMIN_PASSWORD=(.*)$/m.exec(env)?.[1]?.trim();
if (!SENHA) throw new Error('falta ADMIN_PASSWORD no .env');

const { default: puppeteer } = await import('puppeteer');

const post = async (cookie, action, payload = {}) => {
  const resposta = await fetch(`${BASE}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const set = resposta.headers.getSetCookie?.()[0] || resposta.headers.get('set-cookie') || '';
  const achado = /arena_admin=([^;]+)/.exec(set);
  const corpo = await resposta.json();
  if (!resposta.ok) throw new Error(`${action}: ${resposta.status} ${JSON.stringify(corpo)}`);
  return { corpo, cookie: achado ? `arena_admin=${achado[1]}` : cookie };
};

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(SAIDA, { recursive: true });

// ---- preparo dos estados (pela API, como o professor faria pelo painel) -----
let cookie = '';
({ cookie } = await post(cookie, 'admin_login', { password: SENHA }));
await post(cookie, 'arena_set_open', { open: true });

const { corpo: desafio } = await post(cookie, 'arena_save_challenge', {
  title: `Cartaz da feira ${Date.now()}`,
  modality: 'precisao',
  mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
  criteria: [{ criterion: 'objetivo', weight: 100 }],
  reference_text: 'Cartaz A3 da feira, com data, local e contato.',
  duration_seconds: 600,
});
const challenge = desafio.challenge;

const criarSala = async (titulo, lugares = 3) => {
  const { corpo } = await post(cookie, 'arena_create_room', {
    title: titulo, preset: 'personalizado', expected_players: lugares,
  });
  await post(cookie, 'arena_add_round', { room_id: corpo.room.id, challenge_id: challenge.id });
  return corpo.room;
};

const rascunho = await criarSala('Aula do centro de comando');
const lobby = await criarSala('Aula em lobby');
// Abrir a sala ANTES de a turma entrar: rascunho não aceita ninguém.
await post(cookie, 'arena_publish_room', { room_id: lobby.id });
for (const nome of ['Ana', 'Bruno', 'Carla']) await post(cookie, 'arena_join', { code: lobby.code, name: nome });

const jogo = await criarSala('Aula em jogo');
await post(cookie, 'arena_publish_room', { room_id: jogo.id });
const atletas = [];
for (const nome of ['Dora', 'Enzo', 'Fabi']) {
  const { corpo } = await post(cookie, 'arena_join', { code: jogo.code, name: nome });
  atletas.push({ id: corpo.participant.id, token: corpo.token });
}

console.log(`preparo: rascunho=${rascunho.id} lobby=${lobby.id} jogo=${jogo.id}`);

// ---- navegador ---------------------------------------------------------------
const navegador = await puppeteer.launch({ headless: 'new' });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 900 });
await pagina.goto(`${BASE}/admin-arena.php`, { waitUntil: 'domcontentloaded' });
await pagina.type('[name=password]', SENHA);
await Promise.all([
  pagina.waitForNavigation(),
  pagina.click('[data-admin-arena-login] button[type=submit]'),
]);
await pagina.waitForSelector('[data-arena-room-list] [data-room-id]');

const selecionar = async (titulo) => {
  await pagina.evaluate((alvo) => {
    const linha = [...document.querySelectorAll('[data-arena-room-list] [data-room-id]')]
      .find((no) => no.querySelector('.arena-room-pick-title')?.textContent.trim() === alvo);
    linha?.querySelector('[data-action=detail]')?.click();
  }, titulo);
  await pagina.waitForFunction(
    (alvo) => document.querySelector('[data-arena-detail-title]')?.textContent === alvo,
    { polling: 100, timeout: 30_000 },
    titulo,
  );
};

const foto = async (nome, seletor) => {
  const no = seletor ? await pagina.$(seletor) : null;
  await (no || pagina).screenshot({ path: `${SAIDA}/${nome}.png` });
  return `${nome}.png`;
};

const prints = [];

// 1) A lista como seletor, com a sala em rascunho selecionada.
await selecionar('Aula do centro de comando');
await dormir(400);
prints.push(['1. A lista é o seletor — três salas, uma linha cada', await foto('01-seletor', '#rooms')]);

// 2) A sala em rascunho: "Abrir sala" como ação da vez.
prints.push(['2. Rascunho: a ação da vez é abrir a sala', await foto('02-rascunho', '[data-arena-detail]')]);

// 3) O ••• aberto.
await pagina.evaluate(() => { document.querySelector('.arena-detail-command .arena-admin-tools').open = true; });
await dormir(300);
prints.push(['3. O ••• aberto: os comandos administrativos', await foto('03-menu', '[data-arena-detail]')]);
await pagina.evaluate(() => { document.querySelector('.arena-detail-command .arena-admin-tools').open = false; });

// 4) A sala no lobby com a turma dentro: "Iniciar missão".
await selecionar('Aula em lobby');
await dormir(600);
prints.push(['4. Lobby com três alunos: a ação da vez é iniciar', await foto('04-lobby', '[data-arena-detail]')]);

// 5) A sala em jogo, com dois envios e o placar na faixa.
await post(cookie, 'arena_start_round', { room_id: jogo.id });
const { corpo: detalheDaSala } = await post(cookie, 'arena_room_detail', { room_id: jogo.id });
const rodada = detalheDaSala.detail.rounds[0];
await post(cookie, 'arena_submit', {
  participant_id: atletas[0].id, token: atletas[0].token, round_id: rodada.id,
  prompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
});
await post(cookie, 'arena_submit', {
  participant_id: atletas[1].id, token: atletas[1].token, round_id: rodada.id,
  prompt: 'Cartaz A3 com data, local e contato da feira.',
});
await selecionar('Aula em jogo');
await dormir(1500);
prints.push(['5. Em jogo: a faixa conta os envios e a ação é acompanhar', await foto('05-em-jogo', '[data-arena-detail]')]);

// 6) A mesma tela em 390 px.
await pagina.setViewport({ width: 390, height: 844 });
await dormir(800);
prints.push(['6. Em 390 px o comando empilha e nada sai da tela', await foto('06-celular', '[data-arena-detail]')]);

// ---- folha -------------------------------------------------------------------
const linhas = prints.map(([titulo, arquivo]) => `
  <section>
    <h2>${titulo}</h2>
    <img src="${arquivo}" alt="${titulo}">
  </section>`).join('');
writeFileSync(`${SAIDA}/sheet.html`, `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Sala em destaque — evidência visual</title>
<style>
  body { margin: 0; padding: 24px; background: #0f172a; color: #e6edf7; font: 15px/1.5 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.lead { color: #9fb0c9; margin: 0 0 24px; }
  section { margin: 0 0 28px; }
  h2 { font-size: 15px; margin: 0 0 8px; color: #bcd0ee; font-weight: 600; }
  img { width: 100%; border-radius: 10px; border: 1px solid #22314b; display: block; }
</style></head>
<body>
  <h1>Sala em destaque — a lista seleciona, o destaque comanda</h1>
  <p class="lead">Painel real em ${BASE}, salas e missão de teste.</p>
  ${linhas}
</body></html>
`);

await navegador.close();
console.log(`prints em ${SAIDA}/ — folha em ${SAIDA}/sheet.html`);
