// Quem pode produzir uma classe nas telas vivas — e que seletor das folhas
// carregadas fala de classe que ninguém produz.
//
// É o critério da fase 2 da faxina de CSS, sem a fonte que precisava de
// navegador. O instrumento daquela fase cruzava DUAS fontes e só condenava um
// seletor quando as duas diziam não:
//
//   1. o DOM das telas vivas (os retratos do portão 2) — é o que pega a classe
//      montada por concatenação, que não aparece inteira em fonte nenhuma;
//   2. as fontes que montam tela — `src/**` e `public/assets/js/**`.
//
// Aqui sobra só a segunda, e ela basta: com o inventário do DOM DESLIGADO o
// resultado daquela fase também era zero. O que restou nas cinco folhas é
// produzível só pelo código que roda, então a guarda pode ser exata sem
// navegador, em milissegundos, e roda no CI Linux.
//
// "Fonte viva" é o que o app executa (servidor) ou serve (cliente): `src/**` e
// `public/assets/js/**`. A definição mora AQUI e é importada por
// `test/web/rotas-retiradas.test.mjs` — duas definições de "fonte viva"
// divergiriam em silêncio na primeira vez que alguém renomeasse um diretório.
// Testes, `docs/`, `tmp/` e a captura (`evidence/`) ficam fora de propósito — a
// captura é o registro de fidelidade e precisa manter as classes clássicas
// inteiras, e a folha capturada `app.css` não é folha carregada.
//
// A régua é deliberadamente CONSERVADORA na dúvida: o nome da classe pode vir de
// variável, de concatenação ou de interpolação, então o teste é por substring no
// texto cru (comentário incluído). Um comentário que cite uma classe só faz a
// regra ficar — e nunca faz uma regra viva ser acusada. O preço é conhecido e
// aceito: `.card` é considerado produzido se a palavra `card` aparecer em
// qualquer lugar de qualquer fonte, mesmo dentro de outra palavra.

import { readFileSync, readdirSync } from 'node:fs';

import { analisarRegras, semCr } from './cascata-css.mjs';

/** Onde vive o código que o app executa (servidor) ou serve (cliente). */
export const DIRETORIOS = ['src', 'public/assets/js'];

/**
 * Arquivos que o app serve ou executa para montar/animar uma tela viva,
 * relativos à raiz do projeto e ordenados.
 */
export function fontesVivas(raiz) {
  const arquivos = [];
  for (const diretorio of DIRETORIOS) {
    for (const entrada of readdirSync(new URL(`${diretorio}/`, raiz), { recursive: true })) {
      const caminho = `${diretorio}/${entrada}`.replaceAll('\\', '/');
      if (/\.(?:mjs|js)$/.test(caminho)) arquivos.push(caminho);
    }
  }
  return arquivos.sort();
}

export function lerFontes(raiz) {
  return fontesVivas(raiz).map((arquivo) => ({
    arquivo,
    texto: readFileSync(new URL(arquivo, raiz), 'utf8'),
  }));
}

// Família montada em runtime: `arena-tv-${estado}`, `'is-' + tipo`,
// `` `pos-` + indice ``. É o que libera a família inteira (`.arena-tv-pulse`),
// porque o nome final só existe no navegador — e os valores de dado (estado,
// tipo, índice) vêm do banco ou do professor, então exigir o nome exato no
// código seria impossível. Sem esta regra a guarda reprovaria CSS vivo.
const PREFIXO_DE_INTERPOLACAO = /([a-zA-Z][\w-]*-)(?:\$\{|' \+|` \+)/g;

export function prefixosDeInterpolacao(texto) {
  return [...new Set([...texto.matchAll(PREFIXO_DE_INTERPOLACAO)].map((m) => m[1]))];
}

/** O predicado: a classe aparece inteira em alguma fonte, ou abre uma família. */
export function produtorDe(fontes) {
  const texto = fontes.map((f) => f.texto).join('\n');
  const prefixos = prefixosDeInterpolacao(texto);
  return {
    texto,
    prefixos,
    produz: (classe) => texto.includes(classe) || prefixos.some((p) => classe.startsWith(p)),
  };
}

const CLASSE = /\.([a-zA-Z][\w-]*)/g;
const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * As classes de UM seletor (já sem as vírgulas), com um cuidado com `:not(...)`:
 * ali dentro a classe é condição de AUSÊNCIA — o elemento tem de NÃO ter `.x` —,
 * então ela não é uma classe que a regra exige e não pode condenar o seletor.
 *
 * `:is(...)` e `:where(...)` ficam de fora do cuidado de propósito: ali a classe
 * é alternativa que a regra exige, e um ramo sem produtor é superfície morta de
 * verdade — é assim que a fase 2 cortou, e é assim que a guarda acusa.
 */
export function classesDe(seletor) {
  return [...new Set([...semNegativas(seletor).matchAll(CLASSE)].map((m) => m[1]))];
}

/** Remove `:not(...)` inteiro, contando parênteses (pode haver `:is(` dentro). */
function semNegativas(seletor) {
  let saida = '';
  let i = 0;
  while (i < seletor.length) {
    const abre = /^:not\(/i.exec(seletor.slice(i));
    if (abre) {
      let nivel = 1;
      let j = i + abre[0].length;
      while (j < seletor.length && nivel > 0) {
        if (seletor[j] === '(') nivel += 1;
        else if (seletor[j] === ')') nivel -= 1;
        j += 1;
      }
      i = j;
      continue;
    }
    saida += seletor[i];
    i += 1;
  }
  return saida;
}

/** Quebra um prelúdio em seletores de topo: vírgulas fora de `()`/`[]`/aspas. */
export function compostosDe(seletor) {
  const saida = [];
  let inicio = 0;
  let profundidade = 0;
  let aspa = null;
  for (let i = 0; i <= seletor.length; i += 1) {
    const c = seletor[i];
    if (aspa) {
      if (c === aspa) aspa = null;
      continue;
    }
    if (c === '"' || c === "'") aspa = c;
    else if (c === '(' || c === '[') profundidade += 1;
    else if (c === ')' || c === ']') profundidade -= 1;
    else if ((c === ',' && profundidade === 0) || i === seletor.length) {
      const corpo = seletor.slice(inicio, i).trim();
      if (corpo) saida.push(corpo);
      inicio = i + 1;
    }
  }
  return saida;
}

const seletorDe = (chave) => chave.slice(chave.indexOf('||') + 2);
const contextoDe = (chave) => chave.slice(0, chave.indexOf('||'));

// Acima disto a linha é minificada (a `app-authorial.css` abre com uma linha de
// ~20 KB). Linha sozinha não localiza nada ali, então o relato acrescenta a
// coluna — `arquivo:linha:coluna` é o endereço que o editor entende.
const LINHA_MINIFICADA = 200;

/**
 * Onde `.classe` aparece pela primeira vez na folha: `{ linha, coluna }`
 * (1-based), ou `null` se a folha não escreve a classe.
 */
export function localizar(texto, classe) {
  const normalizado = semCr(texto);
  const achado = new RegExp(`\\.${escapar(classe)}(?![\\w-])`).exec(normalizado);
  if (!achado) return null;
  const inicio = normalizado.lastIndexOf('\n', achado.index) + 1;
  const fim = normalizado.indexOf('\n', achado.index);
  return {
    linha: normalizado.slice(0, achado.index).split('\n').length,
    coluna: achado.index - inicio + 1,
    minificada: (fim < 0 ? normalizado.length : fim) - inicio > LINHA_MINIFICADA,
  };
}

/**
 * Percorre as folhas e devolve os seletores que exigem classe que nenhuma fonte
 * viva produz. Só conta seletor com PELO MENOS uma classe: tipo, atributo e
 * pseudo (`body`, `[data-admin-panel]`, `:hover`) casam sem classe nenhuma e
 * nunca são superfície morta.
 */
export function compostosSemProdutor(folhas, fontes) {
  const { produz, prefixos } = produtorDe(fontes);
  const achados = [];
  const porFolha = {};
  let analisados = 0;
  for (const folha of folhas) {
    porFolha[folha.nome] = 0;
    for (const regra of analisarRegras(semCr(folha.texto))) {
      for (const composto of compostosDe(seletorDe(regra.key))) {
        const classes = classesDe(composto);
        if (!classes.length) continue;
        analisados += 1;
        porFolha[folha.nome] += 1;
        const orfas = classes.filter((classe) => !produz(classe));
        if (!orfas.length) continue;
        achados.push({
          folha: folha.nome,
          contexto: contextoDe(regra.key),
          composto,
          orfas,
          local: localizar(folha.texto, orfas[0]),
        });
      }
    }
  }
  return { achados, analisados, porFolha, prefixos };
}

/** Relato legível: endereço, seletor e as classes que ninguém produz. */
export function relatar(achados, limite = 20) {
  return achados
    .slice(0, limite)
    .map((a) => {
      const { local } = a;
      const onde = !local
        ? a.folha
        : local.minificada
          ? `${a.folha}:${local.linha}:${local.coluna}`
          : `${a.folha}:${local.linha}`;
      const contexto = a.contexto ? ` @ ${a.contexto}` : '';
      return (
        `  ${onde}${contexto}\n` +
        `    ${a.composto}\n` +
        `      sem produtor: ${a.orfas.map((c) => `.${c}`).join(' ')}`
      );
    })
    .join('\n');
}
