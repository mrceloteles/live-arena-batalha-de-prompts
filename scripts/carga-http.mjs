#!/usr/bin/env node
// Carga sintética contra uma INSTALAÇÃO REAL.
//
//   node scripts/carga-http.mjs [--alunos 35] [--missoes 3] [--latencia 120]
//                               [--espera-ms 8000] [--concorrencia 4] [--rotulo nome]
//                               [--provedor controlado|real] [--teto-chamadas N]
//                               [--alvo https://homolog.exemplo]
//
// A diferença para `scripts/carga.mjs` é o que está sendo medido, e não o
// cenário. Lá o juiz é uma FUNÇÃO injetada dentro do processo do arnês: mede o
// desenho (fila, teto, resposta pendente) e mais nada. Aqui:
//
//   - o alvo é um PROCESSO separado (`npm start`), com banco em ARQUIVO no disco,
//     como o perfil de hospedagem escolhido (um processo + volume persistente);
//   - a política do juiz vem do AMBIENTE (`JUDGE_MODE`, `JUDGE_CONCURRENCY`, …),
//     inclusive os números do teto — é a fiação de produção que está no caminho;
//   - o tráfego é HTTP de verdade: login, salas, envios e os streams SSE de cada
//     aluno, com os bytes que passam por eles;
//   - o provedor é, por padrão, um endpoint CONTROLADO na própria máquina
//     (`GEMINI_BASE_URL`), então o adaptador externo de verdade roda — fetch,
//     headers, timeout, repetição, parsing — com ZERO requisição para fora e
//     zero cota gasta.
//
// TRÊS MODOS, e a diferença entre eles é o que se pode concluir depois:
//
//   (padrão) provedor controlado, servidor local
//       Mede o desenho (fila, teto, resposta pendente, bytes) com latência
//       escolhida. NÃO mede o provedor real nem o host de destino.
//
//   --provedor real [--teto-chamadas N]
//       O MESMO arnês falando com o provedor oficial, com o juiz em
//       `gemini-safe` (sem rede não há nota, em vez de nota local silenciosa).
//       Exige orçamento explícito: `--teto-chamadas` vira o `JUDGE_CALLS_PER_HOUR`
//       da instância, então o próprio servidor recusa a chamada N+1. Mede a
//       latência real do provedor e quantos alunos veem "pendente" por causa
//       dela. NÃO mede o host de destino.
//
//   --alvo https://… [--teto-chamadas N]
//       Mede uma INSTALAÇÃO JÁ RODANDO (o host de destino), sem SSH e sem subir
//       nada local: mesma turma, mesmos envios, mesmos streams. O provedor é o
//       que a instalação já tem configurado. ESCREVE NA INSTALAÇÃO (cria sala,
//       missões e participantes), então exige `CARGA_ALVO_CONFIRMADO=1` e
//       `CARGA_SENHA_ADMIN` — use só em homologação, nunca em produção.
//
//   --falha-provedor N [--modo-juiz gemini|gemini-safe]
//       Injeta a falha do provedor (403, 429, 500…) no endpoint controlado e
//       mede o que a turma sente nos DOIS modos. Não é um cenário de vitória:
//       com `gemini` a expectativa é que TODA nota venha do juiz local (o
//       fallback silencioso, com a nota parecendo do provedor); com
//       `gemini-safe` a expectativa é que NENHUMA nota exista (falha explícita).
//       É assim que um projeto de API sem acesso deixa de ser invisível.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A chave e o modelo do provedor real vêm do ambiente; se não estiverem nele,
// vêm do `.env` do repositório (o servidor também carrega, mas em modo real
// quem precisa conhecê-la antes de subir é este arnês).
try { process.loadEnvFile(join(raiz, '.env')); } catch { /* sem .env: usa o ambiente */ }

const argumento = (nome, padrao) => {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? Number(process.argv[indice + 1]) : padrao;
};
const texto = (nome, padrao) => {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? String(process.argv[indice + 1]) : padrao;
};

const ALUNOS = argumento('alunos', 35);
const MISSOES = argumento('missoes', 3);
const LATENCIA_PROVEDOR = argumento('latencia', 120);
const ESPERA_MS = argumento('espera-ms', 8000);
const CONCORRENCIA = argumento('concorrencia', 0);
const PROVEDOR_MODO = texto('provedor', 'controlado');
const TETO_CHAMADAS = argumento('teto-chamadas', 0);
const FALHA_PROVEDOR = argumento('falha-provedor', 0);
// Com `--falha-vezes N`, o provedor controlado recusa apenas as N primeiras
// chamadas e depois volta. É o cenário que prova a repetição: uma cota que
// estoura e se recupera NÃO deve terminar em nota heurística.
const FALHA_VEZES = argumento('falha-vezes', 0);
const ALVO = texto('alvo', '').replace(/\/+$/, '');
const ROTULO = texto('rotulo', `${ALUNOS} alunos · ${MISSOES} missões · ${PROVEDOR_MODO}${ALVO ? ` · alvo ${ALVO}` : ''}`);
// O modo do juiz é explícito nos cenários de injeção de falha (é ele que decide
// se a falha vira nota local ou erro); no caminho feliz, `gemini-safe` no
// provedor real (falha explícita) e `gemini` no controlado.
const MODO_JUIZ = texto('modo-juiz', PROVEDOR_MODO === 'real' ? 'gemini-safe' : 'gemini');

const oficial = 'https://generativelanguage.googleapis.com/v1beta';

const recusar = (mensagem) => { console.error(`carga-http: ${mensagem}`); process.exit(1); };

if (!['controlado', 'real'].includes(PROVEDOR_MODO)) {
  recusar(`--provedor aceita "controlado" ou "real" (recebido: ${JSON.stringify(PROVEDOR_MODO)})`);
}
if (ALVO && PROVEDOR_MODO === 'real') {
  recusar('--alvo e --provedor real se contradizem: no alvo, o provedor é o que a instalação já tem configurado');
}
// Modo real sem teto é exatamente o que o plano proíbe: a única carga
// autorizada contra o provedor pago é a que tem limite explícito.
if (PROVEDOR_MODO === 'real' && !(TETO_CHAMADAS > 0)) {
  recusar('--provedor real exige --teto-chamadas N: sem teto, a medição vira gasto sem limite');
}
if (ALVO && process.env.CARGA_ALVO_CONFIRMADO !== '1') {
  recusar('--alvo ESCREVE na instalação (sala, missões, participantes). Rode apenas em homologação '
    + 'e confirme com CARGA_ALVO_CONFIRMADO=1 no ambiente');
}

const SENHA_ADMIN = ALVO ? (process.env.CARGA_SENHA_ADMIN || '') : 'carga-senha-homolog';
if (ALVO && !SENHA_ADMIN) recusar('--alvo exige CARGA_SENHA_ADMIN (a senha do painel daquela instalação)');

const chaveReal = PROVEDOR_MODO === 'real' ? String(process.env.GEMINI_API_KEY || '').trim() : '';
if (PROVEDOR_MODO === 'real' && !chaveReal) {
  recusar('--provedor real exige GEMINI_API_KEY (no ambiente ou no .env do repositório)');
}
const baseReal = PROVEDOR_MODO === 'real' ? (process.env.GEMINI_BASE_URL || oficial).replace(/\/+$/, '') : null;
if (PROVEDOR_MODO === 'real' && process.env.GEMINI_BASE_URL) {
  console.error(`carga-http: aviso — GEMINI_BASE_URL está definido (${process.env.GEMINI_BASE_URL}); `
    + 'a medição vai para esse endpoint, não para o oficial');
}

function percentil(valores, fracao) {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return Math.round(ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * fracao))]);
}

// ---------------------------------------------------------------------------
// Provedor controlado: responde no formato do Gemini e conta o que recebeu.
// ---------------------------------------------------------------------------
const provedor = { chamadas: 0, emVoo: 0, pico: 0, trilha: [] };

function lerCorpo(request) {
  return new Promise((resolve) => {
    let bruto = '';
    request.on('data', (pedaco) => { bruto += pedaco; });
    request.on('end', () => resolve(bruto));
  });
}

const servidorProvedor = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://local');
  if (url.pathname === '/stats') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      chamadas: provedor.chamadas, pico_simultaneo: provedor.pico,
    }));
    return;
  }
  if (!url.pathname.includes(':generateContent') || request.method !== 'POST') {
    response.writeHead(404).end('nao encontrado');
    return;
  }
  const inicio = Date.now();
  const registro = { caminho: url.pathname, bytes: 0, ms: 0, erro: null };
  provedor.trilha.push(registro);
  try {
    const corpo = await lerCorpo(request);
    registro.bytes = corpo.length;
    provedor.chamadas += 1;
    provedor.emVoo += 1;
    provedor.pico = Math.max(provedor.pico, provedor.emVoo);
    // Injeção de falha: o provedor ``recusa'' como o oficial recusou de fato,
    // no mesmo formato de erro. Serve para medir o que a turma sente quando o
    // acesso ao provedor cai — o caso em que um modo silencioso esconde o
    // problema atrás de notas locais.
    if (FALHA_PROVEDOR && (FALHA_VEZES <= 0 || provedor.chamadas <= FALHA_VEZES)) {
      provedor.emVoo -= 1;
      registro.recusou = FALHA_PROVEDOR;
      response.writeHead(FALHA_PROVEDOR, { 'content-type': 'application/json' }).end(JSON.stringify({
        error: {
          code: FALHA_PROVEDOR,
          message: `provedor controlado recusou (injecao de falha ${FALHA_PROVEDOR})`,
          status: FALHA_PROVEDOR === 403 ? 'PERMISSION_DENIED' : 'ERROR',
        },
      }));
      return;
    }
    // As notas saem dos critérios que o PRÓPRIO pedido declara, como faria o
    // provedor real: nota fixa por critério, no formato que o adaptador valida.
    const textoDoPedido = JSON.parse(corpo)?.contents?.[0]?.parts?.map((parte) => parte.text ?? '').join('\n') ?? '';
    const nomes = [...textoDoPedido.matchAll(/^- (.+?) \(peso [\d.]+\)$/gm)].map((achado) => achado[1]);
    const scores = (nomes.length ? nomes : ['objetivo']).map((criterion) => ({ criterion, points: 15 }));
    const payload = {
      candidates: [{
        content: { parts: [{ text: JSON.stringify({ scores, feedback: 'Nota do provedor controlado.' }) }] },
        finishReason: 'STOP',
      }],
      modelVersion: 'controle-carga-v1',
    };
    if (LATENCIA_PROVEDOR > 0) await dormir(LATENCIA_PROVEDOR);
    provedor.emVoo -= 1;
    // Sem guarda de "cliente desistiu": numa medição, provedor que fica calado
    // transforma o atraso dele no timeout do adaptador e a medição passa a
    // medir a si mesma. (O `request.destroyed` de um POST cujo corpo já foi lido
    // é verdadeiro em Node — usar isso como teste de desistência silenciava a
    // resposta e foi exatamente o defeito da primeira versão deste arnês: 8 s de
    // "pendente" e duas chamadas por submissão com um provedor que respondia em
    // 40 ms.)
    registro.respondeu = true;
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
  } catch (erro) {
    // Provedor que estoura calado faz o adaptador esperar o proprio timeout: o
    // erro tem de aparecer, e nao virar "o provedor demorou".
    registro.erro = String(erro?.message || erro);
    provedor.emVoo -= 1;
    if (!response.writableEnded) response.writeHead(500).end('erro no provedor controlado');
  } finally {
    registro.ms = Date.now() - inicio;
  }
});

let portaProvedor = null;
if (!ALVO && PROVEDOR_MODO === 'controlado') {
  await new Promise((resolve) => servidorProvedor.listen(0, '127.0.0.1', resolve));
  portaProvedor = servidorProvedor.address().port;
}

// ---------------------------------------------------------------------------
// Provedor real: uma pergunta barata ANTES da turma inteira. Listar modelos
// valida chave e endpoint sem gerar conteúdo (zero custo de geração); sem isto,
// uma chave inválida gastaria a turma inteira em 401 para dizer a mesma coisa.
// ---------------------------------------------------------------------------
let preflight = null;
if (PROVEDOR_MODO === 'real') {
  const inicio = Date.now();
  try {
    const resposta = await fetch(`${baseReal}/models?key=${encodeURIComponent(chaveReal)}`, {
      headers: { accept: 'application/json' },
    });
    preflight = { ok: resposta.ok, status: resposta.status, ms: Date.now() - inicio };
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => '');
      recusar(`o provedor recusou a chave (HTTP ${resposta.status}): ${corpo.slice(0, 200)}`);
    }
  } catch (erro) {
    recusar(`não foi possível falar com o provedor real (${baseReal}): ${erro?.message || erro}`);
  }
}

// ---------------------------------------------------------------------------
// A instalação: no padrão, um processo separado com ambiente de produção e banco
// em arquivo. Com `--alvo`, é a instalação que já está rodando — nada sobe aqui.
// ---------------------------------------------------------------------------
const diretorio = ALVO ? null : mkdtempSync(join(tmpdir(), 'carga-http-'));
const databasePath = ALVO ? null : join(diretorio, 'homolog.sqlite');
const envDoFilho = ALVO ? null : {
  ...process.env,
  NODE_ENV: 'production',
  PORT: '0',
  DATABASE_PATH: databasePath,
  ADMIN_PASSWORD: SENHA_ADMIN,
  ADMIN_SECRET: 'carga-segredo-de-homologacao-32+',
  SUBMIT_WAIT_MS: String(ESPERA_MS),
  ...(CONCORRENCIA > 0 ? { JUDGE_CONCURRENCY: String(CONCORRENCIA) } : {}),
  ...(PROVEDOR_MODO === 'real'
    ? {
      // `gemini-safe` é o modo honesto para medir: sem resposta válida NÃO existe
      // nota, em vez de nota local silenciosa. Uma chave ruim aparece como
      // "notas gravadas 0/N", não como números bonitos de origem local.
      JUDGE_MODE: MODO_JUIZ,
      GEMINI_API_KEY: chaveReal,
      ...(process.env.GEMINI_MODEL ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
      ...(TETO_CHAMADAS > 0 ? { JUDGE_CALLS_PER_HOUR: String(TETO_CHAMADAS) } : {}),
    }
    : {
      JUDGE_MODE: MODO_JUIZ,
      GEMINI_API_KEY: 'chave-de-homologacao-sem-valor',
      GEMINI_MODEL: 'modelo-controlado',
      GEMINI_BASE_URL: `http://127.0.0.1:${portaProvedor}/v1beta`,
    }),
};
if (envDoFilho) {
  // O override de endpoint é desta execução: não herda nem contamina nada de fora.
  delete envDoFilho.TURSO_URL;
  delete envDoFilho.TURSO_AUTH_TOKEN;
  if (PROVEDOR_MODO === 'real') delete envDoFilho.GEMINI_BASE_URL;
}

let filho = null;
const saida = [];
let base = ALVO || null;

async function encerrarFilho() {
  if (!filho || filho.exitCode !== null || filho.signalCode !== null) {
    const tudo = saida.join('');
    return {
      saiu: true,
      drenou: /drenou: (true|false)/.exec(tudo)?.[1] ?? null,
      cancelou: /cancelou: (true|false)/.exec(tudo)?.[1] ?? null,
    };
  }
  filho.kill('SIGTERM');
  for (let tentativa = 0; tentativa < 40; tentativa += 1) {
    if (filho.exitCode !== null || filho.signalCode !== null) break;
    await dormir(500);
  }
  const saiu = filho.exitCode !== null || filho.signalCode !== null;
  if (!saiu) filho.kill('SIGKILL');
  const tudo = saida.join('');
  const drenou = /drenou: (true|false)/.exec(tudo)?.[1] ?? null;
  const cancelou = /cancelou: (true|false)/.exec(tudo)?.[1] ?? null;
  return { saiu, drenou, cancelou };
}

const limpar = () => {
  servidorProvedor.close();
  servidorProvedor.closeAllConnections?.();
  if (diretorio) rmSync(diretorio, { recursive: true, force: true });
};

const falhar = async (mensagem) => {
  console.error(`carga-http: ${mensagem}`);
  console.error(saida.join(''));
  await encerrarFilho();
  limpar();
  process.exit(1);
};

if (!ALVO) {
  filho = spawn(process.execPath, [join('src', 'server', 'start.mjs')], {
    cwd: raiz, env: envDoFilho, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const esperaDoEndereco = new Promise((resolve, reject) => {
    const prazo = setTimeout(() => reject(new Error(`o servidor não anunciou a porta. stdout: ${saida.join('')}`)), 30_000);
    filho.stdout.setEncoding('utf8');
    filho.stdout.on('data', (pedaco) => {
      saida.push(pedaco);
      const achado = /http:\/\/localhost:(\d+)/.exec(pedaco);
      if (achado && !base) { base = `http://127.0.0.1:${achado[1]}`; clearTimeout(prazo); resolve(); }
    });
    filho.stderr.setEncoding('utf8');
    filho.stderr.on('data', (pedaco) => saida.push(`[stderr] ${pedaco}`));
    filho.on('exit', (codigo) => {
      if (!base) { clearTimeout(prazo); reject(new Error(`o servidor saiu com código ${codigo}. Saída: ${saida.join('')}`)); }
    });
  });
  try {
    await esperaDoEndereco;
  } catch (error) {
    await falhar(error.message);
  }
}

const json = async (caminho) => {
  const resposta = await fetch(`${base}${caminho}`, { headers: { accept: 'application/json' } });
  return { status: resposta.status, corpo: await resposta.json() };
};

// Prontidão: a instalação só começa a receber tráfego depois que ela responde.
// No alvo remoto, isto também é a prova de que o endereço é do produto.
let prontidao = null;
for (let tentativa = 0; tentativa < 60; tentativa += 1) {
  try {
    const medida = await json('/readyz');
    if (medida.status === 200 && medida.corpo.ok) { prontidao = medida.corpo; break; }
    if (medida.status === 503 && medida.corpo.problems) {
      await falhar(`o alvo respondeu 503 no /readyz: ${JSON.stringify(medida.corpo.problems)}`);
    }
  } catch { /* ainda subindo */ }
  await dormir(250);
}
if (!prontidao) await falhar(`a instalação não ficou pronta (/readyz) em ${base}`);
if (ALVO && prontidao.hosting !== 'volume-persistente') {
  console.error(`carga-http: aviso — o alvo não declara o perfil 'volume-persistente' (${prontidao.hosting})`);
}
// Em modo real (local) o provedor tem de estar no caminho: um `/readyz` com o
// juiz local significa que a medição mediria a si mesma.
if (PROVEDOR_MODO === 'real' && !JSON.stringify(prontidao.judge || {}).includes('gemini')) {
  await falhar(`o juiz da instalação não é o provedor real: ${JSON.stringify(prontidao.judge)}`);
}

let cookie = null;
const post = async (action, payload = {}) => {
  const resposta = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) };
};

const login = await fetch(`${base}/api.php?action=admin_login`, {
  method: 'POST', body: JSON.stringify({ password: SENHA_ADMIN }),
});
cookie = login.headers.get('set-cookie')?.split(';')[0] ?? null;
if (login.status !== 200 || !cookie) await falhar(`login do painel falhou: ${login.status}`);

if (process.env.CARGA_VERBOSE) console.log(`carga-http: ${ROTULO}`);
await post('arena_set_open', { open: true });
const criada = await post('arena_create_room', { title: `Turma de carga (${ROTULO})`, expected_players: ALUNOS });
const room = criada.corpo.room;
if (!room) await falhar(`arena_create_room falhou: ${JSON.stringify(criada.corpo)}`);
for (let indice = 0; indice < MISSOES; indice += 1) {
  const salva = await post('arena_save_challenge', {
    title: `Missão ${indice + 1}`,
    modality: 'precisao',
    mission: 'Crie um cartaz para a feira de ciências.',
    criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
    reference_text: 'Cartaz A3 com data, local e contato.',
  });
  const challenge = salva.corpo.challenge;
  if (!challenge) await falhar(`arena_save_challenge falhou: ${JSON.stringify(salva.corpo)}`);
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: room.id });

// Entrada da turma: HTTP de verdade, um a um (é o que a fila da porta faz).
const turma = [];
for (let indice = 0; indice < ALUNOS; indice += 1) {
  const entrada = await fetch(`${base}/api.php?action=arena_join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: room.code, name: `Aluno ${indice + 1}` }),
  });
  const corpo = await entrada.json().catch(() => ({}));
  if (entrada.status !== 200) await falhar(`arena_join falhou: ${entrada.status} ${JSON.stringify(corpo)}`);
  turma.push({ participant_id: corpo.participant.id, token: corpo.token });
}

// Streams de tempo real, com os bytes que passam por eles contados de verdade.
const streams = [];
for (const aluno of turma) {
  const url = `${base}/events?room=${encodeURIComponent(room.id)}`
    + `&participant_id=${encodeURIComponent(aluno.participant_id)}&token=${encodeURIComponent(aluno.token)}`;
  const registro = { status: 0, bytes: 0, eventos: 0, cancelar: null };
  try {
    const resposta = await fetch(url, { headers: { accept: 'text/event-stream' } });
    registro.status = resposta.status;
    if (resposta.status === 200 && resposta.body) {
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let resto = '';
      registro.cancelar = () => { void leitor.cancel().catch(() => {}); };
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await leitor.read();
            if (done) break;
            registro.bytes += value.length;
            resto += decodificador.decode(value, { stream: true });
            let corte = resto.indexOf('\n\n');
            while (corte >= 0) { registro.eventos += 1; resto = resto.slice(corte + 2); corte = resto.indexOf('\n\n'); }
          }
        } catch { /* stream encerrado pelo servidor */ }
      })();
    }
  } catch { registro.status = 0; }
  streams.push(registro);
}
const streamsAbertos = streams.filter((registro) => registro.status === 200).length;

await dormir(300);
await post('arena_start_round', { room_id: room.id });
const detalhe = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
const rodada = detalhe?.rounds?.find((entrada) => entrada.status === 'open');
if (!rodada) await falhar('nenhuma rodada aberta depois de arena_start_round');

// A leitura mais frequente da aula: o lobby do aluno.
const respostaLobby = await fetch(`${base}/api.php?action=arena_lobby`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(turma[0]),
});
const bytesLobby = (await respostaLobby.text()).length;

const tetoAntes = (await json('/readyz')).corpo.judge_budget;

// O pico de verdade de uma aula: a turma inteira envia no mesmo instante.
const latencias = [];
const envios = turma.map(async (aluno, indice) => {
  const inicio = Date.now();
  const resposta = await fetch(`${base}/api.php?action=arena_submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      participant_id: aluno.participant_id, token: aluno.token, round_id: rodada.id,
      prompt: `Cartaz A3 da feira de ciências, aluno ${indice + 1}, com data, local e contato.`,
      attempt: 1,
    }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  latencias.push(Date.now() - inicio);
  return {
    status: resposta.status,
    pendente: corpo.pending === true,
    ok: corpo.ok === true,
    // O motivo, não só o código: um 502 sem causa obriga a refazer a medição
    // inteira para descobrir o que o provedor disse.
    erro: corpo.ok === true ? null : (corpo.error || corpo.message || corpo.problems || null),
  };
});
const resultados = await Promise.all(envios);

const esperarConclusao = async (limiteMs = 120_000) => {
  const inicio = Date.now();
  let ultimo = 0;
  while (Date.now() - inicio < limiteMs) {
    const medida = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
    const alvo = medida?.rounds?.find((entrada) => entrada.id === rodada.id);
    ultimo = Number(alvo?.scored ?? 0);
    if (ultimo >= ALUNOS) return { avaliados: ultimo, rodadaFinal: alvo, ms: Date.now() - inicio };
    await dormir(250);
  }
  const medida = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
  const alvo = medida?.rounds?.find((entrada) => entrada.id === rodada.id);
  return { avaliados: Number(alvo?.scored ?? ultimo), rodadaFinal: alvo, ms: Date.now() - inicio };
};

// Num cenário de falha explícita não há nota para esperar: esperar o prazo
// cheio só faria a medição parecer um travamento.
const esperaNotas = !FALHA_PROVEDOR || MODO_JUIZ === 'gemini';
const conclusao = await esperarConclusao(esperaNotas ? 120_000 : 15_000);
const tetoDepois = (await json('/readyz')).corpo.judge_budget;

// A contagem de chamadas ao provedor tem de vir de onde ela existe:
// - provedor controlado: o próprio contador do endpoint local;
// - provedor real / alvo remoto: o `spent_last_hour` do /readyz, que o servidor
//   incrementa por AVALIAÇÃO (não por requisição HTTP). Uma virada de hora no
//   meio da medição deixa a diferença negativa; nesse caso vale o valor do
//   `spent_last_hour` de depois, que já é a hora nova.
const gastoDoTeto = (depois, antes) => {
  if (!depois) return null;
  const diferenca = Number(depois.spent_last_hour ?? 0) - Number(antes?.spent_last_hour ?? 0);
  return diferenca >= 0 ? diferenca : Number(depois.spent_last_hour ?? 0);
};
const local = !ALVO && PROVEDOR_MODO === 'controlado';
const chamadas = local ? provedor.chamadas : gastoDoTeto(tetoDepois, tetoAntes);

const falhas = resultados.filter((resultado) => !resultado.ok);
const procedencia = conclusao.rodadaFinal?.judge ?? null;
const bytesDosStreams = streams.map((registro) => registro.bytes);

const relatorio = {
  rotulo: ROTULO,
  alvo: base,
  instalacao: {
    perfil: prontidao.hosting,
    juiz: prontidao.judge,
    versao: prontidao.version ?? null,
    avisos: prontidao.warnings ?? [],
    tipo: ALVO ? 'instalacao_remota' : 'processo_local',
    // No alvo, quem escolhe o provedor é a instalação: chamar isto de "real"
    // sugeriria que o arnês apontou para o oficial, o que ele não fez.
    provedor: ALVO ? 'do_alvo' : (local ? 'controlado' : 'real'),
    endpoint_controlado: local,
    banco_em_arquivo: !ALVO,
    base_do_provedor: ALVO ? null : (local ? `http://127.0.0.1:${portaProvedor}/v1beta` : baseReal),
    preflight,
    submit_wait_ms: ESPERA_MS,
    concorrencia_do_teto: CONCORRENCIA > 0 ? CONCORRENCIA : tetoAntes?.concurrency ?? null,
  },
  alunos: ALUNOS,
  missoes: MISSOES,
  latencia_do_provedor_ms: local ? LATENCIA_PROVEDOR : null,
  modo_do_juiz: ALVO ? (prontidao.judge?.mode ?? null) : MODO_JUIZ,
  orcamento: TETO_CHAMADAS > 0
    ? { teto_de_chamadas_por_hora: TETO_CHAMADAS, gasto: chamadas, folga: TETO_CHAMADAS - (chamadas ?? 0) }
    : null,
  envios: resultados.length,
  pendentes: resultados.filter((resultado) => resultado.pendente).length,
  falhas: falhas.length,
  amostra_de_erro: falhas.length ? falhas[0] : null,
  status: [...new Set(resultados.map((resultado) => resultado.status))],
  envio_p50_ms: percentil(latencias, 0.5),
  envio_p95_ms: percentil(latencias, 0.95),
  envio_max_ms: Math.max(...latencias),
  conclusao_das_notas_ms: conclusao.ms,
  notas_gravadas: conclusao.avaliados,
  chamadas_ao_provedor: chamadas,
  fonte_das_chamadas: local ? 'contador_do_provedor_controlado' : 'judge_budget_spent_last_hour',
  chamadas_por_submissao: chamadas === null ? null : Number((chamadas / ALUNOS).toFixed(2)),
  provedor_pico_simultaneo: local ? provedor.pico : null,
  streams_abertos: streamsAbertos,
  stream_bytes_total: bytesDosStreams.reduce((soma, valor) => soma + valor, 0),
  stream_bytes_p50: percentil(bytesDosStreams, 0.5),
  eventos_sse: streams.reduce((soma, registro) => soma + registro.eventos, 0),
  bytes_lobby: bytesLobby,
  procedencia_das_notas: procedencia
    ? { total: procedencia.total, local: procedencia.local, provedor: procedencia.provider }
    : null,
  degradacao: FALHA_PROVEDOR
    ? {
      injecao: FALHA_PROVEDOR,
      falha_apenas_nas_primeiras: FALHA_VEZES > 0 ? FALHA_VEZES : null,
      modo_do_juiz: MODO_JUIZ,
      esperado: FALHA_VEZES > 0
        ? 'o provedor volta e a nota é dele: nenhuma nota local'
        : MODO_JUIZ === 'gemini' ? 'nota local silenciosa em todos os envios' : 'falha explicita: nenhuma nota',
      observado: { notas_gravadas: conclusao.avaliados, notas_locais: procedencia?.local ?? 0, envios_ok: resultados.filter((r) => r.ok).length },
    }
    : null,
  teto_antes: tetoAntes,
  teto_depois: tetoDepois,
  // No alvo remoto o arnês NÃO encerra nada: uma medição não pode derrubar a
  // instalação que ela está medindo.
  encerramento: ALVO ? { alvo: 'nao_encerrado_pelo_arnes' } : await encerrarFilho(),
};
if (process.env.CARGA_VERBOSE) {
  relatorio.provedor_trilha = provedor.trilha;
  relatorio.instalacao_log = saida.join('').split('\n').slice(-12);
}

for (const registro of streams) registro.cancelar?.();
limpar();

console.log(JSON.stringify(relatorio, null, 2));

// As checagens que fazem desta medição uma prova, e não um relatório de números.
const problemas = [];
// Transporte: vale nos dois cenários — o stream é o mesmo, com ou sem nota.
if (streamsAbertos !== ALUNOS) problemas.push(`${streamsAbertos}/${ALUNOS} streams abertos`);
if (chamadas === null) problemas.push('não foi possível medir as chamadas ao provedor (/readyz sem judge_budget)');
if (FALHA_PROVEDOR) {
  // Cenário de degradação: o que se prova NÃO é o caminho feliz, e sim a
  // diferença entre os dois modos quando o provedor recusa. Aqui, envio sem
  // sucesso é RESULTADO ESPERADO — reprovar a corrida por isso seria medir a
  // expectativa errada.
  const locais = procedencia?.local ?? 0;
  if (FALHA_VEZES > 0) {
    // Provedor que falha e volta: a nota tem de ser DELE, e a repetição tem de
    // aparecer como mais chamadas do que submissões.
    if (conclusao.avaliados !== ALUNOS) problemas.push(`notas gravadas ${conclusao.avaliados}/${ALUNOS}`);
    if (locais !== 0) problemas.push(`o provedor voltou, mas ${locais} nota(s) vieram do juiz local`);
    if (chamadas <= ALUNOS) problemas.push(`${chamadas} chamadas para ${ALUNOS} envios: a repetição não aconteceu`);
    if (falhas.length) problemas.push(`${falhas.length} envio(s) falharam mesmo com o provedor de volta`);
  } else if (MODO_JUIZ === 'gemini') {
    if (conclusao.avaliados !== ALUNOS) problemas.push(`gemini deveria dar nota a todos (${conclusao.avaliados}/${ALUNOS})`);
    if (locais !== ALUNOS) problemas.push(`gemini deveria marcar ${ALUNOS} notas locais, marcou ${locais}`);
    if (falhas.length || relatorio.status.some((codigo) => codigo !== 200)) {
      problemas.push(`gemini promete nota mesmo com o provedor fora, mas houve falha: ${falhas.length} envio(s) ${JSON.stringify(relatorio.status)}`);
    }
  } else {
    if (conclusao.avaliados !== 0) problemas.push(`${MODO_JUIZ} deveria NÃO gravar nota, gravou ${conclusao.avaliados}`);
    if (falhas.length !== ALUNOS) problemas.push(`${MODO_JUIZ} deveria falhar de forma explícita nos ${ALUNOS} envios, falhou em ${falhas.length}`);
    if (locais !== 0) problemas.push(`${MODO_JUIZ} não pode registrar nota local: ${locais}`);
  }
  if (chamadas < ALUNOS) problemas.push(`${chamadas} chamadas registradas para ${ALUNOS} envios`);
} else {
  if (falhas.length) problemas.push(`${falhas.length} envio(s) sem sucesso`);
  if (relatorio.status.some((codigo) => codigo !== 200)) problemas.push(`status inesperado: ${relatorio.status.join(',')}`);
  if (conclusao.avaliados < ALUNOS) problemas.push(`notas gravadas ${conclusao.avaliados}/${ALUNOS}`);
  if (chamadas !== ALUNOS) problemas.push(`${chamadas} chamadas ao provedor para ${ALUNOS} envios (o esperado é uma por submissão)`);
  if (!procedencia || procedencia.local !== 0) problemas.push(`procedência com juiz local: ${JSON.stringify(procedencia)}`);
}
// O teto não é decorativo: a medição inteira tem de caber no orçamento declarado.
if (TETO_CHAMADAS > 0 && (chamadas ?? 0) > TETO_CHAMADAS) problemas.push(`orçamento estourado: ${chamadas} > ${TETO_CHAMADAS}`);
if (problemas.length) {
  console.error(`carga-http: ${problemas.join('; ')}`);
  process.exitCode = 1;
}
