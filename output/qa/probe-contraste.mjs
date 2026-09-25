// CONTRASTE MEDIDO — TV e aluno, nos estados que o plano de correção visual
// exige (a seção 6 pede contraste medido antes de afirmar legibilidade).
//
//   node output/qa/probe-contraste.mjs                    # grava em tmp/qa/contraste-<carimbo>
//   CONTRASTE_SAIDA=tmp/qa/contraste-antes node output/qa/probe-contraste.mjs
//   CONTRASTE_TELAS=tv-final node output/qa/probe-contraste.mjs   # um estado só
//   node output/qa/comparar-contraste.mjs tmp/qa/contraste-antes tmp/qa/contraste-depois
//
// O FUNDO VEM DE UM ANEL, E ISSO FOI APRENDIDO QUEBRANDO
//
// A primeira versão tirava o fundo da cor mais frequente dentro do retângulo do
// elemento. Está errado, e o erro é grande: em texto grande e pesado o glifo
// cobre mais da metade da caixa, então a cor mais frequente é a TINTA. O sinal
// disso é inconfundível — a razão dá exatamente 1,00 e o "fundo" medido é igual
// à cor declarada do texto. Foi assim que "Batalha encerrada!" (branco sobre o
// azul escuro da TV) apareceu como branco sobre branco.
//
// Agora o fundo sai do ANEL: uma faixa fina fora do retângulo do glifo, limitada
// ao retângulo do elemento pai. Ali não há tinta nenhuma — é a superfície que o
// texto de fato tem atrás, seja o padding do cartão, seja o vão entre linhas.
//
// TRÊS NÚMEROS, PORQUE CADA UM DIZ UMA COISA
//
//   razaoReal    = tinta DECLARADA (composta com o alfa sobre o fundo medido)
//                  contra o fundo do ANEL            <- decide o AA (é a WCAG)
//   razaoPintada = cor de maior contraste que existe DENTRO da caixa do texto
//                  contra o fundo do anel            <- é o que o olho recebe
//   confere      = a cor declarada aparece entre os pixels da caixa?
//
// `razaoReal` alto com `razaoPintada` baixo é defeito que só o pixel pega: o CSS
// promete contraste e uma camada no meio (opacity, sobreposição) come a diferença.
// `confere: false` é outra coisa — é a dúvida do instrumento, declarada: texto
// fino pode não ter nenhum pixel de cor cheia, e aí quem lê precisa saber que
// aquele número pede olho humano.
//
// Limite: 4,5 em texto normal, 3,0 em texto grande (≥24 px, ou ≥18,66 px em
// negrito) e 3,0 em indicador gráfico, que é a regra de 1.4.11 da AA.
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createServer } from 'node:http';

import { abrirNavegador, abrirPagina, carregar, esperarPor } from '../../test/support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pasta = process.env.CONTRASTE_SAIDA
  || `tmp/qa/contraste-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
mkdirSync(pasta, { recursive: true });

// --- o servidor de verdade, banco em memória ---------------------------------
const SENHA = 'browser-test-password';
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const servidor = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  adminPassword: SENHA,
  adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${servidor.address().port}`;

const login = await fetch(`${base}/api.php?action=admin_login`, {
  method: 'POST', body: JSON.stringify({ password: SENHA }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const cookieNome = cookie.split('=')[0];
const cookieValor = cookie.slice(cookieNome.length + 1);

const post = async (action, payload = {}, comCookie = true) => {
  const res = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(comCookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action}: ${res.status} ${JSON.stringify(body.details || body.error || body)}`);
  return body;
};

// --- fixture -----------------------------------------------------------------
// Duas salas: uma de missão (alimenta as prévias do aluno e da TV, com dados de
// amostra) e uma no modo Arena, porque só ela produz o cartão de VOTAÇÃO — um
// dos estados que o plano manda provar e que nunca teve captura válida.
const CRITERIOS = [
  { criterion: 'objetivo', weight: 25 }, { criterion: 'contexto', weight: 25 },
  { criterion: 'formato', weight: 25 }, { criterion: 'publico', weight: 25 },
];
const criarDesafio = async (payload) =>
  (await post('arena_save_challenge', { criteria: CRITERIOS, ...payload })).challenge;

await post('arena_set_open', { open: true });

const salaMissao = (await post('arena_create_room', {
  title: 'QA CONTRASTE', preset: 'personalizado', expected_players: 6,
})).room;
const desafioTexto = await criarDesafio({
  title: 'Cartaz da feira', modality: 'precisao', category: 'Texto',
  mission: 'Escreva um prompt para o cartaz da feira de ciências, com data, local e chamada para ação.',
  context: 'Feira da escola, público de familiares.',
  reference_text: 'Cartaz A3 com data, local e chamada para ação.',
});
const desafioImagem = await criarDesafio({
  title: 'Reversa: aquário profundo', modality: 'reversa', category: 'Imagem',
  mission: 'Escreva o prompt que produziu esta imagem.',
  reference_text: 'Biblioteca submersa com luz azul.',
  reference_image: '/public/assets/figma/challenge-underwater-library.webp',
});
for (const desafio of [desafioTexto, desafioImagem]) {
  await post('arena_add_round', { room_id: salaMissao.id, challenge_id: desafio.id });
}
await post('arena_publish_room', { room_id: salaMissao.id });

const salaArena = (await post('arena_create_room', {
  title: 'QA CONTRASTE ARENA', preset: 'arena', expected_players: 40,
  arena_rounds: 3, arena_boss_health: 3, arena_damage_threshold: 60,
  arena_attacks_per_round: 2, arena_teams: true,
})).room;
const desafioArena = await criarDesafio({
  title: 'Post do lançamento', modality: 'precisao', category: 'Texto',
  mission: 'Escreva o prompt do post de lançamento do clube de robótica.',
  reference_text: 'Post com data, local e chamada para ação.',
});
await post('arena_add_round', { room_id: salaArena.id, challenge_id: desafioArena.id });
await post('arena_publish_room', { room_id: salaArena.id });

const NOMES = ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabio'];
const roster = [];
for (const nome of NOMES) {
  const entrou = await post('arena_join', { code: salaArena.pin || salaArena.code, name: nome }, false);
  roster.push({ ...entrou.participant, token: entrou.token });
}
await post('arena_start_round', { room_id: salaArena.id });
const detalhe = (await post('arena_room_detail', { room_id: salaArena.id })).detail;
const rodadaAberta = detalhe.rounds.find((entry) => entry.status === 'open').id;
for (const [indice, participante] of roster.entries()) {
  await post('arena_submit', {
    participant_id: participante.id, token: participante.token, round_id: rodadaAberta,
    prompt: `Prompt do aluno ${indice + 1}: cartaz com objetivo, contexto, público, formato e restrições bem definidos.`,
  }, false);
}
await post('arena_end_round', { room_id: salaArena.id });
await sleep(400);
await post('arena_mode_draw', { room_id: salaArena.id, wildcard: true });
const arena = (await post('arena_room_detail', { room_id: salaArena.id })).detail.arena;
if (arena?.phase !== 'wildcard') throw new Error(`a sala Arena não entrou em Wild Card (fase ${arena?.phase})`);
const noWildcard = new Set((arena.wildcard?.options || []).map((o) => String(o.participant_id)));
const votante = roster.find((p) => !noWildcard.has(String(p.id)));
if (!votante) throw new Error('todos os participantes estão no Wild Card: ninguém vê o cartão de votação');
// O campo da sala é `code` (o `pin` existe mas vem nulo no objeto da API) — daí o
// `||` em todo lugar: foi um `pin` nulo que já produziu um `/tv.php?pin=null`.
const codigoDe = (sala) => sala.pin || sala.code;

// A TV de verdade só abre com sessão de projeção (cookie HttpOnly de 8h). Sem
// ela, `/tv.php?pin=...` cai na tela de código curto — e foi exatamente isso que
// fez o estado de votação da TV parecer inexistente na primeira tentativa.
const respostaTv = await fetch(`${base}/api.php?action=arena_tv_token`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ room_id: salaArena.id }),
});
const tvCookies = respostaTv.headers.getSetCookie ? respostaTv.headers.getSetCookie() : [];
const cookieTv = tvCookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('arena_tv_session='));
if (!cookieTv) throw new Error('o servidor não emitiu a sessão de projeção (arena_tv_token)');
console.log(`fixture pronta — sala ${codigoDe(salaMissao)} (missões) e ${codigoDe(salaArena)} (Arena: Wild Card com ${arena.wildcard.options.length} opções; votante ${votante.name}; sessão de TV emitida)`);

// --- PNG: decodificar o print e ter os pixels de verdade ---------------------
function decodificarPng(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('não é PNG');
  let offset = 8;
  let ihdr = null;
  const dados = [];
  while (offset + 8 <= buffer.length) {
    const tamanho = buffer.readUInt32BE(offset);
    const tipo = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const conteudo = buffer.subarray(offset + 8, offset + 8 + tamanho);
    if (tipo === 'IHDR') {
      ihdr = {
        largura: conteudo.readUInt32BE(0), altura: conteudo.readUInt32BE(4),
        bits: conteudo[8], cor: conteudo[9], interlace: conteudo[12],
      };
    } else if (tipo === 'IDAT') dados.push(conteudo);
    else if (tipo === 'IEND') break;
    offset += 12 + tamanho;
  }
  if (!ihdr) throw new Error('PNG sem IHDR');
  if (ihdr.bits !== 8 || ihdr.interlace !== 0) {
    throw new Error(`PNG inesperado: ${ihdr.bits} bits, interlace ${ihdr.interlace}`);
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.cor];
  if (!bpp) throw new Error(`PNG com color type ${ihdr.cor}`);
  const linhaBytes = ihdr.largura * bpp;
  const bruto = inflateSync(Buffer.concat(dados));
  const pixels = Buffer.alloc(ihdr.altura * linhaBytes);
  let pos = 0;
  for (let y = 0; y < ihdr.altura; y += 1) {
    const filtro = bruto[pos];
    pos += 1;
    const linha = bruto.subarray(pos, pos + linhaBytes);
    pos += linhaBytes;
    const anterior = y ? pixels.subarray((y - 1) * linhaBytes, y * linhaBytes) : null;
    const destino = pixels.subarray(y * linhaBytes, (y + 1) * linhaBytes);
    for (let x = 0; x < linhaBytes; x += 1) {
      const a = x >= bpp ? destino[x - bpp] : 0;
      const b = anterior ? anterior[x] : 0;
      const c = anterior && x >= bpp ? anterior[x - bpp] : 0;
      const v = linha[x];
      let valor;
      if (filtro === 0) valor = v;
      else if (filtro === 1) valor = v + a;
      else if (filtro === 2) valor = v + b;
      else if (filtro === 3) valor = v + ((a + b) >> 1);
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        valor = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`filtro PNG ${filtro}`);
      destino[x] = valor & 0xff;
    }
  }
  return { ...ihdr, bpp, linhaBytes, pixels };
}

// --- cor ---------------------------------------------------------------------
const luminancia = ([r, g, b]) => {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};
const razao = (a, b) => {
  const la = luminancia(a); const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** Lê `rgb()`/`rgba()` — devolve a cor e o alfa, sem inventar o que não existe. */
const lerCor = (texto) => {
  const m = /rgba?\(([^)]+)\)/.exec(texto || '');
  if (!m) return null;
  const partes = m[1].split(',').map((v) => parseFloat(v));
  return { rgb: partes.slice(0, 3).map((v) => Math.round(v)), alfa: partes.length > 3 ? partes[3] : 1 };
};
/** A cor que a tela mostra quando uma tinta com alfa cai sobre o fundo. */
const compor = (tinta, fundo) => tinta.rgb.map((v, i) => Math.round(v * tinta.alfa + fundo[i] * (1 - tinta.alfa)));
const distancia = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const comoRgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

/** Histograma de uma lista de retângulos, em cores exatas. */
function histograma(imagem, retangulos) {
  const contagem = new Map();
  let total = 0;
  for (const caixa of retangulos) {
    const x0 = Math.max(0, Math.floor(caixa.x));
    const y0 = Math.max(0, Math.floor(caixa.y));
    const x1 = Math.min(imagem.largura, Math.ceil(caixa.x + caixa.w));
    const y1 = Math.min(imagem.altura, Math.ceil(caixa.y + caixa.h));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = y * imagem.linhaBytes + x * imagem.bpp;
        const chave = (imagem.pixels[i] << 16) | (imagem.pixels[i + 1] << 8) | imagem.pixels[i + 2];
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
        total += 1;
      }
    }
  }
  return { contagem, total };
}

/**
 * O fundo do anel: a cor que domina a faixa fora dos glifos, com a fração dela
 * (é a fração que diz se o lugar é liso ou se tem imagem/gradiente por baixo).
 */
function fundoDoAnel(imagem, anel) {
  const { contagem, total } = histograma(imagem, anel);
  if (!total) return null;
  const cores = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  const [chave, quantidade] = cores[0];
  return {
    rgb: [(chave >> 16) & 0xff, (chave >> 8) & 0xff, chave & 0xff],
    fracao: quantidade / total, cores: cores.length, pixels: total,
    // As cores que ainda pesam no anel, para medir o PIOR caso de um fundo que
    // varia (gradiente, brilho, imagem): a AA vale contra o pedaço de fundo que
    // está atrás da letra, e num degradê esse pedaço é o que menos contrasta.
    candidatas: cores
      .filter(([, q]) => q / total >= 0.02)
      .slice(0, 40)
      .map(([c]) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]),
  };
}

/**
 * O fundo que o texto de fato tem atrás: se o próprio elemento pinta uma cor,
 * ela é o fundo (é o caso de selo, pílula e botão — o anel mediria a faixa em
 * volta, que é outra superfície). Fundo próprio translúcido é composto com o
 * anel em vez de ignorado.
 */
function fundoDoElemento(proprio, anelRgb) {
  if (!proprio) return anelRgb;
  if (proprio.alfa >= 0.9) return proprio.rgb;
  return compor(proprio, anelRgb);
}

/**
 * A tinta que a tela realmente mostra: entre as cores que aparecem na caixa do
 * texto com peso mínimo (o miolo do glifo), a que mais contrasta com o fundo.
 */
function coresFrequentes(imagem, caixa) {
  const { contagem, total } = histograma(imagem, [caixa]);
  if (!total) return null;
  const piso = Math.max(3, Math.ceil(total * 0.004));
  const frequentes = [...contagem.entries()]
    .filter(([, quantidade]) => quantidade >= piso)
    .sort((a, b) => b[1] - a[1])
    .map(([chave]) => [(chave >> 16) & 0xff, (chave >> 8) & 0xff, chave & 0xff]);
  return { frequentes, cores: contagem.size, pixels: total };
}

/** A tinta pintada: entre as cores frequentes da caixa, a que mais contrasta. */
function tintaPintada(frequentes, fundoRgb) {
  let melhor = { razao: 0, rgb: fundoRgb };
  for (const rgb of frequentes) {
    const valor = razao(rgb, fundoRgb);
    if (valor > melhor.razao) melhor = { razao: valor, rgb };
  }
  return melhor;
}

// --- o que olhar em cada tela ------------------------------------------------
// Texto: todo elemento com um nó de texto visível. Indicador: seletores
// nomeados, porque forma sem texto também informa (1.4.11 da AA).
const INDICADORES = [
  '.arena-mode-hearts span',
  '[data-arena-energy-fill]',
  '.arena-mode-energy-track',
  '.arena-timer',
  '.arena-round-count',
  '.arena-mission-badge',
  '.arena-attempts span',
  '.arena-tv-countdown',
  '.arena-tv-pin strong',
  '.arena-tv-rank-list li',
  '.arena-tv-champion',
  '.arena-mode-vote-choice',
  '.arena-mode-confidence-options button',
];

const COLETAR = (indicadores) => {
  const lerCorLocal = (texto) => {
    const m = /rgba?\(([^)]+)\)/.exec(texto || '');
    if (!m) return null;
    const partes = m[1].split(',').map((v) => parseFloat(v));
    return {
      rgb: partes.slice(0, 3).map((v) => Math.round(v)),
      alfa: partes.length > 3 ? partes[3] : 1,
    };
  };
  const opaca = (texto) => {
    const cor = lerCorLocal(texto);
    return cor && cor.alfa >= 0.9 ? cor.rgb : null;
  };
  /**
   * Visível de verdade, não só "tem caixa".
   *
   * O Chrome implementa `<details>` fechado com `content-visibility: hidden`: o
   * conteúdo continua com LAYOUT (retângulo com largura e altura) e não é
   * PINTADO. Uma checagem por retângulo aceita esse conteúdo, e a medição acaba
   * lendo os pixels de outra coisa que ocupa o mesmo lugar — foi assim que o PIN
   * da prévia (dentro da dobra fechada) apareceu como cinza sobre azul, com a
   * caixa caindo em cima do selo azul do cabeçalho.
   */
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (typeof el.checkVisibility === 'function'
      && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) {
      return false;
    }
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    return true;
  };
  const descritor = (el) => {
    const partes = [el.tagName.toLowerCase()];
    if (el.id) partes.push(`#${el.id}`);
    const classes = [...el.classList].slice(0, 3);
    if (classes.length) partes.push(`.${classes.join('.')}`);
    for (const attr of ['data-tv-heading', 'data-tv-text', 'data-tv-countdown', 'data-arena-mission-title', 'data-arena-vote-question', 'data-arena-vote-intro', 'data-arena-vote-status', 'data-arena-feedback', 'data-arena-result-percent', 'data-arena-empty-title', 'data-arena-ranking']) {
      if (el.hasAttribute(attr)) partes.push(`[${attr}]`);
    }
    return partes.join('');
  };
  const caminho = (el) => {
    const passos = [];
    let no = el;
    while (no && no !== document.documentElement) {
      let passo = no.tagName.toLowerCase();
      const pai = no.parentElement;
      if (pai) {
        const iguais = [...pai.children].filter((c) => c.tagName === no.tagName);
        if (iguais.length > 1) passo += `:nth-of-type(${iguais.indexOf(no) + 1})`;
      }
      passos.unshift(passo);
      no = no.parentElement;
    }
    return passos.join('>');
  };
  const caixaDe = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  };
  /**
   * O anel de fundo: quatro faixas fora do retângulo do glifo (acima, abaixo, à
   * esquerda e à direita), recortadas pelo retângulo do pai — para não medir o
   * fundo de outro cartão nem a imagem vizinha.
   */
  const anelDe = (el, caixa) => {
    const pai = el.parentElement?.getBoundingClientRect();
    const limite = pai
      ? { x: pai.left + window.scrollX, y: pai.top + window.scrollY, w: pai.width, h: pai.height }
      : { x: 0, y: 0, w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
    const margem = Math.min(10, Math.max(3, caixa.h * 0.3));
    const esquerda = Math.max(limite.x, caixa.x - margem);
    const direita = Math.min(limite.x + limite.w, caixa.x + caixa.w + margem);
    const topo = Math.max(limite.y, caixa.y - margem);
    const base = Math.min(limite.y + limite.h, caixa.y + caixa.h + margem);
    return [
      { x: esquerda, y: topo, w: direita - esquerda, h: Math.max(0, caixa.y - topo) },
      { x: esquerda, y: caixa.y + caixa.h, w: direita - esquerda, h: Math.max(0, base - (caixa.y + caixa.h)) },
      { x: esquerda, y: caixa.y, w: Math.max(0, caixa.x - esquerda), h: caixa.h },
      { x: caixa.x + caixa.w, y: caixa.y, w: Math.max(0, direita - (caixa.x + caixa.w)), h: caixa.h },
    ].filter((faixa) => faixa.w > 0 && faixa.h > 0);
  };
  /**
   * A que elemento pertence o centro do retângulo? É a conferência de mapeamento:
   * se não for o próprio (nem um descendente), a caixa não descreve o elemento.
   */
  const noPonto = (el, caixa) => {
    const alvo = document.elementFromPoint(caixa.x - window.scrollX + caixa.w / 2, caixa.y - window.scrollY + caixa.h / 2);
    if (!alvo) return null;
    const curto = (no) => `${no.tagName.toLowerCase()}${no.classList.length ? `.${[...no.classList].slice(0, 2).join('.')}` : ''}`;
    if (alvo === el || el.contains(alvo)) return alvo === el ? curto(alvo) : `${curto(alvo)} (dentro)`;
    if (alvo.contains(el)) return `ANCESTRAL ${curto(alvo)}`;
    return `OUTRO ${curto(alvo)}`;
  };

  const vistos = new Set();
  const entradas = [];
  const anda = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (anda.nextNode()) {
    const no = anda.currentNode;
    const texto = no.nodeValue.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const el = no.parentElement;
    if (!el || vistos.has(el) || !visivel(el)) continue;
    vistos.add(el);      const s = getComputedStyle(el);
    const caixa = caixaDe(el);
    entradas.push({
      tipo: 'texto',
      previa: Boolean(el.closest('[data-arena-preview-bar],[data-tv-preview-bar]')),
      seletor: descritor(el),
      caminho: caminho(el),
      texto: texto.slice(0, 70),
      fontPx: Math.round(parseFloat(s.fontSize) * 10) / 10,
      peso: Number(s.fontWeight) || 400,
      corDeclarada: s.color,
      // O fundo do próprio elemento, quando ele pinta um (selo, pílula, botão).
      fundoProprio: lerCorLocal(s.backgroundColor),
      // A cadeia de fundos até a raiz: quando o anel mede uma cor que nenhum
      // ancestral declara, é sinal de que a caixa pegou outro elemento (um selo
      // azul vizinho, por exemplo) e a linha precisa ser olhada antes de virar
      // reprovação.
      cadeiaDeFundo: (() => {
        const passos = [];
        let no = el.parentElement;
        while (no && passos.length < 6) {
          const cor = getComputedStyle(no).backgroundColor;
          const lida = lerCorLocal(cor);
          if (lida && lida.alfa > 0) passos.push(`${descritor(no)}=${cor.replace(/\s+/g, '')}`);
          no = no.parentElement;
        }
        return passos;
      })(),
      temGradiente: s.backgroundImage && s.backgroundImage !== 'none',
      // Imagem dentro do elemento (medalha, avatar, ícone): os pixels da caixa
      // deixam de servir como candidatos a fundo — na primeira medição da lista
      // do ranking, a medalha de prata escolheu o fundo no lugar do painel e
      // inventou uma reprovação de 1,3 no texto branco.
      temImagem: Boolean(el.querySelector('img,svg,canvas,video')),
      caixa,
      anel: anelDe(el, caixa),
      noPonto: noPonto(el, caixa),
    });
  }

  for (const seletor of indicadores) {
    for (const el of document.querySelectorAll(seletor)) {
      if (!visivel(el)) continue;
      const s = getComputedStyle(el);
      const preenchimento = opaca(s.backgroundColor)
        ? s.backgroundColor
        : (s.fill && s.fill !== 'none' ? s.fill : null);
      const caixa = caixaDe(el);
      const texto = (el.textContent || '').replace(/\s+/g, ' ').trim();
      // Contêiner: o `textContent` junta o texto dos filhos, mas quem pinta a letra
      // é o filho, com corpo e peso próprios. Medir o contêiner com o `font-size`
      // herdado dele inventou reprovação na linha do campeão da TV (16px/400 num
      // `<li>` cujo texto real é 24px/700 e 26px/800, medidos à parte).
      const textoProprio = [...el.childNodes]
        .some((no) => no.nodeType === 3 && no.nodeValue.replace(/\s+/g, '').length > 0);
      entradas.push({
        tipo: texto ? (textoProprio ? 'indicador' : 'contêiner') : 'grafico',
        previa: Boolean(el.closest('[data-arena-preview-bar],[data-tv-preview-bar]')),
        seletor: descritor(el),
        caminho: `${seletor} :: ${caminho(el)}`,
        texto: texto.slice(0, 40),
        fontPx: Math.round(parseFloat(s.fontSize) * 10) / 10,
        peso: Number(s.fontWeight) || 400,
        corDeclarada: s.color,
        proprio: preenchimento,
        fundoProprio: lerCorLocal(s.backgroundColor),
        temGradiente: s.backgroundImage && s.backgroundImage !== 'none',
        temImagem: Boolean(el.querySelector('img,svg,canvas,video')),
        caixa,
        anel: anelDe(el, caixa),
        noPonto: noPonto(el, caixa),
      });
    }
  }
  return {
    altura: document.documentElement.scrollHeight,
    larguraJanela: window.innerWidth,
    alturaJanela: window.innerHeight,
    entradas,
    estado: document.querySelector('[data-tv-content]')?.className.match(/is-\w+/)?.[0]
      || document.querySelector('[data-arena-screen].is-active')?.dataset.arenaScreen
      || '?',
  };
};

const limite = (fontPx, peso, tipo) => {
  if (tipo === 'grafico') return 3.0;
  if (tipo === 'indicador' && fontPx < 1) return 3.0;
  const grande = fontPx >= 24 || (peso >= 700 && fontPx >= 18.66);
  return grande ? 3.0 : 4.5;
};

// --- os estados que interessam ----------------------------------------------
const TELAS = [
  {
    nome: 'aluno-entrada', largura: 390, altura: 844, url: '/play',
    espera: () => document.querySelector('[data-arena-screen="join"].is-active'),
  },
  {
    nome: 'aluno-entrada-desktop', largura: 1440, altura: 900, url: '/play',
    espera: () => document.querySelector('[data-arena-screen="join"].is-active'),
  },
  {
    // Por que 1400 de altura e não os 844 do plano: a casca do aluno mede
    // `100svh` e rola POR DENTRO. Numa janela do tamanho do celular o campo de
    // resposta e o botão de enviar ficam abaixo da dobra — e o que está abaixo da
    // dobra não é pintado, logo não tem contraste para medir. Janela mais alta na
    // MESMA largura pinta o cartão inteiro de uma vez. A largura é o que decide
    // layout e tipografia; a altura aqui só decide o quanto está à vista.
    nome: 'aluno-missao', largura: 390, altura: 1400, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'missao',
  },
  {
    nome: 'aluno-missao-desktop', largura: 1440, altura: 1100, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'missao',
  },
  {
    // O botão de enviar da prévia nasce DESABILITADO (a sala não está em rodada),
    // e desabilitado ele é o único jeito de medir "Matar o botão apagado": o
    // contraste da tinta habilitada — que é a que o aluno usa de verdade —
    // precisa de um número próprio. Habilitar o botão no DOM não desenha outro
    // botão: usa a MESMA regra, sem a camada de opacidade.
    nome: 'aluno-missao-habilitado', largura: 390, altura: 1400, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'missao',
    preparo: () => {
      document.querySelectorAll('.arena-submit').forEach((botao) => { botao.disabled = false; });
    },
  },
  {
    // O atalho de teclado dentro do botão só existe a partir de 640px: medir a
    // tinta dele pede a janela larga, e pede o botão habilitado.
    nome: 'aluno-missao-desktop-habilitado', largura: 1440, altura: 1100, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'missao',
    preparo: () => {
      document.querySelectorAll('.arena-submit').forEach((botao) => { botao.disabled = false; });
    },
  },
  {
    nome: 'aluno-resultado', largura: 390, altura: 1400, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'resultado',
  },
  {
    nome: 'aluno-fim', largura: 390, altura: 1400, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'fim',
  },
  {
    nome: 'aluno-fim-desktop', largura: 1440, altura: 1100, url: `/aluno-preview.php?room=${salaMissao.id}`, admin: true, modo: 'fim',
  },
  {
    nome: 'aluno-votacao', largura: 390, altura: 1400, url: '/play', sessao: votante,
    espera: () => {
      const cartao = document.querySelector('[data-arena-mode-vote]');
      return Boolean(cartao) && !cartao.hidden && cartao.querySelectorAll('[data-arena-vote-choice]').length > 0;
    },
  },
  {
    nome: 'tv-espera', largura: 1920, altura: 1080, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'lobby',
  },
  {
    nome: 'tv-espera-720', largura: 1280, altura: 720, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'lobby',
  },
  {
    nome: 'tv-rodada', largura: 1920, altura: 1080, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'round',
  },
  {
    nome: 'tv-rodada-720', largura: 1280, altura: 720, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'round',
  },
  {
    nome: 'tv-votacao', largura: 1920, altura: 1080, url: `/tv.php?pin=${codigoDe(salaArena)}`, cookieTv,
    espera: () => {
      const conteudo = document.querySelector('[data-tv-content]');
      return Boolean(conteudo) && /wild card/i.test(conteudo.textContent || '');
    },
  },
  {
    nome: 'tv-resultado', largura: 1920, altura: 1080, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'results',
  },
  {
    nome: 'tv-resultado-720', largura: 1280, altura: 720, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'results',
  },
  {
    nome: 'tv-final', largura: 1920, altura: 1080, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'final',
  },
  {
    nome: 'tv-final-720', largura: 1280, altura: 720, url: `/tv-preview.php?room=${salaMissao.id}`, admin: true, modoTv: 'final',
  },
];

const navegador = await abrirNavegador();
const medidas = [];
const problemas = [];
// Filtro para iterar rápido num estado só: CONTRASTE_TELAS=tv-final,tv-espera
const filtro = (process.env.CONTRASTE_TELAS || '').split(',').map((v) => v.trim()).filter(Boolean);
const telas = filtro.length ? TELAS.filter((t) => filtro.includes(t.nome)) : TELAS;
if (!telas.length) throw new Error(`CONTRASTE_TELAS não casou com nenhuma tela: ${filtro.join(', ')}`);
try {
  for (const tela of telas) {
    const pagina = await abrirPagina(navegador, { viewport: { width: tela.largura, height: tela.altura } });
    pagina.on('pageerror', (erro) => problemas.push(`${tela.nome}: pageerror ${erro.message.slice(0, 120)}`));
    try {
      if (tela.admin) {
        await pagina.setCookie({
          name: cookieNome, value: cookieValor, domain: '127.0.0.1', path: '/', httpOnly: true,
        });
      }
      if (tela.cookieTv) {
        await pagina.setCookie({
          name: tela.cookieTv.split('=')[0], value: tela.cookieTv.slice(tela.cookieTv.indexOf('=') + 1),
          domain: '127.0.0.1', path: '/', httpOnly: true,
        });
      }
      if (tela.sessao) {
        // A sessão do aluno vive no localStorage — é assim que o produto guarda.
        await carregar(pagina, `${base}/play`);
        await pagina.evaluate((sessao) => {
          localStorage.setItem('arena.participant_id', String(sessao.id));
          localStorage.setItem('arena.token', sessao.token);
        }, tela.sessao);
      }
      await carregar(pagina, `${base}${tela.url}`);
      if (tela.modo || tela.modoTv) {
        const atributo = tela.modo ? 'data-preview-mode' : 'data-tv-preview-mode';
        const escolhido = tela.modo || tela.modoTv;
        await esperarPor(pagina, (sel) => Boolean(document.querySelector(`[${sel}]`)), {
          descricao: `a barra de prévia de ${tela.nome}`, args: atributo,
        });
        await pagina.evaluate(([sel, modo]) => {
          document.querySelector(`[${sel}="${modo}"]`).click();
        }, [atributo, escolhido]);
        await esperarPor(pagina, ([sel, modo]) => {
          return document.querySelector(`[${sel}="${modo}"]`)?.classList.contains('is-current');
        }, { descricao: `o modo ${escolhido} em ${tela.nome}`, args: [atributo, escolhido] });
      }
      if (tela.espera) {
        await esperarPor(pagina, tela.espera, { descricao: `o estado de ${tela.nome}` });
      }
      if (tela.preparo) {
        await pagina.evaluate(tela.preparo);
        await sleep(250);
      }
      // Uma medição por posição de rolagem. A tela do aluno rola por dentro e o
      // que interessa (campo de resposta, botão de enviar, cartão de votação)
      // fica abaixo da dobra: medir só a primeira dobra deixaria de fora
      // justamente os controles que a pessoa usa.
      const medir = async (sufixo = '') => {
      const nome = sufixo ? `${tela.nome}-${sufixo}` : tela.nome;
      const coletado = await pagina.evaluate(COLETAR, INDICADORES);
      // Captura da JANELA, sempre, e nada além dela.
      //
      // A primeira versão capturava além da viewport quando a página era mais
      // alta. Nas telas do aluno isso mentiu: o conteúdo vive dentro de um
      // contêiner que rola por dentro (`overflow: hidden` na casca, rolagem no
      // miolo), então o que está abaixo da dobra não é pintado — a captura apenas
      // esticava a tela e o medidor lia pixels de uma região vazia. Agora o print
      // medido é o mesmo print guardado, e o que está fora da janela não vira
      // medição: vira "fora da janela", contado e declarado.
      const captura = await pagina.screenshot({ fullPage: false, captureBeyondViewport: false });
      // Depois do print, o retângulo de cada alvo é relido no DOM. Se ele andou, a
      // tela se redesenhou entre a coleta e a captura — e aí o pixel medido é de
      // outro lugar. Sem esta conferência, um estado que se atualiza sozinho
      // (o painel relê o servidor a cada ciclo) produziria reprovação fantasma.
      const depois = await pagina.evaluate((caminhos) => caminhos.map((caminho) => {
        const el = document.querySelector(caminho.includes(' :: ') ? caminho.split(' :: ')[1] : caminho);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY };
      }), coletado.entradas.map((e) => e.caminho));
      const imagem = decodificarPng(Buffer.from(captura));
      const linhas = [];
      let foraDaJanela = 0;
      for (const [indice, entrada] of coletado.entradas.entries()) {
        // Só o que está inteiro dentro da janela pode ser medido: o resto não foi
        // pintado neste print.
        if (entrada.caixa.y < 0 || entrada.caixa.x < 0
          || entrada.caixa.y + entrada.caixa.h > coletado.alturaJanela + 1
          || entrada.caixa.x + entrada.caixa.w > coletado.larguraJanela + 1) {
          foraDaJanela += 1;
          continue;
        }
        const anel = fundoDoAnel(imagem, entrada.anel);
        if (!anel) continue;
        // O fundo do texto: o próprio elemento quando ele pinta um, senão o anel.
        const coresDaCaixa = coresFrequentes(imagem, entrada.caixa);
        if (!coresDaCaixa) continue;
        const teto = limite(entrada.fontPx, entrada.peso, entrada.tipo);
        const declarada = lerCor(entrada.corDeclarada);
        // Num indicador gráfico a "tinta" é o preenchimento dele; num texto, a cor
        // do texto. Sem isso, uma barra de energia seria medida como texto.
        const tintaReal = entrada.tipo === 'grafico' && entrada.proprio
          ? lerCor(entrada.proprio)
          : declarada;
        const tintaComposta = tintaReal ? compor(tintaReal, anel.rgb) : null;
        // O fundo do texto, em ordem de precedência:
        //  1. o gradiente do PRÓPRIO elemento (botão com degradê: o branco da
        //     página não está atrás da letra, o degradê está);
        //  2. a cor opaca do próprio elemento (selo, pílula);
        //  3. o anel — a superfície em volta.
        // O caso 1 é o que mais engana: `background-color` transparente com
        // `background-image` de gradiente parecia "sem fundo próprio", e o texto
        // branco do botão era comparado com o branco do cartão.
        const fundoOpaco = Boolean(entrada.fundoProprio && entrada.fundoProprio.alfa >= 0.9);
        let fundo = fundoDoElemento(entrada.fundoProprio, anel.rgb);
        let fundoVeioDoGradiente = false;
        if (entrada.temGradiente && !entrada.temImagem && tintaComposta) {
          const interior = coresDaCaixa.frequentes.find((cor) => distancia(cor, tintaComposta) > 24);
          if (interior) { fundo = interior; fundoVeioDoGradiente = true; }
        }
        const pintada = tintaPintada(coresDaCaixa.frequentes, fundo);
        const razaoReal = tintaReal
          ? Math.round(razao(compor(tintaReal, fundo), fundo) * 100) / 100
          : null;
        // Candidatos a "pior fundo": do anel, quando o fundo é a superfície em
        // volta; do interior da caixa, quando o fundo é a pintura do elemento.
        // O que for a própria tinta sai da lista: a antialiasing pinta o glifo com
        // a cor da letra, e comparar a letra com ela mesma daria 1,00 — uma
        // reprovação inventada pela régua, não um defeito da tela.
        let candidatos = anel.candidatas.length ? anel.candidatas : [anel.rgb];
        if (tintaComposta && (fundoVeioDoGradiente || fundoOpaco)) {
          const doInterior = coresDaCaixa.frequentes.filter((cor) => distancia(cor, tintaComposta) > 24);
          candidatos = doInterior.length ? doInterior : [fundo];
        }
        // O PIOR do anel é informação, não veredito: o anel pode conter a tinta de
        // um irmão (a marca ao lado do nome, o ícone do selo) e aí o pior caso é a
        // cor de outro elemento, não o fundo desta letra. Quem decide é a cor
        // dominante da superfície atrás do texto — e fundo não-uniforme sai
        // marcado em `fundoLiso` para quem lê saber que o número é aproximado.
        const razaoPior = tintaComposta && candidatos.length
          ? Math.round(Math.min(...candidatos.map((cor) => razao(tintaComposta, cor))) * 100) / 100
          : null;
        const veredito = razaoReal;
        const depoisDaCaixa = depois[indice];
        const moveu = depoisDaCaixa
          ? Math.max(Math.abs(depoisDaCaixa.x - entrada.caixa.x), Math.abs(depoisDaCaixa.y - entrada.caixa.y))
          : null;
        // `null` é "o centro da caixa está fora da janela" (nada abaixo da dobra
        // responde a elementFromPoint): não é mapeamento errado, é conferência
        // indisponível — quem decide ali é a checagem de deslocamento.
        const caixaConfere = entrada.noPonto === null
          || (typeof entrada.noPonto === 'string' && !entrada.noPonto.startsWith('OUTRO'));
        const linha = {
          tela: nome, estado: coletado.estado, tipo: entrada.tipo, seletor: entrada.seletor,
          // A barra de prévia do professor é superfície administrativa: o plano
          // mede aluno e TV, e misturar as duas coisas num número só esconderia
          // qual das duas está pior.
          superficie: entrada.previa ? 'previa' : 'aluno/tv',
          caminho: entrada.caminho, texto: entrada.texto, fontPx: entrada.fontPx, peso: entrada.peso,
          corDeclarada: entrada.corDeclarada ? entrada.corDeclarada.replace(/\s+/g, '') : null,
          fundoAnel: comoRgb(anel.rgb),
          fundoUsado: comoRgb(fundo),
          fundoDoElemento: fundoOpaco,
          temGradiente: Boolean(entrada.temGradiente),
          fundoLiso: Math.round(anel.fracao * 1000) / 1000,
          tintaPintada: comoRgb(pintada.rgb),
          razaoPintada: Math.round(pintada.razao * 100) / 100,
          razaoReal,
          razaoPior,
          teto,
          passa: veredito === null ? true : veredito >= teto,
          caixa: {
            x: Math.round(entrada.caixa.x), y: Math.round(entrada.caixa.y),
            w: Math.round(entrada.caixa.w), h: Math.round(entrada.caixa.h),
          },
          cadeiaDeFundo: entrada.cadeiaDeFundo || [],
          noPonto: entrada.noPonto,
          caixaConfere,
          moveu,
          // A dúvida do instrumento, declarada: se o miolo do glifo não bate com a
          // cor que o CSS diz, esta linha precisa de olho humano.
          confere: declarada ? distancia(declarada.rgb, pintada.rgb) <= 24 : null,
        };
        if (entrada.tipo !== 'texto') {
          linha.corPropriaDeclarada = tintaReal
            ? comoRgb(tintaReal.rgb)
            : (entrada.proprio ? entrada.proprio.replace(/\s+/g, '') : null);
        }
        // Um fundo que não é liso (dominante < 25% do anel) pode ser o brilho do
        // próprio elemento — o `box-shadow` dourado da linha do campeão chega a
        // dominar o anel e pintar de ouro um fundo que, atrás da letra, é o painel
        // escuro. Nesses casos o número não decide sozinho: ele sai da conta e
        // vai para a lista de "a decidir", em vez de virar reprovação automática.
        if (!fundoVeioDoGradiente && anel.fracao < 0.25) {
          linha.confiancaBaixa = `fundo do anel não é liso (dominante ${Math.round(anel.fracao * 100)}%)`;
        }
        // Linha cuja caixa não aponta o elemento (ou que andou) não entra no
        // veredito: é falha de régua, não de tela.
        if (!caixaConfere) linha.suspeita = 'caixa não aponta o elemento';
        else if (moveu !== null && moveu > 2) linha.suspeita = `elemento andou ${moveu}px depois do print`;
        // Contêiner não tem veredito próprio: quem pinta o texto é o filho, que
        // entra na lista com o corpo e o peso dele. Sem isto, o mesmo texto seria
        // julgado duas vezes — uma delas com a régua errada.
        else if (entrada.tipo === 'contêiner') linha.suspeita = 'contêiner: quem pinta a letra é o filho (medido à parte)';
        linhas.push(linha);
      }
      medidas.push(...linhas);
      await pagina.screenshot({ path: `${pasta}/${nome}.png` });
      const validas = linhas.filter((l) => !l.suspeita);
      const falhas = validas.filter((l) => !l.passa).sort((a, b) => a.razaoPior - b.razaoPior);
      console.log(`${nome} (${tela.largura}×${tela.altura}, ${coletado.estado}): ${linhas.length} medidos`
        + ` (${linhas.length - validas.length} com régua suspeita, ${foraDaJanela} fora da janela), ${falhas.length} abaixo de AA`);
      for (const falha of falhas) {
        console.log(`   ✗ pior ${falha.razaoPior} (modo ${falha.razaoReal}) < ${falha.teto} · ${falha.tipo} · ${falha.seletor} · ${falha.fontPx}px/${falha.peso} · declarada ${falha.corDeclarada} · fundo ${falha.fundoUsado} · "${falha.texto}"`);
      }
      };

      // Primeira dobra, e depois cada ponto de interesse que a tela declara.
      await pagina.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
      await medir();
      for (const rolagem of (tela.rolagens || [])) {
        const achou = await pagina.evaluate((seletor) => {
          const alvo = document.querySelector(seletor);
          if (!alvo) return false;
          alvo.scrollIntoView({ block: 'center' });
          return true;
        }, rolagem.seletor);
        if (!achou) {
          problemas.push(`${tela.nome}: rolagem "${rolagem.nome}" não achou ${rolagem.seletor}`);
          continue;
        }
        await sleep(450);
        await medir(rolagem.nome);
      }
    } catch (erro) {
      problemas.push(`${tela.nome}: ${erro.message.split('\n')[0]}`);
      console.log(`${tela.nome}: FALHOU — ${erro.message.split('\n')[0]}`);
    } finally {
      await pagina.close();
    }
  }
} finally {
  await navegador.close();
  await new Promise((resolve) => servidor.close(resolve));
}

writeFileSync(`${pasta}/contraste.json`, JSON.stringify({ geradoEm: new Date().toISOString(), medidas }, null, 2));
const suspeitas = medidas.filter((l) => l.suspeita);
const validas = medidas.filter((l) => !l.suspeita && !l.confiancaBaixa);
const aDecidir = medidas.filter((l) => !l.suspeita && l.confiancaBaixa);
const falhas = validas.filter((l) => !l.passa).sort((a, b) => a.razaoPior - b.razaoPior);
// "Lavado" é outra coisa que reprovado: o CSS promete contraste e a tela não
// entrega, porque alguma camada no meio come a diferença.
const lavados = validas.filter((l) => l.confere === true && l.passa && l.razaoPintada < l.teto - 0.4);
const semConfianca = medidas.filter((l) => l.confere === false);
console.log(`\n=== ${medidas.length} medições em ${new Set(medidas.map((m) => m.tela)).size} telas — ${validas.length} válidas, ${aDecidir.length} a decidir, ${suspeitas.length} com régua suspeita, ${falhas.length} abaixo de AA ===`);
if (aDecidir.length) {
  console.log('\n--- a decidir (fundo não-uniforme: o número não decide sozinho) ---');
  for (const linha of aDecidir.slice(0, 20)) {
    console.log(`${linha.razaoReal} · ${linha.tela} · ${linha.seletor} · ${linha.confiancaBaixa} · "${linha.texto}"`);
  }
}
if (suspeitas.length) {
  console.log('\n--- régua suspeita (não entram no veredito) ---');
  for (const linha of suspeitas.slice(0, 15)) {
    console.log(`${linha.tela} · ${linha.seletor} · ${linha.suspeita} · no ponto: ${linha.noPonto} · "${linha.texto}"`);
  }
}
for (const falha of falhas) {
  console.log(`${falha.razaoPior.toFixed(2)} (modo ${falha.razaoReal}) < ${falha.teto} · ${falha.tela} · ${falha.tipo} · ${falha.seletor} · ${falha.fontPx}px/${falha.peso} · declarada ${falha.corDeclarada} · fundo ${falha.fundoUsado} · liso ${falha.fundoLiso} · "${falha.texto}"`);
}
if (lavados.length) {
  console.log(`\n=== ${lavados.length} com contraste declarado OK mas tinta lavada na tela (o CSS promete e o pixel não entrega) ===`);
  for (const linha of lavados) console.log(`${linha.tela} · ${linha.seletor} · real ${linha.razaoReal} × pintado ${linha.razaoPintada} · "${linha.texto}"`);
}
if (semConfianca.length) {
  console.log(`\n=== ${semConfianca.length} em que o miolo do glifo não bate com a cor declarada (texto fino: o número pede olho) ===`);
  for (const linha of semConfianca.slice(0, 25)) {
    console.log(`${linha.tela} · ${linha.seletor} · declarada ${linha.corDeclarada} · pintada ${linha.tintaPintada} · "${linha.texto}"`);
  }
}
if (problemas.length) {
  console.log(`\n=== ${problemas.length} problemas de carregamento ===`);
  for (const problema of problemas) console.log(problema);
}
console.log(`\nmedidas.json: ${pasta}/contraste.json`);
