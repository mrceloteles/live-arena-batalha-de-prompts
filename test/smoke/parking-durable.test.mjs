// A fila do pátio sobrevive ao processo — provado com DOIS processos.
//
// O defeito medido (17/09/2026): o pátio das avaliações vivia na memória do
// processo. Um redeploy (ou um reinício) descartava as esperas, e a submissão
// que estava esperando nota ficava sem nota ATÉ o aluno reenviar. A fila nunca
// esteve na memória, porém: submissão sem linha em `arena_scores` é exatamente
// "ainda esperando nota", e `arena_judge_attempts` guarda as tentativas gastas.
// O que morria era o relógio.
//
// Aqui os dois processos são instâncias de PRODUÇÃO (`src/server/start.mjs`),
// com HTTP, SSE e banco em arquivo de verdade — o provedor é o único ponto
// trocado, e é trocado pelo caminho que existe para isso (`GEMINI_BASE_URL`, o
// mesmo que o arnês de carga usa contra um provedor controlado). Processo A
// aponta para um endpoint que só recusa (503) e é MORTO sem encerramento
// gracioso, de propósito: se algo dependesse de um hook de saída para salvar a
// fila, este teste reprovaria. Processo B sobe sobre o MESMO banco, apontando
// para um endpoint que responde, e tem de entregar a nota sozinho.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ENTRADA = join(RAIZ, 'src/server/start.mjs');
const SENHA = 'senha-do-teste-de-retomada';
const SEGREDO = 'segredo-do-teste-de-retomada-32-chars';
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ESPERA_SUBIR = 30_000;

// ---------------------------------------------------------------------------
// O provedor controlado: dois caminhos no mesmo servidor.
//   /falha  -> 503 sempre (o provedor fora);
//   /ok     -> a nota no formato do provedor (18 de 20 em cada critério = 90%).
// A contagem por caminho é o que prova DE ONDE veio a nota.
// ---------------------------------------------------------------------------
function criarProvedor() {
  const chamadas = { falha: 0, ok: 0 };
  const servidor = createServer((request, response) => {
    const caminho = new URL(request.url, 'http://local').pathname;
    const modo = caminho.startsWith('/falha') ? 'falha' : 'ok';
    chamadas[modo] += 1;
    // O corpo é lido até o fim antes de responder: um POST com o corpo pendente
    // deixa o `fetch` do juiz esperando, e o teste mediria a si mesmo.
    request.resume();
    request.on('end', () => {
      if (modo === 'falha') {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 503, message: 'serviço indisponível' } }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                scores: [{ criterion: 'objetivo', points: 18 }, { criterion: 'contexto', points: 18 }],
                feedback: 'Nota do provedor.',
              }),
            }],
          },
        }],
        modelVersion: 'stub-de-retomada',
      }));
    });
  });
  return {
    chamadas,
    servidor,
    async subir() {
      await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
      return servidor.address().port;
    },
    fechar() { servidor.closeAllConnections?.(); servidor.close(); },
  };
}

/** Sobe uma instância de produção em outro processo e espera ela anunciar a porta. */
function subir(databasePath, extra) {
  const env = {
    ...process.env,
    PORT: '0',
    DATABASE_PATH: databasePath,
    NODE_ENV: 'production',
    JUDGE_MODE: 'gemini-safe',
    GEMINI_API_KEY: 'chave-de-teste-que-nao-vale-nada',
    ADMIN_PASSWORD: SENHA,
    ADMIN_SECRET: SEGREDO,
    TRUSTED_PROXIES: '127.0.0.1,::1',
    // Folgado de propósito: o envio responde assim que a avaliação termina (o
    // prazo é um TETO, não uma espera). Com 200 ms, o veredito do provedor
    // (503 + repetição) às vezes não chegava antes do prazo e a resposta vinha
    // como "pendente" em vez de "estacionada" — o teste media a máquina.
    SUBMIT_WAIT_MS: '5000',
    SHUTDOWN_TIMEOUT_MS: '5000',
    ...extra,
  };
  const filho = spawn(process.execPath, [ENTRADA], { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const estado = { saida: '', erro: '', codigo: null, sinal: null, saiu: false };
  let resolverSaida;
  const saiu = new Promise((resolve) => { resolverSaida = resolve; });
  filho.on('exit', (codigo, sinal) => {
    estado.codigo = codigo; estado.sinal = sinal; estado.saiu = true;
    resolverSaida(estado);
  });
  const pronto = new Promise((resolve, reject) => {
    const prazo = setTimeout(
      () => reject(new Error(`a instância não subiu em ${ESPERA_SUBIR}ms:\n${estado.saida}\n${estado.erro}`)),
      ESPERA_SUBIR,
    );
    filho.stdout.setEncoding('utf8');
    filho.stderr.setEncoding('utf8');
    filho.stdout.on('data', (pedaco) => {
      estado.saida += pedaco;
      const porta = /http:\/\/localhost:(\d+)/.exec(estado.saida);
      if (porta) { clearTimeout(prazo); resolve(Number(porta[1])); }
    });
    filho.stderr.on('data', (pedaco) => { estado.erro += pedaco; });
    filho.once('error', (erro) => { clearTimeout(prazo); reject(erro); });
  });
  return { filho, estado, pronto, saiu };
}

async function lerJson(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) };
}

test('dois processos: o que A estaciona e morre, B retoma do banco e avalia', { timeout: 120_000 }, async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'patio-duravel-'));
  const databasePath = join(diretorio, 'arena.sqlite');
  const provedor = criarProvedor();
  const portaDoProvedor = await provedor.subir();
  const baseDoProvedor = `http://127.0.0.1:${portaDoProvedor}`;
  let instancia = null;
  let base = null;
  try {
    // ---------------------------------------------------------------- processo A
    instancia = subir(databasePath, { GEMINI_BASE_URL: `${baseDoProvedor}/falha` });
    base = `http://127.0.0.1:${await instancia.pronto}`;

    // Uma aula de verdade, por HTTP: sala, missão, aluno e um envio.
    const login = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: SENHA }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, `o painel precisa entrar (status ${login.status})`);
    const post = (action, payload = {}) => lerJson(`${base}/api.php?action=${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(payload),
    });

    await post('arena_set_open', { open: true });
    const criada = await post('arena_create_room', { title: 'Turma da retomada', expected_players: 8 });
    const room = criada.corpo.room;
    assert.ok(room, `a sala precisa nascer: ${JSON.stringify(criada.corpo)}`);
    const salva = await post('arena_save_challenge', {
      title: 'Missão 1', modality: 'precisao', mission: 'Crie um cartaz para a feira de ciências.',
      criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
      reference_text: 'Cartaz A3 com data, local e contato.',
    });
    const challenge = salva.corpo.challenge;
    assert.ok(challenge, `o desafio precisa ser salvo: ${JSON.stringify(salva.corpo)}`);
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    await post('arena_start_round', { room_id: room.id });

    const entrada = await lerJson(`${base}/api.php?action=arena_join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: room.pin || room.code, name: 'Ana' }),
    });
    assert.equal(entrada.status, 200, `a aluna precisa entrar: ${JSON.stringify(entrada.corpo)}`);
    const aluno = { participant_id: entrada.corpo.participant.id, token: entrada.corpo.token };
    const detalhe = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
    const rodada = detalhe.rounds.find((entrada) => entrada.status === 'open');
    assert.ok(rodada, 'a missão precisa estar aberta');

    const envio = await lerJson(`${base}/api.php?action=arena_submit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...aluno, round_id: rodada.id, attempt: 1,
        prompt: 'Crie um cartaz A3 com data, local e contato para a feira de ciências.',
      }),
    });
    assert.equal(envio.status, 200, `o envio precisa ser aceito: ${JSON.stringify(envio.corpo)}`);
    assert.equal(envio.corpo.parked, true, 'o provedor recusou: a avaliação foi ESTACIONADA');
    assert.equal(envio.corpo.reason, 'gemini_http_503');

    // O que A deixa no banco: a submissão, o rastro da tentativa e NENHUMA nota.
    const semNota = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
    assert.equal(semNota.rounds[0].submitted, 1, 'o envio existe');
    assert.equal(semNota.rounds[0].scored, 0, 'e está sem nota');
    assert.equal(provedor.chamadas.falha > 0, true, 'o provedor de A foi consultado');

    // A MORRE sem encerramento gracioso — o pior caso para quem dependesse de um
    // hook de saída para salvar a fila.
    const chamadasAntesDoReinicio = { ...provedor.chamadas };
    instancia.filho.kill('SIGKILL');
    const morreu = await Promise.race([instancia.saiu, dormir(10_000).then(() => null)]);
    assert.ok(morreu, 'o processo A precisa sair');
    assert.equal(instancia.estado.saiu, true);
    instancia = null;

    // ---------------------------------------------------------------- processo B
    instancia = subir(databasePath, { GEMINI_BASE_URL: `${baseDoProvedor}/ok` });
    base = `http://127.0.0.1:${await instancia.pronto}`;

    // O boot diz de fora o que encontrou — sem isto, um reinício que deixou
    // submissão para trás seria invisível.
    const pronto = await lerJson(`${base}/readyz`);
    assert.equal(pronto.status, 200, `B precisa ficar pronta: ${JSON.stringify(pronto.corpo)}`);
    const retomada = pronto.corpo.judge_parking_resume;
    assert.ok(retomada, `B precisa relatar a retomada: ${JSON.stringify(pronto.corpo)}`);
    assert.equal(retomada.found, 1, 'o banco guardou a submissão sem nota');
    assert.equal(retomada.resumed, 1, 'e ela voltou para a fila no processo novo');
    assert.equal(retomada.exhausted, 0);
    // E o vigia da fila sobe junto com a instância: a retomada do boot é a
    // primeira varredura, não a única.
    assert.equal(pronto.corpo.judge_parking_watch?.running, true, 'o vigia entra em operação no boot');
    assert.ok(Number(pronto.corpo.judge_parking_watch?.recovered || 0) >= 1, 'e o boot conta como uma recuperação');

    // A nota chega sozinha: ninguém reenvia nada, e o aluno não está nem com a
    // página aberta.
    const login2 = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: SENHA }),
    });
    const cookie2 = login2.headers.get('set-cookie')?.split(';')[0];
    const postB = (action, payload = {}) => lerJson(`${base}/api.php?action=${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie2 }, body: JSON.stringify(payload),
    });
    const prazo = Date.now() + 30_000;
    let missao = null;
    while (Date.now() < prazo) {
      missao = (await postB('arena_room_detail', { room_id: room.id })).corpo.detail?.rounds?.[0];
      if (Number(missao?.scored || 0) >= 1) break;
      await dormir(250);
    }
    assert.equal(Number(missao?.scored || 0), 1, 'a missão foi avaliada sem ninguém reenviar');
    assert.equal(Number(missao.ranking[0].percent), 90, '18/20 com peso 60 + 18/20 com peso 40 = 90%');
    // E a procedência é a do provedor: a alternativa seria uma nota local — a
    // mentira que esta rodada inteira existe para impedir.
    assert.equal(missao.judge.local, 0, 'nenhuma nota do juiz local');
    assert.equal(missao.judge.provider, 'gemini');
    assert.equal(provedor.chamadas.ok > 0, true, 'a nota veio do provedor do processo B');
    // O provedor de A não foi consultado depois de A morrer (óbvio) e o de B
    // assumiu: somando os dois caminhos, a avaliação foi tentada nos dois lados.
    assert.equal(chamadasAntesDoReinicio.ok, 0, 'A nunca chamou o caminho bom');
  } finally {
    if (instancia && !instancia.estado.saiu) instancia.filho.kill('SIGKILL');
    provedor.fechar();
    // A limpeza é best-effort: no Windows o arquivo do banco pode continuar
    // preso por alguns instantes depois do `SIGKILL`, e uma falha de limpeza não
    // pode ESCONDER o erro que o teste encontrou (era o que acontecia aqui).
    try { rmSync(diretorio, { recursive: true, force: true }); } catch { /* fica no temp */ }
  }
});
