// Contraste dos PARES DECLARADOS: regra que declara a cor do texto e o fundo
// onde ele é pintado, na mesma regra.
//
// Por que existe, e o que ele cobre que o resto não cobre:
//
// - `test/browser/css-render.test.mjs` e o retrato de estilo provam que a tela
//   NÃO mudou. Nenhum deles diz se o que está na tela é legível.
// - `output/qa/probe-contraste.mjs` mede o pixel pintado, e é a régua de verdade
//   — mas precisa de Chromium, de fixture e de estado vivo, então não roda no
//   CI a cada envio e não alcança `::before`/`::after` nem estado que a fixture
//   não abre.
// - A conferência que este módulo faz é de aritmética, não de pixel: serve
//   exatamente onde o pixel não chega — selos, pílulas e pseudo-elementos.
//
// O que ele NÃO vê, dito antes de qualquer número: imagem de fundo, texto
// pintado com gradiente (`background-clip: text`) e regra com `opacity`. Nesses
// casos o par vira `pulado`, com o motivo escrito, e o teste guarda a CONTAGEM
// por motivo num instantâneo versionado: um selo novo nessas condições não passa
// em silêncio, ele muda a contagem e obriga a olhar.
//
// CAMADAS DE TRÁS. Fundo translúcido e `transparent` deixaram de sair da conta: o
// par é composto contra quem pinta atrás, na ordem das camadas, sobre o branco do
// canvas. A pergunta que a régua faz é sempre a mesma — "onde este texto está
// pintado?" —, e a resposta tem duas qualidades, que o par carrega no campo
// `contexto`:
//
//   - `escrito`: a ancestralidade está escrita no seletor (`.lobby .codigo`), ou
//     a camada mais externa é opaca (o que está atrás não importa), ou não existe
//     nenhum provedor de fundo além do canvas. Aqui a aritmética é do que o
//     navegador pinta, e o par REPROVA se não passar no teto.
//   - `candidato`: o fundo é translúcido e o seletor não escreve onde o elemento
//     vive (`.ghost-link` aparece em cabeçalho claro e em barra escura). Nenhum
//     arquivo diz qual superfície é; a régua então mede sobre TODAS as superfícies
//     que o sistema declara e guarda a melhor e a pior. Reprova só se reprovar em
//     todas — se passa em alguma, quem decide é a tela, e o número fica à vista.
//
// Foi esta a brecha por onde o chip de modo `is-arena` chegou a 2,12 no topbar
// escuro da TV: sem camadas de trás, o par nem era medido. Com elas, ele aparece.
//
// TINTA SEM FUNDO NA PRÓPRIA REGRA. A cascata é por (media, seletor) — a `chave`
// —, e dentro de uma chave convivem várias regras: uma declara a cor, outra o
// fundo. O elemento pinta as duas, então o par existe, mas a régua exigia tinta
// E fundo no MESMO corpo de regra, e a que declara só a tinta saía da conta sem
// aparecer em lugar nenhum. Não é hipótese: seis pares com 5,91–17,49 ficaram
// órfãos quando as declarações de fundo que perdiam a cascata foram apagadas em
// 16/09, e nenhum portão avisou — o fundo que sobrou na chave mudou de folha, a
// tinta não se moveu.
//
// Agora a camada própria de uma regra é a da CHAVE quando o corpo da regra não
// declara fundo: quem pinta atrás já está resolvido ali, e a chave inteira é o
// mesmo conjunto de elementos. A regra que também não tem fundo na chave fica
// contada à parte, como família (`tinta sem fundo na chave`), em vez de sumir:
// essa é a população que nenhuma aritmética de camadas alcança por não existir
// declaração de fundo para compor — a próxima que a régua pode querer resolver.
//
// O piso da catraca continua contando só os pares de contexto `escrito`: a medida
// de um `candidato` é contra uma superfície escolhida entre várias, e comparar
// isso com o piso do sistema seria comparar coisas diferentes.
//
// Fundo com mais de uma cor declarada (gradiente) é conferido contra TODAS as
// paradas, e vale a pior: se todas passam, o texto passa onde ele cair. Se a
// pior não passa, quem decide é a posição do texto — geometria que não existe no
// arquivo —, então o par fica `pulado` com o número na frente, e não vira
// reprovação de uma tela que talvez esteja certa.
//
// Teto (WCAG 2.1 AA, 1.4.3): 4,5 para texto normal, 3,0 para texto grande —
// ≥24 px, ou ≥18,66 px a partir de 700. Quando o tamanho não está na própria
// regra, a régua adota o teto estrito (4,5) em vez de adivinhar herança: erra
// para o lado de pedir olho humano, nunca para o lado de perdoar.

import { analisarRegras, cascataDe, semCr } from './cascata-css.mjs';
import { compostosDe } from './classes-vivas.mjs';

const VALORES_INICIAIS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

const NOMEADAS = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  red: [255, 0, 0, 1],
  silver: [192, 192, 192, 1],
  gray: [128, 128, 128, 1],
  grey: [128, 128, 128, 1],
  navy: [0, 0, 128, 1],
  blue: [0, 0, 255, 1],
  yellow: [255, 255, 0, 1],
};

/** Declarações da regra como mapa, na ordem em que aparecem no arquivo. */
function propsDe(regra) {
  const props = new Map();
  for (const decl of regra.decls) {
    const corte = decl.indexOf(':');
    if (corte < 1) continue;
    props.set(decl.slice(0, corte).trim().toLowerCase(), decl.slice(corte + 1).trim());
  }
  return props;
}

const semImportante = (valor) => valor.replace(/\s*!important\s*$/i, '').trim();

const limitar = (n, min, max) => Math.min(max, Math.max(min, n));

function paraByte(numero, escala = 255) {
  if (typeof numero !== 'string') return numero;
  return numero.endsWith('%') ? (parseFloat(numero) / 100) * escala : parseFloat(numero);
}

function hslParaRgb(h, s, l) {
  const matiz = ((h % 360) + 360) % 360 / 360;
  const sat = limitar(s, 0, 1);
  const lum = limitar(l, 0, 1);
  if (sat === 0) {
    const cinza = Math.round(lum * 255);
    return [cinza, cinza, cinza];
  }
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const canal = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(canal(matiz + 1 / 3) * 255),
    Math.round(canal(matiz) * 255),
    Math.round(canal(matiz - 1 / 3) * 255),
  ];
}

/** Separa por vírgula (ou outro separador) no nível de topo, protegendo parênteses. */
function partirTopo(texto, separadores = ',') {
  const partes = [];
  let atual = '';
  let profundidade = 0;
  for (const c of texto) {
    if (c === '(') profundidade += 1;
    if (c === ')') profundidade -= 1;
    if (profundidade === 0 && separadores.includes(c)) {
      partes.push(atual);
      atual = '';
      continue;
    }
    atual += c;
  }
  partes.push(atual);
  return partes;
}

/** `var(--x)` / `var(--x, queda)` -> nome e queda, com parênteses no nível de topo. */
function partirVar(corpo) {
  const [nome, ...resto] = partirTopo(corpo);
  return { nome: (nome || '').trim(), queda: resto.join(',').trim() || null };
}

/**
 * Canais de uma função de cor.
 * Vírgula, barra e espaço separam igual (`rgb(1 2 3 / 50%)` = `rgba(1,2,3,.5)`),
 * e o alfa é o quarto token quando existe — sem depender de onde estava a barra.
 */
function canais(corpo) {
  return partirTopo(corpo, ',/')
    .flatMap((parte) => parte.trim().split(/\s+/))
    .filter(Boolean);
}

/**
 * Tokens `--x` declarados em `:root`/`html`. Um mesmo token redefinido é uma
 * lista de candidatos: a folha redefine a paleta herdada no próprio `:root`
 * (`--blue: #0052ff` e depois `--blue: var(--color-primary)`).
 */
export function tokensDe(folhas, { cascataDe } = {}) {
  const tokens = new Map();
  const guardar = (nome, valor) => {
    const limpo = semImportante(valor);
    if (!limpo || VALORES_INICIAIS.has(limpo.toLowerCase())) return;
    if (!tokens.has(nome)) tokens.set(nome, new Set());
    tokens.get(nome).add(limpo);
  };
  for (const folha of folhas) {
    for (const regra of analisarRegras(semCr(folha.texto))) {
      const seletor = regra.key.split('||')[1] || '';
      if (!/(^|[\s,(])(:root|html)(\s|$|,|:|\))/.test(seletor)) continue;
      for (const [prop, valor] of propsDe(regra)) if (prop.startsWith('--')) guardar(prop, valor);
    }
  }
  // Dentro de um `:root`, a última declaração vence — mas os candidatos ficam
  // guardados para o caso de o token ser redefinido em outro contexto.
  void cascataDe;
  return tokens;
}

/**
 * Cor declarada -> { ok, rgba } ou { ok: false, motivo }.
 * Resolve `var()` (inclusive aninhado e com queda) contra os tokens do projeto.
 */
export function interpretarCor(texto, tokens, profundidade = 0) {
  if (profundidade > 12) return { ok: false, motivo: 'var() circular' };
  const cru = semImportante(texto);
  const valor = cru.toLowerCase();

  if (!cru) return { ok: false, motivo: 'vazio' };
  if (VALORES_INICIAIS.has(valor)) return { ok: false, motivo: valor };
  if (valor === 'currentcolor') return { ok: false, motivo: 'currentColor' };
  if (valor === 'none' || valor === 'auto') return { ok: false, motivo: valor };
  if (NOMEADAS[valor]) return { ok: true, rgba: NOMEADAS[valor] };

  if (valor.startsWith('#')) {
    const hex = valor.slice(1);
    if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
      return { ok: false, motivo: `hex inválido (${cru})` };
    }
    const largo = hex.length <= 4
      ? [...hex].map((c) => c + c).join('')
      : hex;
    const n = (i) => parseInt(largo.slice(i, i + 2), 16);
    return {
      ok: true,
      rgba: [n(0), n(2), n(4), largo.length === 8 ? n(6) / 255 : 1],
    };
  }

  const funcao = valor.match(/^(rgba?|hsla?)\(([\s\S]*)\)$/);
  if (funcao) {
    const [, nome, corpo] = funcao;
    const partes = canais(corpo);
    if (partes.length < 3) return { ok: false, motivo: `${nome} incompleto (${cru})` };
    const [c1, c2, c3, c4] = partes;
    const alfa = c4 === undefined ? 1 : (c4.endsWith('%') ? parseFloat(c4) / 100 : parseFloat(c4));
    if (!Number.isFinite(alfa)) return { ok: false, motivo: `alfa ilegível (${cru})` };
    if (nome.startsWith('hsl')) {
      const numero = (x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x));
      const [h, s, l] = [parseFloat(c1), numero(c2), numero(c3)];
      if (![h, s, l].every(Number.isFinite)) return { ok: false, motivo: `hsl ilegível (${cru})` };
      return { ok: true, rgba: [...hslParaRgb(h, s, l), limitar(alfa, 0, 1)] };
    }
    const rgb = [c1, c2, c3].map(paraByte);
    if (rgb.some((c) => !Number.isFinite(c))) return { ok: false, motivo: `rgb ilegível (${cru})` };
    return { ok: true, rgba: [...rgb.map((c) => limitar(Math.round(c), 0, 255)), limitar(alfa, 0, 1)] };
  }

  if (valor.startsWith('var(')) {
    const { nome, queda } = partirVar(cru.slice(4, -1));
    const candidatos = tokens?.get(nome);
    if (!candidatos || candidatos.size === 0) {
      if (queda) return interpretarCor(queda, tokens, profundidade + 1);
      return { ok: false, motivo: `token ${nome} sem valor e sem queda` };
    }
    for (const candidato of candidatos) {
      const resolvido = interpretarCor(candidato, tokens, profundidade + 1);
      if (resolvido.ok) return resolvido;
    }
    return { ok: false, motivo: `token ${nome} não resolve` };
  }

  return { ok: false, motivo: `cor não reconhecida (${cru})` };
}

/** Composição de alfa: tinta por cima do fundo. */
export function compor(frente, atras) {
  const a = frente[3] ?? 1;
  return [
    Math.round(frente[0] * a + atras[0] * (1 - a)),
    Math.round(frente[1] * a + atras[1] * (1 - a)),
    Math.round(frente[2] * a + atras[2] * (1 - a)),
    1,
  ];
}

const linearizar = (canal) => {
  const s = canal / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminancia(cor) {
  const [r, g, b] = cor;
  return 0.2126 * linearizar(r) + 0.7152 * linearizar(g) + 0.0722 * linearizar(b);
}

/** Razão WCAG entre tinta e fundo. Aceita rgba e compõe o alfa da tinta. */
export function contraste(tinta, fundo) {
  const t = (tinta[3] ?? 1) < 1 ? compor(tinta, fundo) : tinta;
  const a = luminancia(t);
  const b = luminancia(fundo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Teto AA por corpo e peso. Sem tamanho conhecido, vale o teto estrito. */
export function tetoAA(px, peso) {
  if (!Number.isFinite(px)) return 4.5;
  if (px >= 24) return 3;
  if (px >= 18.66 && Number.isFinite(peso) && peso >= 700) return 3;
  return 4.5;
}

const REM = 16;

/**
 * Tamanho declarado -> px numérico quando dá para afirmar.
 * `em`, `%`, `vw` e parentes dependem do contexto (pai/viewport): devolvem
 * `null`, e a régua trata como desconhecido em vez de chutar.
 */
export function tamanhoEmPx(valor) {
  if (!valor) return null;
  const cru = semImportante(valor).toLowerCase();
  const clamp = cru.match(/^clamp\(([\s\S]*)\)$/);
  if (clamp) {
    const partes = clamp[1].split(',').map(tamanhoEmPx).filter((n) => Number.isFinite(n));
    if (!partes.length) return null;
    return Math.min(...partes);
  }
  const fixo = cru.match(/^([\d.]+)px$/);
  if (fixo) return parseFloat(fixo[1]);
  const rem = cru.match(/^([\d.]+)rem$/);
  if (rem) return parseFloat(rem[1]) * REM;
  return null;
}

/** Peso declarado -> numérico, ou null quando é relativo (`bolder`, `inherit`). */
export function pesoDe(valor) {
  if (!valor) return null;
  const cru = semImportante(valor).toLowerCase();
  if (cru === 'bold') return 700;
  if (cru === 'normal') return 400;
  const numero = parseInt(cru, 10);
  return Number.isFinite(numero) ? numero : null;
}

const PROPRIEDADE_DE_FUNDO = /^(background|background-color)$/;

/** A expressão de cor que abre uma parada de gradiente (`#fff 20%` -> `#fff`). */
function corDaParada(parada) {
  const bruto = parada.trim();
  if (!bruto) return null;
  if (bruto.startsWith('#')) return bruto.match(/^#[0-9a-fA-F]{3,8}/)?.[0] ?? null;
  const funcao = bruto.match(/^(rgba?|hsla?|var)\(/);
  if (funcao) {
    let profundidade = 0;
    for (let i = funcao[0].length - 1; i < bruto.length; i += 1) {
      if (bruto[i] === '(') profundidade += 1;
      else if (bruto[i] === ')') {
        profundidade -= 1;
        if (profundidade === 0) return bruto.slice(0, i + 1);
      }
    }
    return null;
  }
  // Parada nomeada (`transparent`, `white`) ou direção/ângulo (`to right`, `100deg`).
  const nome = bruto.match(/^[a-zA-Z]+/)?.[0] ?? null;
  if (!nome) return null;
  if (['to', 'at', 'in', 'circle', 'ellipse', 'closest', 'farthest', 'from', 'deg', 'turn', 'rad'].includes(nome)) return null;
  return nome;
}

/**
 * A camada de fundo que a regra declara, com a natureza dela à vista.
 *
 * `tipo` é o que permite compor: `opaca` e `gradiente` fecham a pilha (o que
 * está atrás não aparece), `translucida` e `transparente` deixam passar o que
 * vem de trás, e o resto (`imagem`, `nao-resolvida`, `gradiente-translucido`)
 * não vira cor nenhuma — fica como motivo, como antes.
 */
export function camadaDe(props, tokens) {
  let texto = null;
  for (const [prop, valor] of props) if (PROPRIEDADE_DE_FUNDO.test(prop)) texto = valor;
  if (texto === null) return { tipo: 'ausente', motivo: 'sem fundo declarado na regra nem na chave' };

  const cru = semImportante(texto);
  const valor = cru.toLowerCase();
  if (valor === 'none' || valor === 'transparent') {
    return { tipo: 'transparente', cores: [], motivo: 'fundo transparente' };
  }
  if (VALORES_INICIAIS.has(valor)) return { tipo: 'inicial', motivo: `fundo ${valor}` };
  if (valor.includes('url(')) return { tipo: 'imagem', motivo: 'imagem de fundo' };

  const gradiente = valor.match(/(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\(/);
  if (gradiente) {
    const inicio = gradiente.index + gradiente[0].length;
    let profundidade = 1;
    let fim = inicio;
    for (; fim < cru.length && profundidade > 0; fim += 1) {
      if (cru[fim] === '(') profundidade += 1;
      else if (cru[fim] === ')') profundidade -= 1;
    }
    const paradas = partirTopo(cru.slice(inicio, fim - 1));
    const candidatos = [];
    for (const parada of paradas) {
      const bruto = corDaParada(parada);
      if (!bruto) continue;
      const cor = interpretarCor(bruto, tokens);
      if (!cor.ok) {
        return {
          tipo: 'nao-resolvida',
          motivo: `gradiente com parada não resolvida: ${bruto} (${cor.motivo})`,
        };
      }
      if (cor.rgba[3] < 1) {
        // Composta contra o canvas, uma parada translúcida vira uma superfície
        // plausível — mas ela não é a camada do elemento, então o gradiente
        // inteiro fica fora da aritmética, como antes.
        return {
          tipo: 'gradiente-translucido',
          cores: [compor(cor.rgba, CANVAS)],
          motivo: 'gradiente com parada translúcida',
        };
      }
      candidatos.push(cor.rgba);
    }
    if (!candidatos.length) return { tipo: 'nao-resolvida', motivo: 'gradiente sem parada resolvida' };
    return { tipo: 'gradiente', cores: candidatos };
  }

  const cor = interpretarCor(cru, tokens);
  if (!cor.ok) return { tipo: 'nao-resolvida', motivo: `fundo não resolvido: ${cor.motivo}` };
  if (cor.rgba[3] === 0) return { tipo: 'transparente', cores: [], motivo: 'fundo transparente' };
  if (cor.rgba[3] < 1) {
    return {
      tipo: 'translucida',
      cores: [cor.rgba],
      motivo: 'fundo translúcido (o que está atrás vem de outra regra)',
    };
  }
  return { tipo: 'opaca', cores: [cor.rgba] };
}

/**
 * Fundos declarados na regra, na ordem do arquivo (o `background` abreviado
 * apaga o `background-color` que veio antes).
 * Devolve a lista de cores candidatas ou o motivo para não conferir.
 */
export function fundosDeclarados(props, tokens) {
  const camada = camadaDe(props, tokens);
  if (camada.tipo === 'opaca') return { fundos: camada.cores };
  if (camada.tipo === 'gradiente') return { fundos: camada.cores, gradiente: true };
  return { motivo: camada.motivo };
}

/**
 * O canvas: com `html` e `body` sem fundo declarado, quem pinta a tela é o
 * navegador, em branco. É o fundo de última instância de toda pilha.
 */
export const CANVAS = [255, 255, 255, 1];

// Pseudo-ELEMENTO (caixa própria, pintada) é diferente de pseudo-CLASSE
// (estado/estrutura do mesmo elemento): `:first-child` é o elemento, `::before`
// é uma caixa dentro dele. Tratar os dois como a mesma coisa fez o pontinho
// verde do primeiro item do lobby virar "camada de trás" da própria lista.
const PSEUDO_ELEMENTOS = new Set([
  'before', 'after', 'backdrop', 'placeholder', 'selection', 'first-line', 'first-letter',
  'marker', 'file-selector-button', 'part', 'slotted', 'cue', 'target-text',
  'grammar-error', 'spelling-error',
]);
const PSEUDO_ELEMENTO = /::?[a-z-]+(?:\([^)]*\))?/i;
const PSEUDO_ELEMENTO_G = /::?([a-z-]+)(?:\([^)]*\))?/gi;

const nomePseudoElemento = (nome) => String(nome).toLowerCase();

/** O último pseudo-elemento do composto (`::before`), ou `null`. */
function pseudoElementoDe(composto) {
  const achados = [...composto.matchAll(new RegExp(PSEUDO_ELEMENTO_G.source, 'gi'))]
    .map((m) => nomePseudoElemento(m[1]))
    .filter((nome) => PSEUDO_ELEMENTOS.has(nome));
  return achados[achados.length - 1] ?? null;
}

/**
 * Cadeia de compostos de um seletor: `body[data-page='tv'] .lobby > .codigo` ->
 * `['body[data-page=\'tv\']', '.lobby', '.codigo']`, e `irmao` quando há `+`/`~`
 * — que é o único caso em que um composto à esquerda NÃO é ancestral.
 */
export function cadeiaDe(seletor) {
  const compostos = [];
  let atual = '';
  let parenteses = 0;
  let colchetes = 0;
  let irmao = false;
  for (const c of seletor) {
    if (c === '(') parenteses += 1;
    if (c === ')') parenteses -= 1;
    if (c === '[') colchetes += 1;
    if (c === ']') colchetes -= 1;
    if (parenteses === 0 && colchetes === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) {
      if (c === '+' || c === '~') irmao = true;
      if (atual.trim()) compostos.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  if (atual.trim()) compostos.push(atual.trim());
  return { compostos, irmao };
}

/** Sem o pseudo-elemento; pseudo-classe permanece (ela é o mesmo elemento). */
const semPseudo = (composto) =>
  composto.replace(new RegExp(PSEUDO_ELEMENTO_G.source, 'gi'), (todo, nome) =>
    PSEUDO_ELEMENTOS.has(nomePseudoElemento(nome)) ? '' : todo,
  ) || composto;

/**
 * O mesmo elemento? Exato, ou o composto do provedor como prefixo do alvo:
 * `body[data-page='arena']` casa com `body[data-page='arena'].round-active`, que é
 * o mesmo `<body>` com uma classe de estado a mais.
 */
function combina(compostoProvedor, compostoAlvo) {
  const provedor = semPseudo(compostoProvedor).trim();
  const alvo = semPseudo(compostoAlvo).trim();
  if (provedor === alvo) return true;
  if (!alvo.startsWith(provedor)) return false;
  return /^[.:#[]/.test(alvo.slice(provedor.length));
}

/**
 * Nível do composto global (`html`/`:root` -2, `body` -1, `*` -3), ou `null`.
 * Ele é contexto de página: pinta atrás de tudo, sem precisar estar escrito na
 * cadeia do alvo.
 */
function nivelGlobal(composto) {
  const alvo = semPseudo(composto).trim();
  if (/^\*/.test(alvo)) return -3;
  if (/^(:root|html)(?![\w-])/.test(alvo)) return -2;
  if (/^body(?![\w-])/.test(alvo)) return -1;
  return null;
}

/**
 * Especificidade de um caminho de seletor, em um número: `#id` pesa 10000,
 * classe/atributo/pseudo-classe pesa 100, tipo pesa 1. Serve para uma coisa só:
 * decidir qual das regras que pintam o MESMO elemento manda — o que a cascata por
 * chave não resolve, porque chaves diferentes são seletores diferentes.
 */
export function especificidadeDe(seletor) {
  let id = 0;
  let classe = 0;
  let tipo = 0;
  for (const composto of cadeiaDe(seletor).compostos) {
    id += (composto.match(/#[\w-]+/g) || []).length;
    classe += (composto.match(/\.[\w-]+/g) || []).length;
    classe += (composto.match(/\[[^\]]*\]/g) || []).length;
    classe += (composto.match(/(?<![:\w-]):[a-z-]+(?:\([^)]*\))?/gi) || []).filter(
      (p) => !PSEUDO_ELEMENTOS.has(nomePseudoElemento(p.slice(1).split('(')[0])),
    ).length;
    tipo += (composto.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  }
  return id * 10000 + classe * 100 + tipo;
}

/**
 * Quem pinta atrás de quem.
 *
 * A chave de cada regra já sai resolvida pela cascata (uma camada por seletor),
 * e a ancestralidade vem do que o seletor ESCREVE: `body[data-page='tv'] .lobby
 * .codigo` diz que o lobby está dentro do corpo. Composto global (`html`, `body`,
 * `:root`) não precisa estar escrito — ele pinta atrás de tudo. Combinador de
 * irmão (`+`, `~`) não vira camada: irmão não está atrás.
 */
export function camadasDeTras(folhas, { tokens = tokensDe(folhas) } = {}) {
  const porChave = new Map();
  // Toda chave que declara fundo, inclusive quando a natureza dele não vira cor
  // (imagem, `inherit`, gradiente não resolvido). Quem mede a tinta de uma regra
  // irmã precisa saber que o fundo está ali e por que ele não entra na conta —
  // sem isso, a regra que só declara a cor fica invisível para a régua.
  const camadaDaChave = new Map();
  const ordemDe = new Map();
  let ordem = 0;
  for (const folha of folhas) {
    for (const regra of analisarRegras(semCr(folha.texto))) {
      ordem += 1;
      if (!ordemDe.has(regra.key)) ordemDe.set(regra.key, ordem);
    }
  }
  for (const [chave, vencedores] of cascataDe(folhas)) {
    // O `background` abreviado apaga o `background-color`: quando os dois vencem
    // na mesma chave, quem manda é ele.
    const escolhido = vencedores.get('background') ?? vencedores.get('background-color');
    if (!escolhido) continue;
    const camada = camadaDe(
      new Map([[
        vencedores.get('background') ? 'background' : 'background-color',
        `${escolhido.valor}${escolhido.importante ? ' !important' : ''}`,
      ]]),
      tokens,
    );
    const [media, seletor] = chave.split('||');
    camadaDaChave.set(chave, { camada, origem: escolhido.origem ?? null, seletor });
    if (!['opaca', 'translucida', 'gradiente', 'transparente'].includes(camada.tipo)) continue;
    const alternativas = compostosDe(seletor);
    porChave.set(chave, {
      chave,
      media,
      seletor,
      camada,
      origem: escolhido.origem ?? null,
      importante: Boolean(escolhido.importante),
      especificidade: Math.max(0, ...alternativas.map(especificidadeDe)),
      ordem: ordemDe.get(chave) ?? 0,
      // "Escopada em página": pinta um `html`/`body` com atributo
      // (`body[data-page='tv']`). `body` sozinho não conta — ele é a base de
      // todo mundo, não uma aposta sobre em qual página o elemento vive.
      escopada: alternativas.some((alt) =>
        cadeiaDe(alt).compostos.some((c) => nivelGlobal(c) !== null && /\[/.test(semPseudo(c))),
      ),
    });
  }

  // Superfícies plausíveis de fundo: toda cor de camada declarada, composta
  // contra o canvas quando é translúcida — mais o próprio canvas, porque nem
  // toda superfície precisa ser pintada. É sobre este conjunto que a régua mede
  // o par cujo seletor não escreve onde o elemento vive.
  const superficiesExceto = (chave) => {
    const conjunto = new Map([[JSON.stringify(CANVAS), CANVAS]]);
    for (const provedor of porChave.values()) {
      // A camada do próprio par não é superfície de fundo dele: é ele mesmo.
      if (provedor.chave === chave) continue;
      for (const cor of provedor.camada.cores) {
        const efetiva = cor[3] === 1 ? cor : compor(cor, CANVAS);
        conjunto.set(JSON.stringify(efetiva), efetiva);
      }
    }
    return [...conjunto.values()];
  };

  return {
    porChave,
    camadaDaChave,
    cascata: cascataDe(folhas),
    superficiesExceto,
    superficies: superficiesExceto(null),
    ancestraisDe: (chaveAlvo) => ancestraisDe(chaveAlvo, porChave),
  };
}

/**
 * Quem manda quando duas chaves diferentes pintam o mesmo elemento: `!important`
 * primeiro, depois especificidade, depois ordem no arquivo — a cascata de sempre.
 */
function porCascata(a, b) {
  if (a.importante !== b.importante) return a.importante ? -1 : 1;
  if (a.especificidade !== b.especificidade) return b.especificidade - a.especificidade;
  return b.ordem - a.ordem;
}

const mesmaCamada = (a, b) =>
  Boolean(a && b) && a.tipo === b.tipo && JSON.stringify(a.cores) === JSON.stringify(b.cores);

/**
 * Dois compostos que o MESMO elemento pode satisfazer: iguais, ou um deles o
 * outro com mais uma classe (`body[data-page='report'] .report-header` e
 * `... .report-header.report-head` são o mesmo cabeçalho).
 */
const mesmoElemento = (a, b) => combina(a, b) || combina(b, a);

/**
 * As chaves que pintam o elemento do composto dado (a última do caminho delas).
 */
function concorrentesDe(composto, mediaAlvo, porChave) {
  return [...porChave.values()]
    .filter((p) => !p.media || p.media === mediaAlvo)
    .filter((p) =>
      compostosDe(p.seletor).some((alt) => {
        const c = cadeiaDe(alt);
        if (c.irmao || !c.compostos.length) return false;
        if (pseudoElementoDe(c.compostos[c.compostos.length - 1])) return false;
        return mesmoElemento(c.compostos[c.compostos.length - 1], composto);
      }),
    )
    .sort(porCascata);
}

/**
 * As camadas ancestrais de uma chave, de fora para dentro.
 *
 * Cada alternativa do seletor (antes das vírgulas) é tratada como um caminho
 * possível, e a camada de contexto de mídia diferente não vale: uma superfície
 * que só existe em `@media` estreito não é o que está atrás no resto do tempo.
 */
function ancestraisDe(chaveAlvo, porChave) {
  const [mediaAlvo, seletorAlvo] = chaveAlvo.split('||');
  const provados = [];
  for (const alternativa of compostosDe(seletorAlvo)) {
    const { compostos, irmao } = cadeiaDe(alternativa);
    if (irmao || !compostos.length) continue;
    const pseudoAlvo = pseudoElementoDe(compostos[compostos.length - 1]);
    // Com pseudo-elemento (`::before`), o próprio elemento é a camada de trás:
    // a caixa do pseudo-elemento é pintada dentro dele.
    const limite = pseudoAlvo ? compostos.length : compostos.length - 1;
    // O alvo escreve em que página vive? Se não escreve, a camada de uma regra
    // escopada em página é uma aposta.
    const alvoEscopado = compostos.some((c) => /^body(?![\w-])/.test(semPseudo(c).trim()));
    for (const provedor of porChave.values()) {
      if (provedor.chave === chaveAlvo) continue;
      if (provedor.media && provedor.media !== mediaAlvo) continue;
      for (const alt of compostosDe(provedor.seletor)) {
        const caminho = cadeiaDe(alt);
        if (caminho.irmao || !caminho.compostos.length) continue;
        // A caixa de um pseudo-elemento fica DENTRO do elemento: ela nunca é
        // camada de trás — é a mesma caixa, e quem manda nela é a cascata.
        if (pseudoElementoDe(caminho.compostos[caminho.compostos.length - 1])) continue;
        let posicao = null;
        let alvo = 0;
        let ok = true;
        let achouAlgum = false;
        let compostoDeReferencia = null;
        for (const composto of caminho.compostos) {
          const global = nivelGlobal(composto);
          let achou = -1;
          for (let j = alvo; j < limite; j += 1) {
            if (combina(composto, compostos[j])) {
              achou = j;
              break;
            }
          }
          if (achou === -1) {
            // Contexto global que o alvo não escreve (`body[data-page='arena']`
            // para um seletor que não diz em que página vive): não é camada
            // provada — é uma das superfícies plausíveis, e essas já entram como
            // base no outro ramo. Tratar como ancestral provada foi o erro que
            // mediu todo elemento da TV contra o branco do canvas.
            if (global !== null) continue;
            ok = false;
            break;
          }
          alvo = achou + 1;
          posicao = global !== null && achou === 0 ? global : achou;
          achouAlgum = true;
          compostoDeReferencia = compostos[achou];
        }
        if (!ok || posicao === null || !achouAlgum) continue;

        // Quem manda no ELEMENTO é a cascata entre chaves — importância,
        // especificidade, ordem —, e não a chave em que este caminho foi escrito.
        // Sem isso, `body[data-page='report'] .report-header` (navy) pintava por
        // cima de `...report-header.report-head` (transparente, mais específica).
        const concorrentes = concorrentesDe(compostoDeReferencia, mediaAlvo, porChave);
        const [primeiro, segundo] = concorrentes;
        const dono = primeiro ?? provedor;
        const empateDeForca = Boolean(segundo) &&
          primeiro.importante === segundo.importante &&
          primeiro.especificidade === segundo.especificidade &&
          !mesmaCamada(primeiro.camada, segundo.camada);
        // Uma camada escopada na página competindo com uma sem escopo: qual delas
        // pinta depende de onde o elemento está, e o seletor do alvo não diz.
        const escopoEmDuvida = !alvoEscopado &&
          concorrentes.some((c) => c.escopada && !mesmaCamada(c.camada, dono.camada));
        provados.push({
          chave: dono.chave,
          seletor: dono.seletor,
          camada: dono.camada,
          posicao,
          ambiguo: empateDeForca || escopoEmDuvida,
          motivo: empateDeForca
            ? `duas chaves de mesma força pintam ${compostoDeReferencia}: ${concorrentes.slice(0, 2).map((c) => c.seletor).join(' e ')}`
            : escopoEmDuvida
              ? `camada escopada em página sem o alvo escrever em qual: ${dono.seletor}`
              : null,
        });
      }
    }
  }
  // Mesma posição pintada por duas chaves diferentes que NÃO competem (posições
  // distintas do caminho): a mais externa fica, e a de dentro é pintada depois.
  const porPosicao = new Map();
  for (const p of provados) {
    const atual = porPosicao.get(p.posicao);
    if (!atual || (atual.camada.tipo === 'translucida' && p.camada.tipo !== 'translucida')) {
      porPosicao.set(p.posicao, p);
    }
  }
  const camadas = [...porPosicao.values()].sort((a, b) => a.posicao - b.posicao);
  return { camadas, ambiguidade: camadas.filter((c) => c.ambiguo) };
}

/**
 * Todas as cores que a pilha pode pintar sobre uma base, de fora para dentro.
 * Camada de gradiente contribui com cada parada: a posição do texto é geometria
 * que o arquivo não diz, então valem todas — e o pior caso decide adiante.
 */
function pilhasDe(camadas, base) {
  let pilhas = [base];
  for (const camada of camadas) {
    const proximas = [];
    for (const pilha of pilhas) for (const cor of camada.cores) proximas.push(compor(cor, pilha));
    pilhas = proximas.slice(0, 32);
  }
  return pilhas;
}

/**
 * Todos os pares declarados das folhas, separados em `conferidos` (aritmética
 * possível) e `pulados` (motivo escrito, contagem guardada pelo teste).
 *
 * Cada conferido carrega `contexto`: `escrito` quando a ancestralidade está
 * escrita (ou a camada mais externa é opaca, ou nada mais pinta) e `candidato`
 * quando o par foi medido sobre as superfícies plausíveis do sistema.
 */
export function paresDeclarados(folhas, { tokens = tokensDe(folhas), camadas = camadasDeTras(folhas, { tokens }) } = {}) {
  const conferidos = [];
  const pulados = [];
  for (const folha of folhas) {
    const texto = semCr(folha.texto);
    for (const regra of analisarRegras(texto)) {
      const props = propsDe(regra);
      if (!props.has('color')) continue;

      // A tinta pode estar nesta regra e o fundo em OUTRA regra da MESMA chave: a
      // cascata junta as duas, então o elemento pinta as duas. Exigir tinta e
      // fundo no mesmo corpo de regra era o furo que orfanou seis pares em 16/09
      // — o fundo da chave mudou de folha e a tinta ficou fora da conta.
      const propriaNaRegra = camadaDe(props, tokens);
      const daChave = camadas.camadaDaChave.get(regra.key) ?? null;
      const propria = propriaNaRegra.tipo === 'ausente' && daChave ? daChave.camada : propriaNaRegra;

      const seletor = regra.key.split('||')[1] || regra.key;
      const linha = texto.slice(0, regra.posicao ?? 0).split('\n').length;
      const anotacao = { folha: folha.nome, chave: regra.key, seletor, linha };
      // `familia` é o que a catraca conta: um motivo com número dentro (o pior
      // gradiente medido) não pode virar chave de contagem, senão qualquer ajuste
      // de cor parece uma regra nova.
      const pular = (familia, motivo) => pulados.push({ ...anotacao, familia, motivo });

      // Quem pinta a tela é a declaração que vence a cascata naquela chave. Um
      // par de uma regra que perdeu a cor (`app-authorial .ghost-link` com
      // `rgba(0,0,0,.2)`, coberto por `design.css`) não está em tela nenhuma, e
      // medi-lo seria inventar um problema que ninguém vê.
      const vencedoraDaCor = camadas.cascata.get(regra.key)?.get('color');
      const normalizar = (texto) => semImportante(texto ?? '').replace(/\s+/g, ' ').trim();
      if (!vencedoraDaCor || normalizar(vencedoraDaCor.valor) !== normalizar(props.get('color'))) {
        pular(
          'regra que perde a cascata',
          `cor ${props.get('color')} perde para ${vencedoraDaCor ? vencedoraDaCor.valor : 'nenhuma'} na mesma chave`,
        );
        continue;
      }

      // O texto pintado com o próprio fundo (gradiente recortado no glifo) não
      // tem par: a cor do texto é `transparent` de propósito.
      const recorte = props.get('background-clip') || props.get('-webkit-background-clip');
      if (recorte && semImportante(recorte).toLowerCase() === 'text') {
        pular('texto pintado com o fundo', 'texto pintado com o fundo (background-clip: text)');
        continue;
      }

      const opacidade = props.get('opacity');
      if (opacidade !== undefined && parseFloat(opacidade) < 1) {
        pular('regra com opacity', `regra com opacity: ${semImportante(opacidade)}`);
        continue;
      }

      const tinta = interpretarCor(props.get('color'), tokens);
      if (!tinta.ok) {
        pular('cor do texto não resolvida', `cor do texto não resolvida: ${tinta.motivo}`);
        continue;
      }

      let fundos = null;
      let gradiente = false;
      let contexto = 'escrito';
      let razaoPior = null;
      let razaoMelhor = null;
      let superficie = propriaNaRegra.tipo !== 'ausente'
        ? (props.has('background-color') && !props.has('background')
          ? props.get('background-color')
          : (props.get('background') || props.get('background-color')))
        : daChave
          ? `fundo da mesma chave (${daChave.origem ? `${daChave.origem.folha}:${daChave.origem.linha}` : daChave.seletor})`
          : 'sem fundo na regra nem na chave';

      if (propria.tipo === 'opaca' || propria.tipo === 'gradiente') {
        fundos = propria.cores;
        gradiente = propria.tipo === 'gradiente';
      } else if (propria.tipo === 'translucida' || propria.tipo === 'transparente') {
        // A camada da PRÓPRIA chave manda: quando outra regra de mesmo seletor
        // pinta um fundo opaco, é ele que a tela mostra, e a regra que perdeu o
        // fundo não inventa camada nenhuma.
        const vencedora = camadas.porChave.get(regra.key);
        const outraCamada = vencedora && !mesmaCamada(vencedora.camada, propria);
        const vence = outraCamada && (vencedora.camada.tipo === 'opaca' || vencedora.camada.tipo === 'gradiente');
        // Onde o fundo da própria regra não é o que a tela mostra — outra chave
        // pinta por cima, ou pinta `transparent` —, a camada dela sai da pilha.
        const camadaDeCima = vence || (outraCamada && vencedora.camada.tipo === 'transparente')
          ? []
          : propria.tipo === 'translucida'
            ? [propria]
            : [];
        if (vence) {
          fundos = vencedora.camada.cores;
          gradiente = vencedora.camada.tipo === 'gradiente';
          superficie = vencedora.seletor;
        } else {
          const superficies = camadas.superficiesExceto(regra.key);
          const { camadas: ancestrais, ambiguidade } = camadas.ancestraisDe(regra.key);
          // Camada ambígua sai da pilha: o que se sabe é que ALGUMA dessas pinta,
          // não qual — então o par passa a ser medido sobre as superfícies
          // plausíveis, que é onde todas elas estão.
          const firmes = ancestrais.filter((a) => !a.ambiguo);
          const pilha = [...firmes.map((a) => a.camada), ...camadaDeCima];
          gradiente = pilha.some((c) => c.tipo === 'gradiente');
          if (firmes.length) superficie = firmes.map((a) => a.seletor).join(' > ');
          if (ambiguidade.length) superficie = `${ambiguidade[0].motivo}`;
          const maisExterna = pilha[0];
          const fecha = maisExterna && maisExterna.tipo !== 'translucida';
          if (!ambiguidade.length && (fecha || superficies.length <= 1)) {
            // Ou a camada mais externa é opaca (o que está atrás não aparece), ou
            // não existe nada mais que pinte: a base é o canvas.
            fundos = pilhasDe(pilha, CANVAS);
          } else {
            // O seletor não escreve onde o elemento vive. Vale a melhor superfície
            // possível — se passa em alguma, quem decide é a tela — e a pior fica
            // registrada para quem for olhar.
            contexto = 'candidato';
            const razoes = [];
            for (const base of superficies) {
              for (const cor of pilhasDe(pilha, base)) razoes.push(contraste(tinta.rgba, cor));
            }
            if (!razoes.length) razoes.push(contraste(tinta.rgba, CANVAS));
            razaoPior = Math.min(...razoes);
            razaoMelhor = Math.max(...razoes);
            superficie = `${superficies.length} superfícies possíveis`;
          }
        }
      } else {
        const familia = propria.tipo === 'ausente'
          ? 'tinta sem fundo na chave'
          : propria.motivo.startsWith('gradiente')
            ? 'gradiente não resolvido'
            : propria.motivo.split(' (')[0].split(':')[0];
        pular(familia, propria.motivo);
        continue;
      }

      const px = tamanhoEmPx(props.get('font-size'));
      const peso = pesoDe(props.get('font-weight'));
      const teto = tetoAA(px, peso);
      const razoes = contexto === 'candidato'
        ? [razaoMelhor, razaoPior]
        : fundos.map((cor) => contraste(tinta.rgba, cor));
      const razao = contexto === 'candidato' ? razaoMelhor : Math.min(...razoes);

      // Gradiente com todas as paradas acima do teto: passa onde o texto cair.
      // Uma parada ruim, a íngreme, no meio de paradas boas: a posição do texto
      // decide, e isso é geometria — não dá para afirmar daqui. Fica pulado, com
      // o número na frente, em vez de virar reprovação nem sumir.
      if (gradiente && razao < teto) {
        pular(
          'gradiente com pior parada abaixo do teto',
          `gradiente com pior parada em ${razao.toFixed(2)} (teto ${teto}): a posição do texto decide`,
        );
        continue;
      }

      conferidos.push({
        ...anotacao,
        tinta: props.get('color'),
        fundo: superficie,
        contexto,
        razaoPior,
        px,
        peso,
        teto,
        razao,
        ok: razao >= teto,
        // Teto estrito por falta de tamanho na regra: o relatório precisa dizer
        // que o número é conservador, senão vira acusação sem contexto.
        tamanhoHerdado: px === null,
      });
    }
  }
  return { conferidos, pulados, tokens };
}

const nomeCurto = (chave) => {
  const [media, seletor] = chave.split('||');
  return `${media ? `@${media} ` : ''}${seletor}`;
};

export function relatarConferidos(pares, limite = 30) {
  return pares
    .slice(0, limite)
    .map((p) => {
      const onde = `${p.folha}:${p.linha} ${nomeCurto(p.chave)}`;
      const medida = `${p.razao.toFixed(2)} < teto ${p.teto}` +
        (p.tamanhoHerdado ? ' (tamanho não declarado nesta regra: teto estrito)' : ` (${p.px}px/${p.peso ?? 'peso herdado'})`);
      const contexto = p.contexto === 'candidato'
        ? `\n     contexto: candidato — a pior superfície plausível dá ${p.razaoPior.toFixed(2)}`
        : '';
      return `  ${onde}\n     ${medida}${contexto}\n     cor ${p.tinta} sobre ${p.fundo}`;
    })
    .join('\n');
}

/** Contagem por família de motivo: é o que a catraca guarda e compara. */
export function contagemPorFamilia(pulados) {
  const contagem = {};
  for (const p of pulados) contagem[p.familia] = (contagem[p.familia] || 0) + 1;
  return Object.fromEntries(Object.entries(contagem).sort(([a], [b]) => a.localeCompare(b)));
}

export function relatarPulados(pulados, limite = 12) {
  const porFamilia = new Map();
  for (const p of pulados) {
    porFamilia.set(p.familia, [...(porFamilia.get(p.familia) || []), p]);
  }
  return [...porFamilia.entries()]
    .map(([familia, lista]) => {
      const exemplos = lista.slice(0, 3).map((p) => `${p.folha}: ${nomeCurto(p.chave)} — ${p.motivo}`);
      return `  ${String(lista.length).padStart(3)}  ${familia}\n        ex.: ${exemplos.join('\n        ex.: ')}` +
        (lista.length > 3 ? `\n        (+${lista.length - 3})` : '');
    })
    .slice(0, limite)
    .join('\n');
}
