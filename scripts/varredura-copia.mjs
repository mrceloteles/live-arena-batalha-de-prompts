// A varredura de cópia, TELA POR TELA — a fila de corte de cada superfície viva.
//
//   node scripts/varredura-copia.mjs
//
// A pergunta aqui é diferente da que o inventário responde. O inventário
// (`scripts/inventario-copia.mjs`) dá os NÚMEROS: quantas palavras cada tela
// entrega, quanto o site base entregava e qual é o teto. Esta varredura dá a FILA:
// quais strings de cada tela são candidatas, em que linha elas estão, e que defeitos
// de duplicação a tela carrega.
//
// Quem julga é a skill `.agents/skills/copia-de-interface/SKILL.md` — ela decide se
// a frase é filler, fato ou explicação compensando um controle ambíguo. A varredura
// é o cursor: diz ONDE olhar, não o que cortar. Sem ela, revisar tela por tela
// significa abrir o navegador e ler tudo à mão; com ela, sai de uma execução.
//
// A ATRIBUIÇÃO É POR FUNÇÃO DO TEMPLATE, não por string solta: cada tela tem a sua
// função em `src/web/pages/index.mjs` (`indexPage` é o portal, `arenaPage` é a tela
// do aluno, e por aí), e o que está fora de todas elas é cromo compartilhado —
// `brandLogo`, `shell` — que aparece em toda tela e não é fila de nenhuma. Atribuir
// por busca de texto dava falso positivo grosseiro: "ARENA" do wordmark entrava como
// réplica de qualquer tela.
//
// Três coisas por tela:
//
//   - CANDIDATAS: strings com 4+ palavras que terminam em pontuação de frase. É o
//     critério de "frase" do perfil do inventário, grosseiro de propósito — frase é
//     candidata, rótulo é o preço da tela existir.
//   - RÉPLICAS: a mesma string em duas linhas da mesma tela ("réplica conta como
//     duas": o inventário conta as duas, o olho não).
//   - DIVERGÊNCIAS e IGUAIS servidor×cliente: elementos `data-*` que o cliente
//     reescreve. DIVERGE é defeito na tela (foi assim que "Fique de olho na tela!"
//     sobreviveu ao corte de set/2026: saiu do cliente, ficou no HTML do servidor, e
//     é o que o aluno lê antes de o script rodar — nenhuma guarda de teto pega,
//     porque o texto não cresceu, só ficou desencontrado). IGUAL é a lista do que
//     todo corte futuro precisa acertar nos dois arquivos.
//
// Limites declarados: a leitura é por linha do fonte (nó de texto quebrado em várias
// linhas não é remontado), e duas ocorrências na MESMA linha contam uma vez.
import { readFileSync } from 'node:fs';

import { TELAS, decodificar, textoVisivel } from '../test/support/copia.mjs';
import { renderPage } from '../src/web/pages/index.mjs';

const RAIZ = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, RAIZ), 'utf8');

const PAGINA = 'src/web/pages/index.mjs';
const CLIENTE = 'public/assets/js/arena.js';

/** Qual função do template serve cada tela (o resto é cromo compartilhado). */
const FUNCAO_DA_TELA = {
  portal: 'indexPage',
  'projecao-da-tv': 'tvPage',
  'previa-da-tv': 'tvPage',
  'entrada-do-aluno': 'arenaPage',
  'previa-do-aluno': 'arenaPage',
  'painel-login': 'adminLoginPage',
  'painel-do-professor': 'adminArenaPage',
  relatorio: 'reportPage',
  'pagina-nao-encontrada': null,
};

const palavras = (texto) =>
  texto.split(/\s+/).filter((token) => (token.match(/[A-Za-zÀ-ÿ0-9]/g) ?? []).length >= 2).length;

const normalizar = (texto) => texto.toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, ' ').trim();
const ehFrase = (texto) => palavras(texto) >= 4 && /[.!?…]$/.test(texto.trim());

/**
 * Os nós de texto e rótulos visíveis de uma linha do fonte, com a PROCEDÊNCIA.
 *
 * A procedência importa para a réplica: `aria-label`/`alt`/`title` que espelham o
 * título visível são prática correta de acessibilidade, não a mesma instrução duas
 * vezes na tela (o leitor vê o `<h2>`; o leitor de tela ouve o `aria-label`).
 */
function trechosDaLinha(linha) {
  const achados = [
    ...[...linha.matchAll(/>([^<>]+)</g)].map((m) => ({ texto: m[1], tipo: 'texto' })),
    ...[...linha.matchAll(/(?:placeholder|title|aria-label|alt)="([^"]*)"/g)].map((m) => ({
      texto: m[1],
      tipo: 'acessivel',
    })),
  ];
  const vistos = new Set();
  return achados
    .map((achado) => ({ ...achado, texto: decodificar(achado.texto).trim() }))
    .filter((achado) => {
      if (!achado.texto || !/[\p{L}\p{N}]/u.test(achado.texto) || achado.texto.includes('${')) return false;
      const chave = `${achado.tipo}:${achado.texto}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

/** Como o elemento se apresenta naquela linha — para o juiz saber o que é o quê. */
function contexto(linha) {
  const classe = linha.match(/class="([^"]+)"/);
  if (classe) return classe[1].split(/\s+/)[0];
  return (linha.match(/<([a-z0-9]+)/i) ?? [, '?'])[1];
}

/** O intervalo de linhas de cada função do template (`function nome(...)`). */
function intervalos(fonte) {
  const marcas = [...fonte.matchAll(/^function ([A-Za-z]+)\(/gm)].map((m) => ({ nome: m[1], linha: m.index }));
  const linhas = (indice) => fonte.slice(0, indice).split('\n').length;
  return marcas.map((marca, indice) => ({
    nome: marca.nome,
    de: linhas(marca.linha),
    ate: indice + 1 < marcas.length ? linhas(marcas[indice + 1].linha) - 1 : fonte.split('\n').length,
  }));
}

/**
 * O que o cliente escreve por cima de um elemento `data-*` do servidor.
 *
 * A leitura começa DEPOIS do seletor (senão o próprio `'[data-x]'` vira literal) e
 * vai até o `;` da atribuição, pegando TODOS os literais dela — o cliente escreve
 * texto por ternário (`finished ? 'a' : 'b'`), e ler só a primeira string daria
 * divergência onde há concordância. O nome do elemento vem de `[data-x]` sem exigir
 * `=`, já que `data-arena-empty-text` é atributo booleano.
 */
function sobrescritas(fonteDoCliente) {
  const mapa = new Map();
  for (const achado of fonteDoCliente.matchAll(/\[data-([a-z-]+)\]/g)) {
    const fimDoSeletor = achado.index + achado[0].length;
    const atePontoEVirgula = fonteDoCliente.slice(fimDoSeletor, fimDoSeletor + 400).split(';')[0];
    if (!/\.(?:textContent|innerHTML)\s*=/.test(atePontoEVirgula)) continue;
    const expressao = atePontoEVirgula.slice(atePontoEVirgula.indexOf('=') + 1);
    const textos = [...expressao.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)]
      .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').trim())
      .filter((texto) => texto && !texto.includes('${') && /[A-Za-zÀ-ÿ]/.test(texto));
    mapa.set(achado[1], [...(mapa.get(achado[1]) ?? []), ...textos]);
  }
  return mapa;
}

const fonteDaPagina = ler(PAGINA);
const fonteDoCliente = ler(CLIENTE);
const linhas = fonteDaPagina.split('\n');
const faixas = intervalos(fonteDaPagina);
const porCima = sobrescritas(fonteDoCliente);

let totalCandidatas = 0;
let totalReplicas = 0;
let totalDivergencias = 0;
let totalIguais = 0;

for (const tela of TELAS) {
  const resposta = renderPage(tela.rotas[0], { authenticated: tela.autenticada });
  const visivel = textoVisivel(resposta.body);
  const faixa = faixas.find((f) => f.nome === FUNCAO_DA_TELA[tela.nome]);

  const daTela = [];
  if (faixa) {
    for (let numero = faixa.de; numero <= faixa.ate; numero += 1) {
      for (const trecho of trechosDaLinha(linhas[numero - 1] ?? '')) daTela.push({ ...trecho, linha: numero });
    }
  }

  const frases = daTela
    .filter((t) => ehFrase(t.texto))
    .sort((a, b) => palavras(b.texto) - palavras(a.texto));

  // Réplica: a mesma string visível em dois elementos da mesma tela. Fora daqui
  // ficam três coisas, e cada uma por um motivo: rótulo de acessibilidade que
  // espelha o título (prática correta, não repetição), string de UMA palavra
  // (cabeçalho de tabela repetido é preço da tela, não defeito) e a variação que
  // não é réplica nenhuma — mesma coisa escrita diferente, que é outro defeito.
  const visiveis = daTela.filter((t) => t.tipo === 'texto');
  const contagem = new Map();
  for (const trecho of visiveis) {
    const chave = normalizar(trecho.texto);
    contagem.set(chave, [...(contagem.get(chave) ?? []), trecho]);
  }
  const repetidas = [...contagem.values()].filter(
    (lista) => new Set(lista.map((t) => t.linha)).size > 1 && palavras(lista[0].texto) >= 3,
  );
  const replicas = repetidas.filter((lista) => new Set(lista.map((t) => t.texto)).size === 1);
  const nomeDiferente = repetidas.filter((lista) => new Set(lista.map((t) => t.texto)).size > 1);

  const divergencias = [];
  const iguais = new Set();
  const linhaDe = (numero) => linhas[numero - 1] ?? '';
  for (const trecho of daTela) {
    // `data-x` é atributo booleano com frequência: casa com ou sem `=`.
    for (const atributo of [...linhaDe(trecho.linha).matchAll(/data-([a-z-]+)(?:=|[\s>])/g)].map((m) => m[1])) {
      const doCliente = porCima.get(atributo) ?? [];
      if (!doCliente.length) continue;
      if (doCliente.some((texto) => normalizar(texto) === normalizar(trecho.texto))) {
        iguais.add(`[data-${atributo}]`);
      } else if (palavras(trecho.texto) >= 3) {
        // Só é divergência de CÓPIA quando os dois lados dizem uma frase. Elemento
        // cujo texto do servidor é rótulo curto (`MISSAO`, `SUA NOTA`) e o cliente
        // preenche com valor dinâmico (`ADIVINHE O PROMPT`) é o esqueleto
        // funcionando, não texto desencontrado.
        divergencias.push({ atributo, servidor: trecho.texto, cliente: doCliente.join(' | '), linha: trecho.linha });
      }
    }
  }

  totalCandidatas += frases.length;
  totalReplicas += replicas.length + nomeDiferente.length;
  totalDivergencias += divergencias.length;
  totalIguais += iguais.size;

  console.log(`\n===== ${tela.nome}  (${tela.rotas.join(', ')}${tela.autenticada ? ', autenticada' : ''}) =====`);
  console.log(
    `  palavras visíveis hoje: ${palavras(visivel)} · nós de texto: ${daTela.length} · ` +
      (faixa ? `template: ${faixa.nome} (L${faixa.de}-${faixa.ate})` : 'sem template próprio (fallback)'),
  );

  const ondeEsta = (trecho) => `L${trecho.linha}[${contexto(linhaDe(trecho.linha))}]`;

  if (frases.length === 0) console.log('  candidatas (frases): nenhuma');
  for (const frase of frases) {
    const marca = frase.tipo === 'acessivel' ? '  (rótulo acessível)' : '';
    console.log(
      `  candidata  L${String(frase.linha).padStart(3)}  (${palavras(frase.texto)})  ${frase.texto}${marca}`,
    );
  }
  for (const lista of replicas) {
    console.log(`  réplica    ${lista.map(ondeEsta).join(' + ')}  "${lista[0].texto}"`);
  }
  for (const lista of nomeDiferente) {
    console.log(
      `  nome difere ${lista.map(ondeEsta).join(' + ')}  ` +
        lista.map((t) => `"${t.texto}"`).join(' vs '),
    );
  }
  for (const divergencia of divergencias) {
    console.log(
      `  DIVERGE    L${divergencia.linha}  [data-${divergencia.atributo}]\n` +
        `        servidor: "${divergencia.servidor}"\n` +
        `        cliente : "${divergencia.cliente}"  (${CLIENTE})`,
    );
  }
  if (iguais.size) {
    console.log(`  igual no cliente (corte tem de acertar os DOIS arquivos): ${[...iguais].join(' ')}`);
  }
}

console.log(
  `\n---\nTelas varridas: ${TELAS.length} · frases candidatas: ${totalCandidatas} · ` +
    `réplicas: ${totalReplicas} · divergências servidor×cliente: ${totalDivergencias} · ` +
    `elementos duplicados no cliente: ${totalIguais}\n` +
    `Arquivo do template: ${PAGINA} · cliente: ${CLIENTE} (1 bundle serve 6 telas).\n\n` +
    'Quem julga o que cortar é a skill .agents/skills/copia-de-interface/SKILL.md — esta varredura é o cursor.\n' +
    'Números por tela (medido, site base, teto): node scripts/inventario-copia.mjs',
);
