// O atributo `hidden` vence a propriedade `display`?
//
// POR QUE ESTE PORTÃO EXISTE. `[hidden]` não é magia: o navegador o implementa
// como regra de folha do usuário — origem mais fraca que qualquer folha nossa.
// Qualquer `display` de AUTOR que case com o elemento ganha do `[hidden]` e o
// elemento continua pintado. Foi assim que, em 16/09, o painel da missão ficou
// com o atributo posto E `display: flex` durante o Wild Card: o aluno via a
// votação com o cartão de espera logo abaixo, duas situações na mesma tela.
// Três guardas aprovaram aquilo porque todas perguntavam ao ATRIBUTO
// (`!painel.hidden`), não à pintura. Este portão pergunta à pintura, sem
// navegador: simula a cascata de `display` para cada elemento que CARREGA o
// atributo e reprova se o vencedor não for `none`.
//
// O VOCABULÁRIO.
//   carregador — elemento que carrega o atributo `hidden` numa fonte viva: ou o
//                atributo escrito na marcação (template do servidor ou do
//                cliente), ou um alvo que o cliente liga/desliga com
//                `elemento.hidden = ...`.
//   revelador  — regra que declara `display` com valor diferente de `none`.
//   protetor   — regra que declara `display: none` para um sujeito que exige
//                `[hidden]` (o `[hidden] { display: none !important }` da
//                design.css:2880 é o protetor universal).
//
// COMO A SIMULAÇÃO É CONSERVADORA. O que se procura é prova de segurança, então
// as duas metades erram para o lado de acusar:
//   - regra que PODE casar (`:hover`, `:has(...)`, classe dinâmica) conta como
//     candidata a pintar;
//   - protetor só conta como cobertura quando casa com CERTEZA — pseudo-classe
//     que não modelamos, classe desconhecida ou cadeia de ancestrais
//     desconhecida desqualificam o protetor, e o conflito aparece para revisão.
//
// LIMITES DECLARADOS (todos erram para o lado de acusar, nunca de esconder):
//   - `@media print` fica fora: o defeito desta classe é de tela, e o portão não
//     julga impressão. Um `display` escondido só na impressão não conta como
//     protetor.
//   - Elemento montado por JS fora dos templates conhecidos entra como carregador
//     "não localizado": vale o que o seletor garante, o resto é incerto.
//   - `@layer`/`@scope` não existem nestas folhas; se aparecerem, a precedência
//     daqui precisa deles.
//   - `setAttribute('hidden')`, `removeAttribute('hidden')` e afins não são
//     modelados: o portão REPROVA ao encontrá-los, para que a forma nova seja
//     classificada em vez de escapar calada.

import { readFileSync } from 'node:fs';

import { FOLHAS, analisarRegras, semCr } from './cascata-css.mjs';
import { compostosDe, lerFontes } from './classes-vivas.mjs';

export { FOLHAS, lerFontes };

const DESESCAPAR = (texto) => texto.replace(/\\([\s\S])/g, '$1');

// Elementos sem fechamento: não entram na pilha da marcação.
const VAZIOS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

// O nome tem de ser elemento de HTML de verdade: é o que separa uma tag de uma
// comparação (`a < b`) ou de um trecho de fórmula no meio de um template.
const TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
  'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img',
  'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu',
  'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p',
  'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script',
  'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'style',
  'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
  'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
  'circle', 'ellipse', 'g', 'line', 'path', 'polygon', 'polyline', 'rect', 'use', 'text',
]);

// ---------------------------------------------------------------- utilidades --

/** Atributos de um corpo de tag: nome (minúsculo) e valor literal, se houver. */
function atributosDoCorpo(corpo) {
  const atributos = [];
  const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
  let m;
  while ((m = re.exec(corpo))) {
    atributos.push({ nome: m[1].toLowerCase(), valor: m[2] ?? m[3] ?? m[4] ?? null });
  }
  return atributos;
}

/**
 * O corpo de uma tag é mesmo uma tag? Comparações (`a < b && c > d`) e
 * interpolação solta produzem falsos `<...>`; fora de aspas, caractere de
 * expressão reprova.
 */
function corpoPlausivel(corpo) {
  let dentro = null;
  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i];
    if (dentro) {
      if (c === '\\') i += 1;
      else if (c === dentro) dentro = null;
      continue;
    }
    if (c === '"' || c === "'") {
      dentro = c;
      continue;
    }
    if (';&|?()+*`'.includes(c)) return false;
  }
  return dentro === null;
}

/**
 * O mesmo texto com o CONTEÚDO dos templates apagado (vira espaço, para não
 * mexer no comprimento nem na contagem de linhas).
 *
 * Por que: meia dúzia de interpretadores de JavaScript faz o arquivo parecer
 * código onde só há marcação. `class="arena-card"` dentro de um template virava
 * uma atribuição de variável chamada `class`, e a linha inteira entrava como
 * binding — foi assim que os elementos do placar viraram "alvos do cliente" com
 * um seletor inventado (`]`). O que interessa ao cliente (`$('[data-x]')`) está
 * em código de verdade e continua visível; `${...}` também.
 */
export function mascararTemplates(texto) {
  return mascarar(texto).texto;
}

/**
 * O texto com o conteúdo dos templates E dos comentários apagado, mais a lista
 * das regiões apagadas. A lista é o que permite a contabilidade: cada `hidden`
 * do arquivo tem de cair numa região conhecida (atributo, comentário, template)
 * ou ser uma forma de código que a guarda modela.
 */
export function mascarar(texto) {
  // `split('')` e não `[...texto]`: o índice precisa ser o mesmo do texto (unidade
  // UTF-16). Com emoji no arquivo — e há muitos — os dois divergem e o mascarador
  // passa a apagar o caractere errado.
  const saida = texto.split('');
  const regioes = [];
  const apaga = (inicio, fim, tipo) => {
    for (let k = inicio; k < fim; k += 1) if (texto[k] !== '\n' && texto[k] !== '\r') saida[k] = ' ';
    regioes.push({ inicio, fim, tipo });
  };
  const pilha = [];
  let i = 0;
  // Último caractere significativo do CÓDIGO: é ele que diz se um `/` abre uma
  // expressão regular (`replace(/'/g, ...)`) ou é divisão. Sem isso, o `'` de
  // dentro da regex virava o começo de uma string e desalinhava o arquivo
  // inteiro — e, desalinhado, o mascarador deixava de esconder os templates.
  let ultimo = null;
  while (i < texto.length) {
    const c = texto[i];
    const topo = pilha[pilha.length - 1];
    if (!topo || topo.tipo === 'expressao') {
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < texto.length && texto[j] !== c) {
          if (texto[j] === '\\') j += 1;
          j += 1;
        }
        i = j + 1;
        ultimo = c;
        continue;
      }
      if (c === '/' && texto[i + 1] === '/') {
        const inicio = i;
        while (i < texto.length && texto[i] !== '\n') i += 1;
        apaga(inicio, i, 'comentario');
        continue;
      }
      if (c === '/' && texto[i + 1] === '*') {
        const fim = texto.indexOf('*/', i + 2);
        const limite = fim < 0 ? texto.length : fim + 2;
        apaga(i, limite, 'comentario');
        i = limite;
        continue;
      }
      if (c === '/' && (ultimo === null || '(:,=[!&|?{};+-*%~^<>'.includes(ultimo))) {
        let j = i + 1;
        let classe = false;
        while (j < texto.length) {
          const d = texto[j];
          if (d === '\\') {
            j += 2;
            continue;
          }
          if (d === '[') classe = true;
          else if (d === ']') classe = false;
          else if (d === '/' && !classe) break;
          else if (d === '\n') break;
          j += 1;
        }
        i = j + 1;
        ultimo = '/';
        continue;
      }
      if (c === '`') {
        pilha.push({ tipo: 'template' });
        i += 1;
        ultimo = '`';
        continue;
      }
      if (topo && c === '{') {
        topo.chaves += 1;
        i += 1;
        continue;
      }
      if (topo && c === '}') {
        topo.chaves -= 1;
        if (topo.chaves === 0) pilha.pop();
        i += 1;
        continue;
      }
      if (!/\s/.test(c)) ultimo = c;
      i += 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') {
      pilha.pop();
      i += 1;
      continue;
    }
    if (c === '$' && texto[i + 1] === '{') {
      pilha.push({ tipo: 'expressao', chaves: 1 });
      i += 2;
      continue;
    }
    const inicio = i;
    while (i < texto.length && texto[i] !== '`' && !(texto[i] === '$' && texto[i + 1] === '{')) {
      if (texto[i] === '\\') i += 1;
      i += 1;
    }
    apaga(inicio, Math.min(i, texto.length), 'template');
  }
  return { texto: saida.join(''), regioes };
}

/** Especificidade (a, b, c) — `:not`/`:is`/`:has` valem pelo argumento mais forte. */
export function especificidade(seletor) {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  const pulaParenteses = (de) => {
    let nivel = 0;
    for (let j = de; j < seletor.length; j += 1) {
      if (seletor[j] === '(') nivel += 1;
      else if (seletor[j] === ')') {
        nivel -= 1;
        if (nivel === 0) return j + 1;
      }
    }
    return seletor.length;
  };
  while (i < seletor.length) {
    const resto = seletor.slice(i);
    const funcional = /^:(not|is|has|matches)\(/i.exec(resto);
    if (funcional) {
      const fim = pulaParenteses(i + funcional[0].length);
      const interno = seletor.slice(i + funcional[0].length, fim - 1);
      const melhor = interno
        .split(',')
        .map((parte) => especificidade(parte))
        .reduce((x, y) => (maior(x, y) === y ? y : x), [0, 0, 0]);
      a += melhor[0];
      b += melhor[1];
      c += melhor[2];
      i = fim;
      continue;
    }
    const zero = /^:where\(/i.exec(resto);
    if (zero) {
      i = pulaParenteses(i + zero[0].length);
      continue;
    }
    if (resto[0] === '#') {
      a += 1;
      i += 1 + (/^(?:\\([\s\S])|[\w-])+/.exec(seletor.slice(i + 1))?.[0].length || 0);
      continue;
    }
    if (resto[0] === '.' || resto[0] === '[') {
      b += 1;
      if (resto[0] === '[') {
        const fim = seletor.indexOf(']', i);
        i = fim < 0 ? seletor.length : fim + 1;
      } else {
        i += 1 + (/^(?:\\([\s\S])|[\w-])+/.exec(seletor.slice(i + 1))?.[0].length || 0);
      }
      continue;
    }
    if (resto[0] === ':') {
      const duplo = resto[1] === ':';
      const nome = /^:{1,2}[\w-]+/.exec(resto);
      if (!duplo) b += 1;
      else c += 1;
      i += nome ? nome[0].length : 1;
      if (seletor[i] === '(') i = pulaParenteses(i);
      continue;
    }
    const tag = /^[a-zA-Z][\w-]*/.exec(resto);
    if (tag) {
      c += 1;
      i += tag[0].length;
      continue;
    }
    i += 1;
  }
  return [a, b, c];
}

const maior = (x, y) =>
  y[0] > x[0] || (y[0] === x[0] && (y[1] > x[1] || (y[1] === x[1] && y[2] > x[2]))) ? y : x;

// ------------------------------------------------------- hooks e casamento ----

/**
 * O composto com o CONTEÚDO das pseudo-classes funcionais apagado, mais a lista
 * dessas funcionais com o argumento inteiro — parêntese balanceado, aspas
 * respeitadas, atributo pulado inteiro.
 *
 * Por que existe. Uma expressão regular para de ler na primeira `)`: num
 * `:has(.arena-mission-empty:not([hidden]))` ela via `:has` e deixava o resto do
 * argumento ser varrido como se fosse do SUJEITO. O resultado era o pior lado
 * possível: a regra passava a EXIGIR `.arena-mission-empty` do elemento que
 * escondia, não casava com ele, e o defeito que este portão existe para pegar
 * (a regra do painel da missão vencendo o `hidden`) ficava invisível — medido
 * em 17/09 pela prova de mordida. Argumento de `:has()` não é condição do
 * sujeito; classe lá dentro não pode virar exigência dele.
 */
function separarFuncionais(composto) {
  const saida = composto.split('');
  const funcionais = [];
  let i = 0;
  while (i < composto.length) {
    if (composto[i] === ':') {
      if (composto[i + 1] === ':') {
        i += 2;
        continue;
      }
      const nome = /^:([\w-]+)/.exec(composto.slice(i));
      if (!nome) {
        i += 1;
        continue;
      }
      const abre = i + nome[0].length;
      if (composto[abre] !== '(') {
        i = abre;
        continue;
      }
      let nivel = 0;
      let aspa = null;
      let j = abre;
      for (; j < composto.length; j += 1) {
        const d = composto[j];
        if (aspa) {
          if (d === '\\') j += 1;
          else if (d === aspa) aspa = null;
          continue;
        }
        if (d === '"' || d === "'") aspa = d;
        else if (d === '(') nivel += 1;
        else if (d === ')') {
          nivel -= 1;
          if (nivel === 0) {
            j += 1;
            break;
          }
        }
      }
      funcionais.push({ nome: nome[1].toLowerCase(), arg: composto.slice(abre + 1, j - 1) });
      for (let p = abre + 1; p < j - 1; p += 1) saida[p] = ' ';
      i = j;
      continue;
    }
    if (composto[i] === '[') {
      // O atributo inteiro numa peça só: valor com parêntese (`[data-x="a(b)"]`)
      // não pode virar argumento de pseudo-classe.
      let j = i + 1;
      let aspa = null;
      for (; j < composto.length; j += 1) {
        const d = composto[j];
        if (aspa) {
          if (d === '\\') j += 1;
          else if (d === aspa) aspa = null;
          continue;
        }
        if (d === '"' || d === "'") aspa = d;
        else if (d === ']') {
          j += 1;
          break;
        }
      }
      i = j;
      continue;
    }
    i += 1;
  }
  return { texto: saida.join(''), funcionais };
}

/**
 * O que um composto EXIGE: tag, id, classes, atributos (com operador e valor, o
 * que distingue `[hidden]` de `[hidden=until-found]`), negações e alternativas.
 * `pseudoElemento` marca `::before`/`::after`: a regra estiliza a caixa do
 * pseudo-elemento, não a do elemento, e sai da cascata de `display`.
 *
 * As funcionais são lidas pelo argumento balanceado (`separarFuncionais`), não
 * pelo que a expressão regular alcança: `:has()`, `:is()`, `:where()` e `:not()`
 * com aninhamento valem pelo argumento inteiro.
 */
export function hooksDoComposto(composto) {
  const hooks = {
    tag: null,
    id: null,
    classes: new Set(),
    atributos: new Map(),
    negacoes: [],
    alternativas: null,
    temHas: false,
    pseudo: false,
    pseudoElemento: false,
  };
  // O argumento das funcionais sai da varredura ANTES dela: sem isso, a classe
  // de dentro de um `:has(...)` entrava como exigência do sujeito.
  const { texto, funcionais } = separarFuncionais(composto);
  // Grupos NOMEADOS de propósito: um `([\s\S])` lá dentro desloca os índices de
  // todos os grupos seguintes, e foi assim que `.arena-side` virou o atributo
  // `arena-sid` numa primeira versão deste leitor.
  const re = /(?<pseudo>::?[\w-]+(?:\([^()]*\))?)|(?<id>#(?:\\(?:[\s\S])|[\w-])+)|(?<classe>\.(?:\\(?:[\s\S])|[\w*-])+)|(?<atributo>\[[^\]]*\])|(?<tag>[a-zA-Z][\w-]*)|(?<estrela>\*)/g;
  let m;
  while ((m = re.exec(texto))) {
    const { pseudo, id, classe, atributo, tag, estrela } = m.groups;
    if (pseudo) {
      if (/^::/.test(pseudo)) hooks.pseudoElemento = true;
      else hooks.pseudo = true;
    } else if (id) hooks.id = DESESCAPAR(id.slice(1));
    else if (classe) {
      const nome = DESESCAPAR(classe.slice(1));
      // Classe montada por dado (`arena-hearts\u0000`): não dá para exigir nome.
      if (nome.includes('*')) hooks.pseudo = true;
      else hooks.classes.add(nome);
    } else if (atributo) {
      const corpo = atributo.slice(1, -1);
      const comparacao = /([\w-]+)\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(corpo);
      if (comparacao && !comparacao[3] && !comparacao[4] && comparacao[5] === '*') {
        hooks.atributos.set(comparacao[1].toLowerCase(), { operador: null, valor: null });
      } else if (comparacao) {
        hooks.atributos.set(comparacao[1].toLowerCase(), {
          operador: comparacao[2],
          valor: comparacao[3] ?? comparacao[4] ?? comparacao[5] ?? '',
        });
      } else {
        hooks.atributos.set(corpo.trim().toLowerCase(), { operador: null, valor: null });
      }
    } else if (tag) hooks.tag = tag.toLowerCase();
    else if (estrela) hooks.tag = '*';
  }
  for (const { nome, arg } of funcionais) {
    if (nome === 'not') hooks.negacoes.push(arg);
    else if (nome === 'is' || nome === 'matches') hooks.alternativas = arg;
    else if (nome === 'where') hooks.alternativas = arg;
    else if (nome === 'has') hooks.temHas = true;
    else hooks.pseudo = true;
  }
  return hooks;
}

/** A cadeia de um seletor: cada composto com o combinador que o precede. */
export function cadeiaDoSeletor(seletor) {
  const partes = [];
  let atual = '';
  let pendente = null;
  let i = 0;
  const empurra = () => {
    const texto = atual.trim();
    atual = '';
    if (!texto) return;
    partes.push({ combinator: partes.length ? pendente ?? ' ' : null, composto: texto });
    pendente = null;
  };
  while (i < seletor.length) {
    const c = seletor[i];
    if (c === '(' || c === '[') {
      let nivel = 0;
      let aspa = null;
      let j = i;
      while (j < seletor.length) {
        const d = seletor[j];
        if (aspa) {
          if (d === '\\') j += 1;
          else if (d === aspa) aspa = null;
        } else if (d === '"' || d === "'") aspa = d;
        else if (d === '(' || d === '[') nivel += 1;
        else if (d === ')' || d === ']') {
          nivel -= 1;
          if (nivel === 0) {
            j += 1;
            break;
          }
        }
        j += 1;
      }
      atual += seletor.slice(i, j);
      i = j;
      continue;
    }
    if (c === '>') {
      empurra();
      pendente = '>';
      i += 1;
      continue;
    }
    if (c === '+' || c === '~') {
      empurra();
      pendente = c;
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < seletor.length && /\s/.test(seletor[j])) j += 1;
      empurra();
      i = j;
      continue;
    }
    atual += c;
    i += 1;
  }
  empurra();
  return partes;
}

const SIM = 'sim';
const NAO = 'nao';
const INCERTO = 'incerto';

/**
 * O composto casa com o elemento? `sim` (com certeza), `nao` (com certeza não)
 * ou `incerto` — pseudo-classe, `:has()`, classe dinâmica, valor de atributo
 * desconhecido. `null` quando o composto é de pseudo-elemento: a regra não fala
 * da caixa do elemento.
 */
export function casaComposto(hooks, alvo) {
  if (hooks.pseudoElemento) return null;
  const resultados = [];
  if (hooks.tag && hooks.tag !== '*') {
    if (!alvo.tag) resultados.push(INCERTO);
    else resultados.push(hooks.tag === alvo.tag ? SIM : NAO);
  }
  if (hooks.id) {
    if (!alvo.id) resultados.push(INCERTO);
    else resultados.push(hooks.id === alvo.id ? SIM : NAO);
  }
  for (const classe of hooks.classes) {
    if (alvo.classes.has(classe)) resultados.push(SIM);
    else resultados.push(alvo.classesCompletas ? NAO : INCERTO);
  }
  for (const [nome, exigencia] of hooks.atributos) {
    if (!alvo.atributos.has(nome)) {
      resultados.push(alvo.atributosCompletos ? NAO : INCERTO);
      continue;
    }
    if (!exigencia.operador) {
      resultados.push(SIM);
      continue;
    }
    if (!alvo.valores?.has(nome)) {
      resultados.push(INCERTO);
      continue;
    }
    const valor = alvo.valores.get(nome) ?? '';
    if (exigencia.operador === '=') resultados.push(valor === exigencia.valor ? SIM : NAO);
    else if (exigencia.operador === '^=') resultados.push(valor.startsWith(exigencia.valor) ? SIM : NAO);
    else if (exigencia.operador === '$=') resultados.push(valor.endsWith(exigencia.valor) ? SIM : NAO);
    else if (exigencia.operador === '*=') resultados.push(valor.includes(exigencia.valor) ? SIM : NAO);
    else resultados.push(INCERTO);
  }
  // `:not()`/`:is()`/`:where()` levam um seletor COMPLETO lá dentro (pode ter
  // combinador: `:is(.x img)`), então o argumento é julgado pela cadeia dele.
  for (const negacao of hooks.negacoes) {
    const internos = compostosDe(negacao).map((parte) => casaCadeia(cadeiaDoSeletor(parte), alvo));
    if (internos.some((r) => r === SIM)) resultados.push(NAO);
    else if (internos.every((r) => r === NAO)) resultados.push(SIM);
    else resultados.push(INCERTO);
  }
  if (hooks.alternativas) {
    const internos = compostosDe(hooks.alternativas).map((parte) =>
      casaCadeia(cadeiaDoSeletor(parte), alvo),
    );
    if (internos.some((r) => r === SIM)) resultados.push(SIM);
    else if (internos.every((r) => r === NAO)) resultados.push(NAO);
    else resultados.push(INCERTO);
  }
  if (hooks.temHas || hooks.pseudo) resultados.push(INCERTO);
  if (resultados.includes(NAO)) return NAO;
  return resultados.includes(INCERTO) ? INCERTO : SIM;
}

/** Hooks de um composto da cadeia, montados uma vez só por composto. */
const hooksDe = (parte) => {
  if (!parte.hooks) parte.hooks = hooksDoComposto(parte.composto);
  return parte.hooks;
};

/**
 * A cadeia inteira casa com o elemento? `alvo.ancestrais` é a lista de
 * ancestrais conhecidos (do mais externo ao mais interno) ou `null` quando o
 * elemento é montado por JS fora dos templates. Ancestral desconhecido vira
 * `incerto` — nunca `sim`, que é o lado que absolveria um protetor.
 */
export function casaCadeia(cadeia, alvo) {
  const sujeito = cadeia[cadeia.length - 1];
  const vereditoSujeito = casaComposto(hooksDe(sujeito), alvo);
  if (vereditoSujeito === null) return null;
  const resultados = [vereditoSujeito];
  const ancestrais = alvo.ancestrais ?? null;
  const incerto = ancestrais === null || alvo.ancestraisIncompletos === true;
  let indice = ancestrais ? ancestrais.length - 1 : -1;
  for (let i = cadeia.length - 2; i >= 0; i -= 1) {
    const { combinator } = cadeia[i];
    const hooks = hooksDe(cadeia[i]);
    if (combinator === '+' || combinator === '~') {
      resultados.push(INCERTO);
      continue;
    }
    if (combinator === '>') {
      const pai = ancestrais ? ancestrais[indice] : null;
      if (!pai) resultados.push(incerto ? INCERTO : NAO);
      else resultados.push(casaComposto(hooks, pai) ?? INCERTO);
      indice -= 1;
      continue;
    }
    let achou = -1;
    for (let j = indice; j >= 0; j -= 1) {
      if (casaComposto(hooks, ancestrais[j]) === SIM) {
        achou = j;
        break;
      }
    }
    if (achou >= 0) indice = achou - 1;
    else resultados.push(incerto ? INCERTO : NAO);
  }
  if (resultados.includes(NAO)) return NAO;
  return resultados.includes(INCERTO) ? INCERTO : SIM;
}

// ------------------------------------------------------------- carregadores --

/**
 * As classes de um atributo `class`, com as que vêm por interpolação.
 *
 * `class="arena-card ${entry.connected ? 'is-connected' : ''}"` produz um
 * conjunto FINITO: as classes escritas mais os literais da interpolação. Só
 * quando a interpolação monta o nome (crase, concatenação ou expressão solta) é
 * que o conjunto vira desconhecido — e aí um revelador que exija qualquer classe
 * passa a "possível", que é o lado conservador.
 */
function classesDoAtributo(valor) {
  const classes = new Set();
  let completa = true;
  let i = 0;
  while (i < valor.length) {
    if (valor[i] === '$' && valor[i + 1] === '{') {
      let nivel = 1;
      let j = i + 2;
      while (j < valor.length && nivel > 0) {
        if (valor[j] === '{') nivel += 1;
        else if (valor[j] === '}') nivel -= 1;
        j += 1;
      }
      const expressao = valor.slice(i + 2, j - 1);
      const literais = [...expressao.matchAll(/['"`]([^'"`]*)['"`]/g)];
      if (!literais.length || /[`+]/.test(expressao)) completa = false;
      for (const literal of literais) {
        for (const c of literal[1].split(/\s+/).filter(Boolean)) classes.add(c);
      }
      i = j;
      continue;
    }
    let j = i;
    while (j < valor.length && valor[j] !== '$' && !/\s/.test(valor[j])) j += 1;
    const token = valor.slice(i, j);
    if (token && token !== '${') classes.add(token);
    if (j === i) j += 1;
    i = j;
  }
  classes.delete('${');
  return { classes, completa };
}

/**
 * Todos os elementos da marcação das fontes vivas, com a cadeia de ancestrais.
 * Não filtra por `hidden`: o cliente pode ligar/desligar um alvo que nunca
 * aparece com o atributo no template, e a junção precisa dele aqui.
 */
export function elementosDaMarcacao(bruto, arquivo) {
  const texto = semCr(bruto);
  const elementos = [];
  const spansDeHidden = [];
  const spansDeTags = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)>/g;
  const pilha = [];
  let m;
  while ((m = re.exec(texto))) {
    const fechamento = m[0][1] === '/';
    const tag = m[1].toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (fechamento) {
      for (let i = pilha.length - 1; i >= 0; i -= 1) {
        if (pilha[i].tag === tag) {
          pilha.length = i;
          break;
        }
      }
      continue;
    }
    if (!corpoPlausivel(m[2])) continue;
    const atributos = atributosDoCorpo(m[2]);
    const { classes, completa } = classesDoAtributo(
      atributos.find((a) => a.nome === 'class')?.valor ?? '',
    );
    const elemento = {
      arquivo,
      linha: semCr(texto).slice(0, m.index).split('\n').length,
      tag,
      id: atributos.find((a) => a.nome === 'id')?.valor ?? null,
      classes,
      classesCompletas: completa,
      atributos: new Set(atributos.map((a) => a.nome)),
      atributosCompletos: true,
      valores: new Map(atributos.map((a) => [a.nome, a.valor ?? ''])),
      ancestrais: [...pilha],
      ancestraisIncompletos: false,
      texto: m[0].slice(0, 80),
    };
    elementos.push(elemento);
    const span = { inicio: m.index, fim: m.index + m[0].length, temHidden: false };
    spansDeTags.push(span);
    if (atributos.some((a) => a.nome === 'hidden')) {
      span.temHidden = true;
      spansDeHidden.push(span);
      elemento.carregaHidden = true;
    }
    if (!VAZIOS.has(tag) && !m[0].endsWith('/>')) pilha.push(elemento);
  }
  return { elementos, spansDeHidden, spansDeTags };
}

const CHAMADAS = /(?:querySelectorAll|querySelector|closest|matches|getElementById|\$\$?)\s*\(([^)]*)\)/g;

/**
 * Literais de um trecho, com `\u0000` no lugar de cada `${...}` de um template.
 * O valor dinâmico tem de continuar reconhecível: `` `[data-x="${id}"]` `` é um
 * seletor de verdade, só com o valor vindo do dado.
 */
function literaisDe(texto) {
  const saida = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c !== '"' && c !== "'" && c !== '`') {
      i += 1;
      continue;
    }
    let j = i + 1;
    let valor = '';
    let dinamico = false;
    while (j < texto.length) {
      const d = texto[j];
      if (d === '\\') {
        valor += texto[j + 1] ?? '';
        j += 2;
        continue;
      }
      if (d === c) break;
      if (c === '`' && d === '$' && texto[j + 1] === '{') {
        let nivel = 1;
        let k = j + 2;
        while (k < texto.length && nivel > 0) {
          if (texto[k] === '{') nivel += 1;
          else if (texto[k] === '}') nivel -= 1;
          k += 1;
        }
        valor += '\u0000';
        dinamico = true;
        j = k;
        continue;
      }
      valor += d;
      j += 1;
    }
    saida.push({ valor, dinamico });
    i = j + 1;
  }
  return saida;
}

/** `[data-x="\u0000"]` vira `[data-x]`; `\u0000` solto vira `*` (classe qualquer). */
const sanitizar = (valor) =>
  valor.replace(/=(?:"\u0000"|'\u0000'|\u0000)/g, '').replace(/\u0000/g, '*');

/** Os seletores que uma expressão do cliente usa: a última string parece o sujeito. */
function seletoresDaExpressao(expressao) {
  const achados = [];
  const re = new RegExp(CHAMADAS.source, 'g');
  let m;
  while ((m = re.exec(expressao))) {
    const literais = literaisDe(m[1]).filter(
      (l) => l.dinamico || /[[.#]/.test(l.valor),
    );
    if (!literais.length) continue;
    achados.push(sanitizar(literais[literais.length - 1].valor));
  }
  return achados;
}

/** Segue bindings simples (`const x = $('sel')`) até os seletores ou o `createElement`. */
function alvosDoNome(nome, bindings, profundidade = 0) {
  const saida = { seletores: [], criados: [], dom: false };
  if (profundidade > 3) return saida;
  for (const rhs of bindings.get(nome) ?? []) {
    const seletores = seletoresDaExpressao(rhs);
    if (seletores.length) {
      saida.seletores.push(...seletores);
      saida.dom = true;
      continue;
    }
    if (/\bcreateElement\s*\(/.test(rhs)) {
      saida.criados.push(nome);
      saida.dom = true;
      continue;
    }
    const aninhado = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(rhs);
    if (aninhado) {
      const filho = alvosDoNome(aninhado[1], bindings, profundidade + 1);
      saida.seletores.push(...filho.seletores);
      saida.criados.push(...filho.criados);
      saida.dom = saida.dom || filho.dom;
    }
  }
  return saida;
}

/**
 * Hooks de um elemento montado por JS: `createElement`, `className`, `dataset.x`.
 *
 * O `className` é a lista INTEIRA de classes do elemento (vem de uma atribuição
 * só), então vale como completa — foi o que impediu o modal de rede de "casar"
 * com toda regra de classe do projeto por ignorância. `classList.add/toggle`
 * entra como classe extra, e se o nome for montado por crase/concatenação a
 * lista volta a ser desconhecida.
 */
function hooksDoCriado(nome, texto) {
  const hooks = {
    tag: null,
    id: null,
    classes: new Set(),
    classesCompletas: false,
    atributos: new Set(),
    atributosCompletos: false,
    valores: new Map(),
    ancestrais: null,
    ancestraisIncompletos: true,
  };
  let m;
  const criacao = new RegExp(`\\b${nome}\\s*=\\s*document\\.createElement\\(\\s*['"]([\\w-]+)['"]`, 'g');
  while ((m = criacao.exec(texto))) hooks.tag = m[1].toLowerCase();
  let viuClasse = false;
  const classe = new RegExp(`\\b${nome}\\.className\\s*=\\s*(['"\`])((?:(?!\\1)[\\s\\S])*)\\1`, 'g');
  while ((m = classe.exec(texto))) {
    const { classes, completa } = classesDoAtributo(m[2]);
    for (const c of classes) hooks.classes.add(c);
    if (viuClasse && !completa) hooks.classesCompletas = false;
    viuClasse = viuClasse && completa ? true : completa;
  }
  if (viuClasse) hooks.classesCompletas = true;
  const listaCriaClasse = new RegExp(`\\b${nome}\\.classList\\.(?:add|toggle)\\(([^)]*)\\)`, 'g');
  while ((m = listaCriaClasse.exec(texto))) {
    const { classes, completa } = classesDoAtributo(m[1]);
    for (const c of classes) hooks.classes.add(c);
    if (!completa) hooks.classesCompletas = false;
  }
  const id = new RegExp(`\\b${nome}\\.id\\s*=\\s*(['"\`])(.*?)\\1`, 'g');
  while ((m = id.exec(texto))) hooks.id = m[2];
  const dataset = new RegExp(`\\b${nome}\\.dataset\\.([\\w$]+)\\s*=`, 'g');
  while ((m = dataset.exec(texto))) {
    hooks.atributos.add(`data-${m[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  }
  return hooks;
}

/**
 * Todo alvo do cliente carrega o atributo `hidden` quando o cliente o esconde —
 * é o que o `elemento.hidden = ...` significa. Sem registrar isso, o protetor
 * universal (`[hidden] { display: none !important }`) ficava "incerto" para eles
 * e a simulação acusava o mundo inteiro.
 */
function comHidden(carregador) {
  return {
    ...carregador,
    atributos: new Set([...carregador.atributos, 'hidden']),
    valores: new Map([...(carregador.valores ?? []), ['hidden', '']]),
  };
}

/** Carregadores de um arquivo: o atributo já veio da marcação; aqui vêm os do cliente. */
export function carregadoresDoArquivo(arquivo, bruto, elementos, tags = []) {
  // `original` é o texto de verdade; `texto` é o mesmo com o CONTEÚDO dos
  // templates apagado (mesmo comprimento, mesmos deslocamentos). O que é sintaxe
  // — bindings, `.hidden`, `className` — se lê no mascarado, para a marcação não
  // virar código; o que é VALOR — seletor dentro de crase — se lê no original.
  const original = semCr(bruto);
  const { texto, regioes } = mascarar(original);
  const carregadores = [];
  const naoAtribuidos = [];
  const ignorados = [];
  const bindings = new Map();
  let m;
  // Declaração E atribuição simples: `modal = document.createElement('div')` não
  // tem `const` e era invisível para uma régua só de declarações.
  const reBind = /(?:const|let|var\s+)?\b([A-Za-z_$][\w$]*)\s*=(?![=>])\s*([^\n;]+)/g;
  while ((m = reBind.exec(texto))) {
    const inicioRhs = m.index + m[0].length - m[2].length;
    if (!bindings.has(m[1])) bindings.set(m[1], []);
    bindings.get(m[1]).push(original.slice(inicioRhs, inicioRhs + m[2].length).trim());
  }
  // Parâmetro de laço sobre uma coleção de elementos é um alvo possível.
  const reParams = /([A-Za-z_$][\w$]*(?:\([^)]*\))?)\s*\.(?:forEach|every|some|filter|find)\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>|\bfor\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\s+([^)]*)\)/g;
  while ((m = reParams.exec(texto))) {
    const fonte = m[4] ?? m[1];
    const parametro = m[2] ?? m[3];
    if (!parametro) continue;
    if (!bindings.has(parametro)) bindings.set(parametro, []);
    for (const sel of seletoresDaExpressao(fonte)) {
      bindings.get(parametro).push(`document.querySelectorAll(${JSON.stringify(sel)})`);
    }
  }

  // `document.hidden` NAO esconde elemento nenhum: e a propriedade do navegador
  // que diz se a aba esta visivel, lida pelo relogio de batimento das telas.
  // Exige classificacao explicita porque a forma se parece com a dos alvos — o
  // dia em que alguem escrever `doc.hidden = ...` para outro documento, o padrao
  // muda e isto aparece na diferenca em vez de passar como leitura.
  const RE_DOCUMENTO = /^(?:window\.|globalThis\.|self\.)?document$/;
  const reHidden = /([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*\.hidden\b/g;
  while ((m = reHidden.exec(texto))) {
    const alvo = m[1];
    const linha = texto.slice(0, m.index).split('\n').length;
    if (RE_DOCUMENTO.test(alvo)) {
      ignorados.push({
        arquivo,
        linha,
        motivo: 'leitura de `document.hidden` (visibilidade da aba), não esconde elemento',
      });
      continue;
    }
    const diretos = seletoresDaExpressao(alvo);
    const nome = /^([A-Za-z_$][\w$]*)/.exec(alvo)?.[1] ?? alvo;
    const viaNome = diretos.length ? { seletores: [], criados: [], dom: true } : alvosDoNome(nome, bindings);
    const seletores = [...new Set([...diretos, ...viaNome.seletores])];
    if (!seletores.length && !viaNome.criados.length) {
      if (!viaNome.dom) naoAtribuidos.push({ arquivo, linha, alvo, texto: m[0].trim() });
      continue;
    }
    const criados = viaNome.criados.map((criado) => ({
      nome: criado,
      hooks: hooksDoCriado(criado, original),
    }));
    for (const criado of criados) {
      carregadores.push(
        comHidden({
          ...criado.hooks,
          origem: `${arquivo}:${linha}`,
          como: 'cliente (criado)',
          texto: m[0].trim(),
        }),
      );
    }
    for (const seletor of seletores) {
      const cadeia = cadeiaDoSeletor(seletor);
      if (!cadeia.length) continue;
      const localizados = elementos.filter((e) => casaCadeia(cadeia, e) === SIM);
      if (localizados.length) {
        for (const elemento of localizados) {
          carregadores.push(
            comHidden({
              ...elemento,
              origem: `${elemento.arquivo}:${elemento.linha}`,
              como: `cliente ${seletor}`,
              alvo: `${arquivo}:${linha}`,
            }),
          );
        }
        continue;
      }
      const sujeito = hooksDe(cadeia[cadeia.length - 1]);
      // O mesmo alvo pode ser montado por `createElement` e consultado por
      // seletor no mesmo arquivo: aí o elemento criado já descreve o carregador e
      // a versão "não localizada" seria só ruído com hooks desconhecidos.
      if (criados.some((criado) => casaComposto(sujeito, criado.hooks) === SIM)) continue;
      carregadores.push(
        comHidden({
          tag: sujeito.tag,
          id: sujeito.id,
          classes: sujeito.classes,
          classesCompletas: false,
          atributos: new Set(sujeito.atributos.keys()),
          atributosCompletos: false,
          valores: new Map(),
          ancestrais: cadeia.slice(0, -1).map((parte) => hooksDe(parte)),
          ancestraisIncompletos: true,
          origem: `${arquivo}:${linha}`,
          como: `cliente não localizado ${seletor}`,
          semMarcacao: seletor,
          texto: m[0].trim(),
        }),
      );
    }
  }
  const contas = contabilizarHidden({ arquivo, original, regioes, tags });
  for (const visto of contas.ignorados) ignorados.push(visto);
  for (const solto of contas.naoAtribuidos) naoAtribuidos.push(solto);
  return {
    carregadores,
    naoAtribuidos,
    ignorados,
    naoContabilizados: contas.naoContabilizados,
  };
}

/**
 * A contabilidade do `hidden` no arquivo: cada ocorrência da palavra tem de
 * cair numa forma conhecida — atributo na marcação, propriedade que o cliente
 * liga/desliga, comentário, literal de `type`, identificador — ou o portão
 * reprova pedindo classificação.
 *
 * Por que. Sem esta conta, um jeito novo de esconder um elemento
 * (`setAttribute('hidden')`, uma tag montada por concatenação) entraria calado: a
 * guarda simplesmente não veria o carregador e o `display` dele passaria sem
 * prova. É o mesmo princípio de `lerTudo` nos outros portões: a régua precisa
 * provar que enxergou tudo o que existe.
 */
function contabilizarHidden({ arquivo, original, regioes, tags }) {
  const ignorados = [];
  const naoContabilizados = [];
  const naoAtribuidos = [];
  const linha = (posicao) => original.slice(0, posicao).split('\n').length;
  const dentroDe = (posicao) => regioes.find((r) => posicao >= r.inicio && posicao < r.fim);
  const dentroDeSpan = (posicao) => tags.find((s) => posicao >= s.inicio && posicao < s.fim);
  const antes = (posicao, quantos) => original.slice(Math.max(0, posicao - quantos), posicao);
  const re = /\bhidden\b/g;
  let m;
  while ((m = re.exec(original))) {
    const posicao = m.index;
    const tag = dentroDeSpan(posicao);
    if (tag) {
      // Dentro de uma tag: ou é o atributo (já é carregador), ou é valor de
      // `type`, `aria-hidden` ou classe — a palavra está lá, o atributo não.
      if (tag.temHidden) continue;
      ignorados.push({
        arquivo,
        linha: linha(posicao),
        motivo: 'dentro de uma tag sem o atributo `hidden` (valor de `type`, `aria-hidden`, classe)',
      });
      continue;
    }
    const regiao = dentroDe(posicao);
    if (regiao) {
      if (regiao.tipo === 'comentario') ignorados.push({ arquivo, linha: linha(posicao), motivo: 'comentário' });
      else {
        naoContabilizados.push({
          arquivo,
          linha: linha(posicao),
          motivo: 'texto de template fora de uma tag',
        });
      }
      continue;
    }
    if (original[posicao - 1] === '.') {
      // Propriedade: a varredura de alvo conta — com uma excecao classificada,
      // `document.hidden`, que e leitura de visibilidade e nao esconde nada.
      if (/\bdocument\s*$/.test(antes(posicao - 1, 9))) {
        ignorados.push({
          arquivo,
          linha: linha(posicao),
          motivo: 'leitura de `document.hidden` (visibilidade da aba)',
        });
      }
      continue;
    }
    if (/(?:set|remove|toggle)Attribute\s*\(\s*["']$/.test(antes(posicao, 24))) {
      naoAtribuidos.push({
        arquivo,
        linha: linha(posicao),
        alvo: 'API do DOM',
        texto: original.slice(posicao - 24, posicao + 10).trim(),
      });
      continue;
    }
    if (/["']$/.test(antes(posicao, 1)) && /^["']/.test(original.slice(posicao))) {
      ignorados.push({
        arquivo,
        linha: linha(posicao),
        motivo: 'literal de string (`type="hidden"`, `\'hidden\'`)',
      });
      continue;
    }
    if (original[posicao - 1] === '[') {
      ignorados.push({ arquivo, linha: linha(posicao), motivo: 'seletor `[hidden]` escrito no código' });
      continue;
    }
    ignorados.push({
      arquivo,
      linha: linha(posicao),
      motivo: 'identificador `hidden` no código (nome de variável)',
    });
  }
  return { ignorados, naoContabilizados, naoAtribuidos };
}

/** O catálogo inteiro: o atributo na marcação mais os alvos do cliente. */
export function carregadoresDasFontes(fontes) {
  const elementos = [];
  const carregadores = [];
  const naoAtribuidos = [];
  const ignorados = [];
  const naoContabilizados = [];
  const spansPorArquivo = new Map();
  for (const fonte of fontes) {
    const { elementos: achados, spansDeTags } = elementosDaMarcacao(fonte.texto, fonte.arquivo);
    spansPorArquivo.set(fonte.arquivo, spansDeTags);
    for (const achado of achados) elementos.push(achado);
    for (const achado of achados) {
      if (achado.carregaHidden) carregadores.push({ ...achado, como: 'atributo' });
    }
  }
  for (const fonte of fontes) {
    const doArquivo = carregadoresDoArquivo(
      fonte.arquivo,
      fonte.texto,
      elementos,
      spansPorArquivo.get(fonte.arquivo) ?? [],
    );
    for (const doClienteUm of doArquivo.carregadores) carregadores.push(doClienteUm);
    for (const solto of doArquivo.naoAtribuidos) naoAtribuidos.push(solto);
    for (const visto of doArquivo.ignorados) ignorados.push(visto);
    for (const solto of doArquivo.naoContabilizados) naoContabilizados.push(solto);
  }
  // Um elemento pode chegar pelas duas fontes: fica o registro mais informado.
  const unicos = new Map();
  for (const carregador of carregadores) {
    const chave = `${carregador.origem}|${[...carregador.classes].sort().join('.')}|${[...carregador.atributos].sort().join(' ')}`;
    if (!unicos.has(chave)) unicos.set(chave, carregador);
  }
  return {
    carregadores: [...unicos.values()],
    naoAtribuidos,
    ignorados,
    naoContabilizados,
    elementos,
  };
}

// ---------------------------------------------------------- a cascata viva --

/** Posição inicial de cada linha, para transformar um deslocamento em endereço. */
const inicioDasLinhas = (texto) => {
  const inicios = [0];
  for (let i = 0; i < texto.length; i += 1) if (texto[i] === '\n') inicios.push(i + 1);
  return inicios;
};

function linhaDe(inicios, posicao) {
  let baixo = 0;
  let alto = inicios.length - 1;
  while (baixo < alto) {
    const meio = Math.ceil((baixo + alto) / 2);
    if (inicios[meio] <= posicao) baixo = meio;
    else alto = meio - 1;
  }
  return baixo + 1;
}

/**
 * A marca que autoriza uma regra a vencer o `hidden` de propósito:
 * `hidden: <motivo>` no comentário que abre a regra. Sem a marca, a regra que
 * pinta um elemento escondido é defeito; com ela, é decisão escrita no lugar
 * onde quem lê a folha vai tropeçar nela — que é o que o defeito do painel da
 * missão não era.
 */
const MARCA_DELIBERADA = /\bhidden\s*:\s*\S/;

/**
 * O trecho entre o fim da regra anterior e o corpo desta: comentários que a
 * antecedem mais o próprio seletor. É ali que a marca é procurada.
 */
const regiaoDaMarca = (texto, regra) =>
  texto.slice(regra.preludioInicio ?? 0, regra.posicao ?? 0);

/** Declarações de `display` das folhas, na ordem da cascata. */
export function declaracoesDeDisplay(folhas) {
  const saida = [];
  for (const folha of folhas) {
    const texto = semCr(folha.texto);
    const inicios = inicioDasLinhas(texto);
    for (const regra of analisarRegras(texto)) {
      const [media, seletor] = regra.key.split('||');
      // `@media print` fica fora: o defeito desta classe é de tela.
      if (media && /print/i.test(media)) continue;
      for (const declaracao of regra.decls) {
        const corte = declaracao.indexOf(':');
        if (corte < 1) continue;
        if (declaracao.slice(0, corte).trim().toLowerCase() !== 'display') continue;
        const valor = declaracao.slice(corte + 1).trim();
        const marca = regiaoDaMarca(texto, regra);
      for (const pedaco of compostosDe(seletor)) {
          const cadeia = cadeiaDoSeletor(pedaco);
          if (!cadeia.length) continue;
          saida.push({
            folha: folha.nome,
            ordem: folha.ordem ?? 0,
            media: media || null,
            seletor: pedaco,
            cadeia,
            valor,
            esconde: /^none$/i.test(valor.replace(/\s*!important$/i, '')),
            importante: /!important$/i.test(valor),
            espec: especificidade(pedaco),
            posicao: regra.posicao ?? 0,
            // Onde a REGRA começa (o fim da anterior). Dois seletores de uma
            // mesma lista compartilham este endereço — é ele que identifica a
            // regra, e não o seletor, quando a declaração deliberada é contada.
            regraInicio: regra.preludioInicio ?? 0,
            linha: linhaDe(inicios, regra.posicao ?? 0),
            deliberada: MARCA_DELIBERADA.test(marca),
          });
        }
      }
    }
  }
  return saida;
}

const chaveDe = (declaracao) => [
  declaracao.importante ? 1 : 0,
  ...declaracao.espec,
  declaracao.ordem,
  declaracao.posicao,
];

const compara = (x, y) => {
  const a = chaveDe(x);
  const b = chaveDe(y);
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/**
 * Alvos que o cliente esconde e que NENHUMA fonte viva escreve.
 *
 * Um carregador sem marcação não tem como ser julgado — a simulação só conhece
 * o que o seletor exige, e por isso qualquer regra "pode" casar com ele. A
 * entrada aqui é a decisão humana dizendo que não há elemento para pintar, com
 * o motivo escrito. O portão cobra dos dois lados: alvo sem marcação fora desta
 * lista reprova, e entrada desta lista que já não aparece nos fontes também
 * (isenção que virou mentira sai).
 */
export const SEM_ELEMENTO = new Map([
  [
    '[data-toast]',
    'o toast morava nas páginas clássicas retiradas (evidence/original-public/game/station-*.html): em fonte viva `toast()` consulta o elemento e sai cedo, sem nada para pintar',
  ],
]);

/**
 * O que o portão procura: carregador do `hidden` cuja cascata de `display` NÃO
 * resolve em `none`. Para revelador vale `sim` e `incerto` (pode pintar); para
 * protetor, só `sim` (cobertura com certeza).
 */
export function conflitosDeDisplay({ folhas, fontes }) {
  const { carregadores, naoAtribuidos, ignorados, naoContabilizados } = carregadoresDasFontes(fontes);
  const declaracoes = declaracoesDeDisplay(folhas);
  const conflitos = [];
  const semMarcacao = [];
  const deliberados = [];
  let avaliados = 0;
  const semElemento = new Set();
  for (const carregador of carregadores) {
    if (carregador.semMarcacao) {
      semMarcacao.push({
        seletor: carregador.semMarcacao,
        origem: carregador.origem,
        declarado: SEM_ELEMENTO.has(carregador.semMarcacao),
      });
      if (SEM_ELEMENTO.has(carregador.semMarcacao)) {
        semElemento.add(carregador.semMarcacao);
        continue;
      }
    }
    const candidatas = [];
    for (const declaracao of declaracoes) {
      const veredito = casaCadeia(declaracao.cadeia, carregador);
      if (veredito === null || veredito === NAO) continue;
      if (declaracao.esconde && veredito !== SIM) continue; // protetor exige certeza
      candidatas.push(declaracao);
    }
    if (!candidatas.length) continue;
    avaliados += 1;
    const vencedor = candidatas.reduce((melhor, atual) => (compara(atual, melhor) > 0 ? atual : melhor));
    if (vencedor.esconde) continue;
    const registro = { carregador, vencedor, protetores: candidatas.filter((d) => d.esconde) };
    if (vencedor.deliberada) deliberados.push(registro);
    else conflitos.push(registro);
  }
  return {
    conflitos,
    deliberados,
    avaliados,
    carregadores,
    naoAtribuidos,
    ignorados,
    naoContabilizados,
    semMarcacao,
    semElemento,
    declaracoes: declaracoes.length,
  };
}

const descreverCarregador = (carregador) => {
  const classes = [...carregador.classes].map((c) => `.${c}`).join('');
  const atributos = [...carregador.atributos].map((a) => `[${a}]`).join('');
  return `${carregador.origem} (${carregador.como ?? 'atributo'}) ${carregador.tag ?? '*'}${classes}${atributos}`;
};

/** Relato legível: o carregador, a regra que vence e os protetores que perderam. */
export function relatarConflitos(conflitos, limite = 20) {
  return conflitos
    .slice(0, limite)
    .map((c) => {
      const { vencedor, carregador } = c;
      const perdedores = c.protetores
        .slice()
        .sort(compara)
        .reverse()
        .slice(0, 2)
        .map((p) => `${p.folha}:${p.linha} ${p.seletor} -> ${p.valor}`)
        .join(' | ');
      return (
        `  ${descreverCarregador(carregador)}\n` +
        `     vence: ${vencedor.folha}:${vencedor.linha} ${vencedor.seletor} -> ${vencedor.valor}` +
        ` (${vencedor.espec.join('-')}${vencedor.importante ? ' !important' : ''})\n` +
        `     protetores que perdem${perdedores ? `: ${perdedores}` : ' (nenhum)'}`
      );
    })
    .join('\n');
}

/** As folhas vivas em disco, na ordem em que as páginas as carregam. */
export function lerFolhas(raiz) {
  return FOLHAS.map((folha) => ({
    ...folha,
    texto: readFileSync(new URL(`public/assets/css/${folha.nome}`, raiz), 'utf8'),
  }));
}
