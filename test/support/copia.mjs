// Quanto texto um humano lê em cada tela — e quanto o site base lia.
//
// A pergunta que este instrumento responde é a única que o orçamento de cópia
// precisa: QUANTAS PALAVRAS DE TEXTO VISÍVEL esta tela entrega. Ele não julga se
// o texto é bom; ele dá o número estável, em milissegundos e sem navegador, para
// que a guarda em `test/copia/orcamento.test.mjs` possa reprovar quando a tela
// engordar.
//
// Por que a régua existe, medida e depois cortada: comparando com o site base
// congelado em `evidence/original-public/`, o portal tinha 57 palavras contra 38
// do site base (1,5×), o painel do professor 89 contra 31 (2,9×), e o cliente —
// `public/assets/js/**`, que é o que o aluno vê durante a missão — 2055 contra
// **836** (2,5×). Nada disso doeu em nenhum teste: `test/css/render.json` retrata
// propriedades computadas de estilo e **nenhum texto**, então a cópia era a única
// camada da tela sem guarda nenhuma. Depois do corte desta frente, o cliente está
// em 1608 — o resto da diferença para o site base é RÓTULO de tela que o original
// não tinha (banco de desafios, modo Arena, sorteio da vez), não prosa.
//
// TRÊS FAMÍLIAS, de propósito, e não uma soma por tela:
//
//   - `telas`: o HTML que o servidor devolve, contado por superfície. É o texto
//     que existe na primeira pintura, antes de qualquer script rodar.
//   - `cliente`: o texto que mora dentro dos bundles e aparece depois, quando o
//     cliente monta o DOM. Contado por ARQUIVO, porque um mesmo bundle serve
//     várias telas (o `arena.js` é carregado pelo aluno, pela prévia, pelo
//     painel e pela TV) — somá-lo a cada superfície contaria o mesmo texto
//     quatro vezes e produziria um orçamento que ninguém consegue defender.
//   - `api`: o texto que o servidor manda no JSON e a tela mostra depois. Ele não
//     está no HTML da primeira pintura nem é literal de bundle, e foi por isso
//     que ficou fora do orçamento até set/2026 — a família que fecha o furo
//     descrito na skill `copia-de-interface`. Medido por CHAMADA DO PRODUTOR
//     (ver a seção própria, mais abaixo), não por varredura de literal.
//
// A proveniência continua registrada: cada tela lista os bundles que ela carrega
// (lidos do próprio HTML servido, via `<script src=...>`), então o inventário
// responde "de onde vem o texto desta tela" sem inflar o número dela.
//
// A LINHA DE BASE não é digitada à mão: ela é lida de `evidence/original-public/`
// a cada execução, do mesmo arquivo cujo sha256 o `evidence/manifest.json` já
// congela. Ou seja, se a captura mudar, o número muda e a guarda acusa.

import { readFileSync, readdirSync } from 'node:fs';

import { DRAW_MODES, drawView, emptyDraw } from '../../src/domain/arena-draw.mjs';
import { ARENA_DYNAMICS, ARENA_POWERS } from '../../src/domain/arena-mode.mjs';
import { renderPage } from '../../src/web/pages/index.mjs';

/**
 * As superfícies que o produto serve, com o nome que `test/css/render.json` já
 * usa para o retrato visual de cada uma — orçamento de cópia e retrato de estilo
 * falam a mesma língua, então a mesma tela tem um nome só no repositório.
 *
 * `autenticada` é o que o roteador exige para servir a tela: `/admin-arena.php`
 * é DUAS superfícies com a mesma rota (login quando anônimo, painel quando há
 * sessão), e é por isso que a rota sozinha não identifica a tela.
 */
export const TELAS = [
  { nome: 'portal', rotas: ['/', '/index.php'], autenticada: false },
  { nome: 'projecao-da-tv', rotas: ['/tv.php'], autenticada: false },
  { nome: 'previa-da-tv', rotas: ['/tv-preview.php'], autenticada: true },
  { nome: 'entrada-do-aluno', rotas: ['/arena.php', '/play'], autenticada: false },
  { nome: 'painel-login', rotas: ['/admin-arena.php'], autenticada: false },
  { nome: 'painel-do-professor', rotas: ['/admin-arena.php'], autenticada: true },
  { nome: 'previa-do-aluno', rotas: ['/aluno-preview.php'], autenticada: true },
  { nome: 'relatorio', rotas: ['/report.php'], autenticada: true },
  // A tela sem rota: é o `fallback` do roteador. Entra no inventário de propósito
  // — hoje ela é a única tela do produto sem uma linha de estilo, e é justamente
  // a que aparece quando alguém erra a URL na frente da turma.
  { nome: 'pagina-nao-encontrada', rotas: ['/rota-que-nao-existe'], autenticada: false, status: 404 },
];

/** Rotas que o roteador conhece e que NÃO são tela (redirecionam). */
export const ROTAS_NAO_TELA = ['/admin.php'];

/**
 * Qual página do site base congela o mesmo trabalho de cada tela viva. Onde não
 * existe equivalente, `null` — e aí a linha de base é a ausência, não um número
 * inventado: o relatório e o painel do professor são superfícies que o site base
 * não tinha (o `report.php` original tinha 0 bytes), então não há régua externa
 * para elas, e o que sobra é o número de hoje, congelado.
 */
export const BASES = {
  portal: 'index.php',
  'projecao-da-tv': 'wall.php',
  'previa-da-tv': 'wall.php',
  'entrada-do-aluno': 'game/station-1.html',
  'previa-do-aluno': 'game/station-1.html',
  'painel-login': 'admin.php',
  'painel-do-professor': 'admin.php',
  relatorio: 'report.php',
  'pagina-nao-encontrada': null,
};

/** Onde vive o cliente (o texto que só aparece depois que o script roda). */
export const DIRETORIO_DO_CLIENTE = 'public/assets/js';

/**
 * O cliente do site base, e por que a comparação é de FAMÍLIA e não de arquivo:
 * a captura tem UM bundle (`app.js`, 122 KB) que fazia os três papéis clássicos
 * — entrada, `main` e projeção. O nosso tem dois, e os dois descendem dele. Então
 * comparar `app.js` com `app.js` seria comparar a metade de uma coisa com o todo;
 * a linha de base do cliente é a SOMA do nosso cliente contra a soma daquele.
 */
export const BASE_DO_CLIENTE = {
  arquivos: ['public/assets/js/app.js'],
};

// ---------------------------------------------------------------------------
// Texto visível
// ---------------------------------------------------------------------------

const ENTIDADES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•', times: '×',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°', laquo: '«', raquo: '»',
};

export function decodificar(texto) {
  return texto.replace(/&(#?[a-z0-9]+);/gi, (todo, nome) => {
    const chave = nome.toLowerCase();
    if (Object.hasOwn(ENTIDADES, chave)) return ENTIDADES[chave];
    if (/^#\d+$/.test(chave)) return String.fromCodePoint(Number(chave.slice(1)));
    if (/^#x[0-9a-f]+$/.test(chave)) return String.fromCodePoint(parseInt(chave.slice(2), 16));
    return todo;
  });
}

// O que o usuário LÊ sem que seja nó de texto: o rótulo de um campo vazio, a
// dica de um botão, a descrição de uma imagem. Fora desta lista, atributo é
// código (`class`, `data-*`, `href`) e não entra na conta.
const ATRIBUTOS_VISIVEIS = /(?:^|\s)(?:placeholder|title|aria-label|alt)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/**
 * O texto que um humano vê em `marcacao`, seja um documento HTML inteiro (o que
 * o servidor devolve) ou um fragmento montado por template literal no cliente.
 *
 * Sai fora, e cada corte é uma decisão: `<head>` (o `<title>` é cromo do
 * navegador, não tela), `<script>`/`<style>` (código), comentários HTML (o
 * repositório escreve comentário em português explicando a tela, e comentário
 * não é tela), e as tags.
 */
export function textoVisivel(marcacao) {
  let texto = String(marcacao);
  texto = texto.replace(/<!--[\s\S]*?-->/g, ' ');
  texto = texto.replace(/<(script|style|head|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const rotulos = [];
  for (const achado of texto.matchAll(ATRIBUTOS_VISIVEIS)) rotulos.push(achado[1] ?? achado[2] ?? '');
  texto = texto.replace(/<[^>]*>/g, ' ');
  return decodificar([texto, ...rotulos].join('\n')).replace(/\s+/g, ' ').trim();
}

/**
 * A conta do orçamento: só o que dá trabalho de ler. Um token entra se tiver ao
 * menos DOIS caracteres alfanuméricos — `0`, `1`, `—` e `·` não contam, porque
 * número solto e marcador não são texto, e contá-los faria o orçamento mexer
 * quando um contador na tela mudasse de valor.
 */
export function palavras(texto) {
  return texto
    .split(/\s+/)
    .filter((token) => (token.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length >= 2).length;
}

// ---------------------------------------------------------------------------
// O cliente: literais de string, com comentário fora
// ---------------------------------------------------------------------------

const PALAVRAS_QUE_NAO_ABREM_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case',
  'do', 'else', 'yield', 'await', 'default', 'throw',
]);

const ehPalavra = (c) => /[\w$]/.test(c);

function desescapar(barra, proximo) {
  if (proximo === 'n' || proximo === 't' || proximo === 'r' || proximo === 'f') return ' ';
  return proximo;
}

function lerAspas(fonte, inicio) {
  const aspa = fonte[inicio];
  let saida = '';
  let i = inicio + 1;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '\\') {
      saida += desescapar(fonte[i], fonte[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === aspa) return { valor: saida, fim: i + 1 };
    if (c === '\n') return { valor: saida, fim: i };
    saida += c;
    i += 1;
  }
  return { valor: saida, fim: i };
}

// Dentro de `${ ... }` pode haver string, template aninhado, REGEX, comentário e
// chaves de objeto — contar chaves sozinho não basta, e o `}` de um template
// aninhado fecharia a expressão cedo. Por isso string, template e regex são
// consumidos inteiros, e comentário é pulado.
//
// O REGEX dentro da interpolação faltava, e a conta que isso custou: em
// `arena.js` a linha
//
//   `[${attr}="${String(node.getAttribute(attr)).replace(/(["\\\\])/g, '\\\\$1')}"]`
//
// tem uma classe de caractere com ASPAS. Sem saber ler regex aqui, o leitor
// entrava na aspa da classe como se fosse string, consumia o `"` de fechamento
// e o `{`/`}` da expressão saía de fase — a varredura do arquivo morria ali e
// NADA depois contava. Medido em 19/09/2026: `arena.js` "media" 691 palavras
// contra as 1346 do cartório, com o painel do professor inteiro (e os diálogos,
// que ficam depois) fora da régua. A guarda não reprovava porque a folga escrita
// do cartório cobria o buraco — folga que existe para outra coisa.
function lerTemplate(fonte, inicio) {
  let saida = '';
  let i = inicio + 1;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '\\') {
      saida += desescapar(fonte[i], fonte[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (c === '`') return { valor: saida, fim: i + 1 };
    if (c === '$' && fonte[i + 1] === '{') {
      i += 2;
      let nivel = 1;
      // A mesma pergunta do scanner de fora: `/` é divisão ou abre regex? Sem
      // esta marca, uma divisão viraria regex (inofensivo) e um regex com aspa
      // viraria string (o defeito descrito acima).
      let depoisDeValor = false;
      while (i < fonte.length && nivel > 0) {
        const d = fonte[i];
        if (d === '/' && fonte[i + 1] === '/') {
          const fim = fonte.indexOf('\n', i);
          i = fim < 0 ? fonte.length : fim + 1;
          continue;
        }
        if (d === '/' && fonte[i + 1] === '*') {
          const fim = fonte.indexOf('*/', i + 2);
          i = fim < 0 ? fonte.length : fim + 2;
          continue;
        }
        if (d === '\\') { i += 2; continue; }
        if (d === '{') { nivel += 1; i += 1; depoisDeValor = false; continue; }
        if (d === '}') { nivel -= 1; i += 1; depoisDeValor = false; continue; }
        if (d === '`') { i = lerTemplate(fonte, i).fim; depoisDeValor = true; continue; }
        if (d === '"' || d === "'") { i = lerAspas(fonte, i).fim; depoisDeValor = true; continue; }
        if (d === '/' && !depoisDeValor) { i = lerRegex(fonte, i); depoisDeValor = true; continue; }
        if (ehPalavra(d)) {
          let j = i;
          while (j < fonte.length && ehPalavra(fonte[j])) j += 1;
          depoisDeValor = !PALAVRAS_QUE_NAO_ABREM_REGEX.has(fonte.slice(i, j));
          i = j;
          continue;
        }
        if (/[0-9]/.test(d)) {
          let j = i;
          while (j < fonte.length && /[\w.]/.test(fonte[j])) j += 1;
          i = j;
          depoisDeValor = true;
          continue;
        }
        // ESPAÇO não apaga a marca. `a / b` tem divisão depois de um valor, e
        // com a marca zerada pelo espaço o leitor lia o `/` como ABERTURA de
        // regex — que então engolia `b}` até a quebra de linha e matava o
        // `}` que fecha a interpolação. O leitor saía de fase e o resto do
        // arquivo deixava de contar. Medido em 19/09/2026: a divisão
        // `${Math.round((entry.avg / 20) * 100)}` do relatório do painel
        // derrubava a varredura do `arena.js` dali para a frente.
        if (/\s/.test(d)) { i += 1; continue; }
        depoisDeValor = d === ')' || d === ']';
        i += 1;
      }
      continue;
    }
    saida += c;
    i += 1;
  }
  return { valor: saida, fim: i };
}

// `/` é divisão ou regex? O mesmo problema que qualquer ferramenta tem. A regra
// aqui é a clássica: depois de um VALOR (identificador, número, `)`, `]`,
// string) é divisão; em qualquer outro lugar abre regex. Importa porque uma
// regex pode conter aspa (`/['"]/`) e, lida como código comum, embaralharia a
// tokenização inteira a partir dali.
function lerRegex(fonte, inicio) {
  let i = inicio + 1;
  let dentroDeClasse = false;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '\n') return i;
    if (c === '[') dentroDeClasse = true;
    else if (c === ']') dentroDeClasse = false;
    else if (c === '/' && !dentroDeClasse) {
      i += 1;
      while (i < fonte.length && /[a-z]/i.test(fonte[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return i;
}

/**
 * Todos os literais de string/template de um arquivo JS, com comentário fora e
 * `${...}` removido (o que sobra é a parte estática do template — a que existe
 * na tela sem depender de dado).
 */
export function literaisDeCodigo(fonte) {
  const achados = [];
  let i = 0;
  let depoisDeValor = false;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '/' && fonte[i + 1] === '/') {
      const fim = fonte.indexOf('\n', i);
      i = fim < 0 ? fonte.length : fim + 1;
      continue;
    }
    if (c === '/' && fonte[i + 1] === '*') {
      const fim = fonte.indexOf('*/', i + 2);
      i = fim < 0 ? fonte.length : fim + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const lido = lerAspas(fonte, i);
      achados.push({ indice: i, valor: lido.valor });
      i = lido.fim;
      depoisDeValor = true;
      continue;
    }
    if (c === '`') {
      const lido = lerTemplate(fonte, i);
      achados.push({ indice: i, valor: lido.valor });
      i = lido.fim;
      depoisDeValor = true;
      continue;
    }
    if (c === '/' && !depoisDeValor) {
      i = lerRegex(fonte, i);
      depoisDeValor = true;
      continue;
    }
    if (ehPalavra(c)) {
      let j = i;
      while (j < fonte.length && ehPalavra(fonte[j])) j += 1;
      depoisDeValor = !PALAVRAS_QUE_NAO_ABREM_REGEX.has(fonte.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < fonte.length && /[\w.]/.test(fonte[j])) j += 1;
      i = j;
      depoisDeValor = true;
      continue;
    }
    // `}` fecha bloco ou objeto: na dúvida, NÃO é valor. Errar para este lado
    // lê `/\//` como regex (inofensivo) em vez de engolir código como se fosse
    // texto, que é o erro que corromperia a conta.
    //
    // ESPAÇO, porém, não decide nada: ele não apaga a marca do valor anterior.
    // Sem esta linha, `total / contagem` fora de expressão virava regex.
    if (/\s/.test(c)) { i += 1; continue; }
    depoisDeValor = c === ')' || c === ']';
    i += 1;
  }
  return achados;
}

const linhaDe = (fonte, indice) => fonte.slice(0, indice).split('\n').length;

// Só letras, números, espaço e a pontuação que a prosa deste produto usa de
// verdade (`—`, `·`, `:`, `?`, aspas tipográficas, `%`, `+`, `/` em "e/ou").
// `=`, `{`, `$`, `|`, `\`, `<`, `>` e `_` não aparecem em frase e aparecem muito
// em código, então qualquer um deles desqualifica o literal cru.
const PARECE_CODIGO = /[{}<>$=|\\_~^`]/;

// Valor de CSS não é frase: `'12px Google Sans, Arial, sans-serif'` é a fonte de
// um canvas, não texto de tela. A régua é estreita de propósito — a pilha de
// fontes e o literal começando em `Npx`. `%` e `em` ficam de fora porque são
// palavra e unidade de frase de verdade (`100% da turma`), e condená-los apagaria
// cópia viva.
const PARECE_VALOR_DE_CSS = /^(?:\d+(?:\.\d+)?px\b|serif\b|monospace\b)|sans-serif|monospace/;

// Seletor não é frase. `'.arena-side [data-arena-fold]'` tem duas palavras e
// nenhum caractere de código, então passava pela régua de prosa e inflava o
// orçamento do cliente — medido em 2026-09-15, quando exatamente esse literal
// entrou no `arena.js` e a guarda acusou +2 palavras que ninguém escreveu para a
// tela. A régua é estreita de propósito: nenhuma frase da tela começa em `.`,
// `#` ou `[`, e só seletor começa.
const PARECE_SELETOR = /^[.#[]/;

/**
 * Um literal é cópia se, e só se:
 *   - depois de tirar marcação e rótulos sobra texto; E
 *   - ele TINHA marcação (aí o texto é nó de texto: cópia por definição), ou
 *   - ele não tinha, mas parece prosa (sem caractere de código) com ao menos
 *     DUAS palavras.
 *
 * A assimetria é deliberada. Dentro de um fragmento de marcação o nó de texto é
 * sempre o que o humano lê, então um rótulo de uma palavra vale (`Desconsiderar`
 * é cópia). Fora da marcação não há como distinguir `'is-paused'` de
 * `'Tentativas'` pelo conteúdo, e o preço de tentar seria o orçamento disparar
 * quando alguém renomeasse uma classe. Duas palavras é o corte mais barato que
 * separa frase de identificador — e o defeito que motivou esta guarda é
 * explicativo, que nunca cabe em uma palavra.
 */
export function copiaDoLiteral(bruto) {
  const tinhaMarcacao = /<\/?[A-Za-z!]/.test(bruto);
  const texto = textoVisivel(bruto);
  if (!texto) return null;
  if (tinhaMarcacao) return texto;
  if (PARECE_CODIGO.test(texto)) return null;
  if (PARECE_VALOR_DE_CSS.test(texto)) return null;
  if (PARECE_SELETOR.test(texto)) return null;
  if (palavras(texto) < 2) return null;
  return texto;
}

/** A cópia que vive num bundle: os trechos e a soma. */
export function copiaDoCliente(fonte) {
  const trechos = [];
  for (const literal of literaisDeCodigo(fonte)) {
    const texto = copiaDoLiteral(literal.valor);
    if (texto) trechos.push({ linha: linhaDe(fonte, literal.indice), texto });
  }
  return { trechos, palavras: trechos.reduce((soma, t) => soma + palavras(t.texto), 0) };
}

// ---------------------------------------------------------------------------
// O texto que a API manda: a cópia que só existe depois de um fetch
// ---------------------------------------------------------------------------

/**
 * O TERCEIRO lado da cópia, e o que ficou aberto até set/2026: o texto que o
 * servidor entrega no JSON e a tela mostra depois. Ele não está em `telas` (não
 * existe na primeira pintura) nem em `cliente` (não é literal de bundle) — então
 * `mode_hint`, `cannot_reason` e `teach` apareciam na frente do aluno sem passar
 * por régua nenhuma. O corte de set/2026 mostrou o custo: o cliente foi enxugado
 * e a frase longa continuou viva no servidor, porque a versão visível vinha de lá.
 *
 * A MEDIÇÃO AQUI NÃO É VARREDURA DE LITERAL: é chamada do produtor. `drawView` e
 * os dois catálogos são puros — não leem disco, não gravam, não conhecem HTTP —,
 * então o instrumento pergunta ao servidor o que ele mandaria para a tela e conta
 * essas palavras. É o único jeito de enxergar uma dica que o cliente só interpola
 * (`${esc(draw.mode_hint)}`): no bundle não há texto nenhum para contar.
 */

/** Participantes das chamadas de `drawView` — os nomes não são cópia. */
const DOIS_PARTICIPANTES = [{ id: '1', name: 'Ana' }, { id: '2', name: 'Bruno' }];
const UM_PARTICIPANTE = [DOIS_PARTICIPANTES[0]];

/**
 * As fontes de texto de API que a guarda mede. Cada uma declara:
 *
 *   - `chave`: como o campo aparece no cartório (`sorteio.mode_hint`);
 *   - `origem`: o produtor no servidor, para o erro apontar o arquivo certo;
 *   - `onde`: em que ponto da tela esse texto cai;
 *   - `payload()`: as views que o servidor manda — chamadas reais do produtor;
 *   - `campos`: os campos cujo conteúdo é FRASE. São os medidos, com teto;
 *   - `rotulos`: os outros campos de texto do mesmo payload (chave, estado, nome
 *     de uma palavra), declarados para a cobertura poder ser exata: se um campo
 *     de texto novo aparecer no payload sem estar em nenhuma das duas listas, a
 *     guarda morde. Texto de tela não nasce sem orçamento.
 *   - `noCliente`: onde o cliente MOSTRA esse campo. É a prova de que o texto
 *     medido ainda chega à tela — campo medido que o cliente deixou de renderizar
 *     vira texto vivo no servidor sem ninguém ver, e a guarda avisa.
 */
export const FONTES_DA_API = Object.freeze([
  {
    chave: 'sorteio',
    origem: 'drawView (src/domain/arena-draw.mjs)',
    onde: 'pista e motivo do sorteio (painel, TV, aluno)',
    arquivoNoCliente: 'public/assets/js/arena.js',
    campos: [
      { nome: 'mode_hint', noCliente: 'draw.mode_hint' },
      { nome: 'cannot_reason', noCliente: 'draw.cannot_reason' },
    ],
    rotulos: ['mode', 'mode_label'],
    // Um caso por situação, não um por campo: cada um dos quatro motivos de
    // bloqueio é uma frase diferente na tela, e medir só o que coubesse num
    // estado deixaria três frases fora da conta.
    payload: () => [
      drawView(emptyDraw({ mode: 'livre' }), DOIS_PARTICIPANTES),
      drawView(emptyDraw({ mode: 'mata-mata' }), DOIS_PARTICIPANTES),
      drawView({ ...emptyDraw({ mode: 'mata-mata' }), champion: '1' }, DOIS_PARTICIPANTES),
      drawView({ ...emptyDraw({ mode: 'livre' }), current: { ids: ['1', '2'], at: 0 } }, DOIS_PARTICIPANTES),
      drawView({ ...emptyDraw({ mode: 'livre' }) }, UM_PARTICIPANTE),
      drawView({ ...emptyDraw({ mode: 'mata-mata' }), pool: ['1'] }, DOIS_PARTICIPANTES),
    ],
  },
  {
    chave: 'dinamica',
    origem: 'ARENA_DYNAMICS (src/domain/arena-mode.mjs)',
    onde: 'cartão do desafio coletivo (painel, TV, aluno)',
    arquivoNoCliente: 'public/assets/js/arena.js',
    campos: [
      { nome: 'label', noCliente: 'entry.label' },
      { nome: 'question', noCliente: 'dynamic.question' },
      { nome: 'teach', noCliente: 'entry.teach' },
    ],
    rotulos: ['key', 'kind', 'source'],
    payload: () => Object.values(ARENA_DYNAMICS),
  },
  {
    chave: 'poder',
    origem: 'ARENA_POWERS (src/domain/arena-mode.mjs)',
    onde: 'botões de energia (title e rótulo)',
    arquivoNoCliente: 'public/assets/js/arena.js',
    campos: [
      { nome: 'label', noCliente: 'power.label' },
      { nome: 'hint', noCliente: 'power.hint' },
    ],
    rotulos: ['key', 'glyph'],
    payload: () => Object.values(ARENA_POWERS),
  },
]);

/**
 * O texto de API medido: por campo (`sorteio.mode_hint`), com os trechos que o
 * servidor manda hoje. `textos` fica fora do cartório de propósito — o cartório
 * grava número, e a frase inteira é o que a tabela legível imprime para quem for
 * cortar (é o que denuncia a pista longa que sobreviveu no servidor).
 *
 * Cada FRASE distinta conta uma vez, mesmo que vários estados a carreguem: as seis
 * views do sorteio repetem o mesmo `mode_hint`, e somar as seis contaria a mesma
 * pista três vezes — o orçamento mediria a repetição do payload, não o que o aluno
 * lê.
 */
export function copiaDaApi() {
  const campos = {};
  const textos = {};
  for (const fonte of FONTES_DA_API) {
    for (const campo of fonte.campos) {
      const chave = `${fonte.chave}.${campo.nome}`;
      campos[chave] = {
        origem: fonte.origem,
        campo: campo.nome,
        onde: fonte.onde,
        mostraEm: `${fonte.arquivoNoCliente}:${campo.noCliente}`,
        arquivoNoCliente: fonte.arquivoNoCliente,
        referenciaNoCliente: campo.noCliente,
        palavras: 0,
        trechos: 0,
      };
      textos[chave] = [];
    }
  }

  for (const fonte of FONTES_DA_API) {
    for (const view of fonte.payload()) {
      for (const campo of fonte.campos) {
        const texto = String(view?.[campo.nome] ?? '').trim();
        if (!texto) continue;
        const chave = `${fonte.chave}.${campo.nome}`;
        if (textos[chave].includes(texto)) continue;
        textos[chave].push(texto);
        campos[chave].palavras += palavras(texto);
        campos[chave].trechos += 1;
      }
    }
  }

  const soma = Object.values(campos).reduce((total, dados) => total + dados.palavras, 0);
  return { campos, textos, soma: { palavras: soma } };
}

/**
 * Os nomes de campo de TEXTO que o produtor de fato manda. É o lado da cobertura:
 * a guarda compara isto com `campos` + `rotulos` da declaração, então um campo
 * novo no payload (uma dica a mais numa dinâmica, por exemplo) reprova até alguém
 * declarar se ele é frase — que entra na conta — ou rótulo.
 *
 * Conta campo de texto no NÍVEL de cima, que é onde mora a cópia; objeto aninhado
 * traz nome de participante, não texto de tela.
 */
export function camposDeTextoDaApi(fonte) {
  const nomes = new Set();
  for (const view of fonte.payload()) {
    if (!view || typeof view !== 'object') continue;
    for (const [chave, valor] of Object.entries(view)) if (typeof valor === 'string') nomes.add(chave);
  }
  return [...nomes].sort();
}

/**
 * As frases de API que aparecem TAMBÉM como literal no cliente — o mesmo texto em
 * dois lugares, um deles invisível para a régua. Hoje são zero; se aparecer uma, o
 * defeito não é orçamento, é duplicação de fonte (o aluno lê duas vezes e a próxima
 * edição conserta um lado só). Serve à tabela legível, não reprova nada.
 */
export function replicasDaApi(raiz) {
  const normalizar = (texto) => texto.toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, ' ').trim();
  const doCliente = new Set();
  for (const nome of readdirSync(new URL(`${DIRETORIO_DO_CLIENTE}/`, raiz))) {
    if (!nome.endsWith('.js')) continue;
    for (const trecho of copiaDoCliente(ler(raiz, `${DIRETORIO_DO_CLIENTE}/${nome}`)).trechos) {
      doCliente.add(normalizar(trecho.texto));
    }
  }
  const achadas = [];
  for (const [chave, textos] of Object.entries(copiaDaApi().textos)) {
    for (const texto of textos) if (doCliente.has(normalizar(texto))) achadas.push({ chave, texto });
  }
  return achadas;
}

// ---------------------------------------------------------------------------
// Inventário
// ---------------------------------------------------------------------------

const ler = (raiz, caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

/** Os bundles que uma tela carrega, lidos do próprio HTML servido. */
export function bundlesDe(html) {
  return [...new Set([...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].split('?')[0]))]
    .filter((caminho) => caminho.startsWith('/'))
    .map((caminho) => caminho.slice(1))
    .sort();
}

/** Quantas palavras visíveis tem uma página do site base congelado. */
export function palavrasDoSiteBase(raiz, caminho) {
  return palavras(textoVisivel(ler(raiz, `evidence/original-public/${caminho}`)));
}

/** As rotas que o roteador conhece, lidas do fonte — para a guarda de cobertura. */
export function rotasDoRoteador(raiz) {
  const fonte = ler(raiz, 'src/web/pages/index.mjs');
  return [...new Set([...fonte.matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]))].sort();
}

export function inventario(raiz) {
  const api = copiaDaApi();
  const telas = {};
  for (const tela of TELAS) {
    const resposta = renderPage(tela.rotas[0], { authenticated: tela.autenticada });
    const texto = textoVisivel(resposta.body);
    telas[tela.nome] = {
      rotas: tela.rotas,
      autenticada: tela.autenticada,
      status: resposta.status,
      palavras: palavras(texto),
      bundles: resposta.status === 200 ? bundlesDe(resposta.body) : [],
    };
  }

  const cliente = {};
  const arquivosDoCliente = readdirSync(new URL(`${DIRETORIO_DO_CLIENTE}/`, raiz))
    .filter((nome) => nome.endsWith('.js'))
    .sort();
  for (const nome of arquivosDoCliente) {
    const caminho = `${DIRETORIO_DO_CLIENTE}/${nome}`;
    const { trechos, palavras: total } = copiaDoCliente(ler(raiz, caminho));
    cliente[caminho] = { palavras: total, trechos: trechos.length };
  }

  return { telas, cliente, api };
}

/** A linha de base, lida da captura a cada execução (nunca digitada à mão). */
export function linhaDeBase(raiz) {
  const telas = {};
  for (const tela of TELAS) {
    const caminho = BASES[tela.nome] ?? null;
    telas[tela.nome] = caminho === null ? null : palavrasDoSiteBase(raiz, caminho);
  }
  const cliente = BASE_DO_CLIENTE.arquivos.reduce(
    (soma, caminho) => soma + copiaDoCliente(ler(raiz, `evidence/original-public/${caminho}`)).palavras,
    0,
  );
  return { telas, cliente: { arquivos: BASE_DO_CLIENTE.arquivos, palavras: cliente } };
}

/**
 * O cartório como ele deve ficar hoje: o medido de cada tela e de cada bundle,
 * a linha de base recomputada da captura e o teto.
 *
 * `anterior` é o cartório que já está gravado, e ele entra por um motivo só: o
 * que já foi DECIDIDO não se perde na regravação. O teto acompanha o medido para
 * BAIXO — regravar depois de um corte aperta a guarda, que é o ponto da régua — e
 * nunca sobe sozinho: uma folga deliberada sobrevive apenas quando está escrita,
 * isto é, quando o teto anterior está acima do medido E tem `nota` que a
 * justifica (o mesmo par que a guarda exige). Sem a `nota`, teto estale é teto
 * que cai para o medido.
 *
 * `nota` e `contexto` são coisas diferentes, e é por isso que são campos
 * diferentes: `nota` JUSTIFICA folga (teto acima do medido, lida pela guarda) e
 * `contexto` REGISTRA o que a régua não vê — por exemplo que o que passa do site
 * base é rótulo de tela que o original não tinha. Escrever um contexto não sobe
 * nem segura teto nenhum: só o `nota` faz isso, e só enquanto o teto estiver
 * de fato acima do medido.
 */
export function cartorio(raiz, anterior = null) {
  const { telas, cliente, api } = inventario(raiz);
  const base = linhaDeBase(raiz);
  const novo = { telas: {}, cliente: { soma: {}, bundles: {} }, api: { soma: {}, campos: {} } };

  for (const [nome, dados] of Object.entries(telas)) {
    const antes = anterior?.telas?.[nome];
    const folgaEscrita = typeof antes?.nota === 'string' && antes.nota.trim() && (antes?.teto ?? 0) > dados.palavras;
    novo.telas[nome] = {
      rotas: dados.rotas,
      status: dados.status,
      palavras: dados.palavras,
      base: base.telas[nome],
      teto: folgaEscrita ? antes.teto : dados.palavras,
      bundles: dados.bundles,
    };
    if (antes?.nota) novo.telas[nome].nota = antes.nota;
    if (antes?.contexto) novo.telas[nome].contexto = antes.contexto;
  }

  const soma = Object.values(cliente).reduce((total, dados) => total + dados.palavras, 0);
  const somaAntes = anterior?.cliente?.soma;
  const folgaDaSoma = typeof somaAntes?.nota === 'string' && somaAntes.nota.trim() && (somaAntes?.teto ?? 0) > soma;
  novo.cliente.soma = {
    palavras: soma,
    base: base.cliente.palavras,
    teto: folgaDaSoma ? somaAntes.teto : soma,
  };
  for (const [caminho, dados] of Object.entries(cliente)) {
    const antes = anterior?.cliente?.bundles?.[caminho];
    const folgaEscrita = typeof antes?.nota === 'string' && antes.nota.trim() && (antes?.teto ?? 0) > dados.palavras;
    novo.cliente.bundles[caminho] = {
      palavras: dados.palavras,
      trechos: dados.trechos,
      teto: folgaEscrita ? antes.teto : dados.palavras,
    };
    if (antes?.nota) novo.cliente.bundles[caminho].nota = antes.nota;
    if (antes?.contexto) novo.cliente.bundles[caminho].contexto = antes.contexto;
  }
  if (somaAntes?.nota) novo.cliente.soma.nota = somaAntes.nota;
  if (somaAntes?.contexto) novo.cliente.soma.contexto = somaAntes.contexto;

  // O texto de API entra na régua com o mesmo mecanismo do resto: teto por campo,
  // catraca para baixo, `nota` para segurar folga. A diferença é que aqui cada
  // campo tem nome — `sorteio.mode_hint` —, então a reprovação diz QUAL dica
  // cresceu e onde ela aparece, em vez de apontar um arquivo inteiro.
  for (const [chave, dados] of Object.entries(api.campos)) {
    const antes = anterior?.api?.campos?.[chave];
    const folgaEscrita = typeof antes?.nota === 'string' && antes.nota.trim() && (antes?.teto ?? 0) > dados.palavras;
    novo.api.campos[chave] = {
      origem: dados.origem,
      campo: dados.campo,
      onde: dados.onde,
      mostraEm: dados.mostraEm,
      palavras: dados.palavras,
      trechos: dados.trechos,
      teto: folgaEscrita ? antes.teto : dados.palavras,
    };
    if (antes?.nota) novo.api.campos[chave].nota = antes.nota;
    if (antes?.contexto) novo.api.campos[chave].contexto = antes.contexto;
  }
  const somaDaApi = api.soma.palavras;
  const apiAntes = anterior?.api?.soma;
  const folgaDaApi = typeof apiAntes?.nota === 'string' && apiAntes.nota.trim() && (apiAntes?.teto ?? 0) > somaDaApi;
  novo.api.soma = { palavras: somaDaApi, teto: folgaDaApi ? apiAntes.teto : somaDaApi };
  if (apiAntes?.nota) novo.api.soma.nota = apiAntes.nota;
  if (apiAntes?.contexto) novo.api.soma.contexto = apiAntes.contexto;
  return novo;
}

/**
 * A tabela que um humano lê — é o "inventário" pedido, em texto.
 *
 * O TETO vem do CARTÓRIO quando ele é passado, e não de uma conta local: quem
 * defende a régua é `test/copia/orcamento.json` (com catraca e `nota`), e uma
 * tabela que mostrasse `max(medido, site base)` diria que a tela do aluno tem
 * folga até 290 quando a guarda reprova a partir de 148. Número que o humano lê
 * tem de ser o mesmo número que a guarda usa.
 */
export function relatarTabela({ telas, cliente, api }, base, cartorio = null) {
  const linhas = [];
  const largura = Math.max(...Object.keys(telas).map((n) => n.length), 20);
  linhas.push(`TELA${' '.repeat(Math.max(1, largura - 3))}  HOJE  BASE  TETO`);
  for (const [nome, dados] of Object.entries(telas)) {
    const linhaBase = base.telas[nome];
    const teto = cartorio?.telas?.[nome]?.teto ?? null;
    linhas.push(
      `${nome.padEnd(largura)}  ${String(dados.palavras).padStart(4)}  ` +
        `${linhaBase === null ? '  --' : String(linhaBase).padStart(4)}  ` +
        `${(teto === null ? '  --' : String(teto)).padStart(4)}`,
    );
  }
  linhas.push('');
  const larguraC = Math.max(...Object.keys(cliente).map((n) => n.length), 20);
  const totalC = Object.values(cliente).reduce((soma, dados) => soma + dados.palavras, 0);
  linhas.push(`CLIENTE (família)  hoje ${totalC}  base ${base.cliente.palavras}  (${base.cliente.arquivos.join(', ')})`);
  linhas.push('');
  linhas.push(`BUNDLE${' '.repeat(Math.max(1, larguraC - 5))}  HOJE  TRECHOS`);
  for (const [caminho, dados] of Object.entries(cliente)) {
    linhas.push(
      `${caminho.padEnd(larguraC)}  ${String(dados.palavras).padStart(4)}  ${String(dados.trechos).padStart(7)}`,
    );
  }

  linhas.push('');
  linhas.push(`API (texto que o servidor manda e a tela mostra depois)  hoje ${api.soma.palavras}`);
  const larguraA = Math.max(...Object.keys(api.campos).map((n) => n.length), 20);
  linhas.push(`CAMPO${' '.repeat(Math.max(1, larguraA - 5))}  HOJE  TETO  TRE  ONDE NA TELA`);
  for (const [chave, dados] of Object.entries(api.campos)) {
    const teto = cartorio?.api?.campos?.[chave]?.teto ?? null;
    linhas.push(
      `${chave.padEnd(larguraA)}  ${String(dados.palavras).padStart(4)}  ` +
        `${(teto === null ? '  --' : String(teto)).padStart(4)}  ` +
        `${String(dados.trechos).padStart(3)}  ${dados.onde}`,
    );
  }
  return linhas.join('\n');
}
