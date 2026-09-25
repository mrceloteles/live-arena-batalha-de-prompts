// Leitura da cascata declarada do CSS do projeto.
//
// Serve aos dois portões que provam que uma mudança de estilo não mexeu na tela:
// - `test/css/cascata.test.mjs` compara, folha por folha, o valor efetivo de cada
//   propriedade de cada seletor contra um instantâneo versionado;
// - `test/browser/css-render.test.mjs` usa o mesmo vocabulário para falar das
//   folhas carregadas de verdade.
//
// A ordem de folha é a ordem em que as páginas as carregam: numa colisão de
// mesma especificidade, quem vem depois vence. `!important` vence antes disso.

export const FOLHAS = [
  { nome: 'app-authorial.css', ordem: 0 },
  { nome: 'arena.css', ordem: 1 },
  { nome: 'design.css', ordem: 2 },
  { nome: 'refinement.css', ordem: 3 },
  // A jornada do aluno tem folha própria (`aluno.css`) e entra ENTRE a última
  // palavra do produto e a rodada — exatamente a vizinhança de cascata que os
  // seletores dela tinham quando viviam no fim de `refinement.css`.
  { nome: 'aluno.css', ordem: 4 },
  { nome: 'round.css', ordem: 5 },
];

// A folha capturada do site base não é carregada por nenhuma página: ela é
// exigida pelo `evidence/manifest.json`, então não conta como órfã.
export const FOLHA_DE_CONTRATO = 'app.css';

export const semCr = (texto) => texto.replace(/\r\n/g, '\n');
export const limpo = (texto) => texto.replace(/\s+/g, ' ').trim();

/**
 * Regras de estilo na ordem em que aparecem, com o contexto `@media`/`@supports`
 * que as envolve. Regras dentro de `@keyframes` são ignoradas: elas não
 * participam da cascata.
 */
export function analisarRegras(texto) {
  const regras = [];
  const pilha = [];
  let preludio = '';
  // Onde o prelúdio (seletor) da regra corrente começou. É o endereço para trás
  // de quem precisa ler o comentário que antecede a regra — o portão do `hidden`
  // cobra ali a declaração de quem vence o atributo de propósito.
  let inicioDoPreludio = 0;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2);
      i = fim === -1 ? texto.length : fim + 2;
      continue;
    }
    if (c === '{') {
      const p = preludio.trim();
      preludio = '';
      if (p.startsWith('@')) {
        pilha.push({ tipo: 'at', nome: (p.match(/^@([a-z-]+)/i) || [])[1].toLowerCase(), preludio: limpo(p) });
      } else {
        pilha.push({
          tipo: 'regra',
          seletor: p,
          iniciar: i + 1,
          preludioInicio: inicioDoPreludio,
          ignorar: pilha.some((f) => f.nome === 'keyframes'),
          media: pilha.filter((f) => f.tipo === 'at' && f.nome !== 'keyframes').map((f) => f.preludio),
        });
      }
      i += 1;
      continue;
    }
    if (c === '}') {
      inicioDoPreludio = i + 1;
      const frame = pilha.pop();
      if (frame && frame.tipo === 'regra' && !frame.ignorar) {
        regras.push({
          key: `${frame.media.join(' && ')}||${limpo(frame.seletor)}`,
          preludioInicio: frame.preludioInicio,
          // Posição do início do corpo: quem relata um problema aponta a linha
          // em vez de mandar procurar o seletor no arquivo. O cartório seriado
          // não usa este campo (só `key` e `decls`).
          posicao: frame.iniciar,
          // O comentário sai ANTES de partir em declarações. Sem isto, o `:`
          // de dentro do comentário vira o nome da propriedade e a declaração
          // seguinte some do contrato — uma regressão nessa linha passaria
          // despercebida, e foi assim que 12 seletores do cartório ficaram
          // com uma declaração invisível.
          decls: texto
            .slice(frame.iniciar, i)
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .split(';')
            .map((d) => limpo(d))
            .filter(Boolean),
        });
      }
      preludio = '';
      i += 1;
      continue;
    }
    if (c === ';' && !pilha.length) {
      preludio = '';
      i += 1;
      continue;
    }
    preludio += c;
    i += 1;
  }
  return regras;
}

export const chaveDe = (regra) => `${regra.media.join(' && ')}||${limpo(regra.seletor)}`;

/**
 * Todas as declarações das folhas, na ordem em que a cascata as encontra, com a
 * origem de cada uma: folha, linha da regra, seletor e contexto de mídia.
 *
 * É a base comum de `cascataDe` (o vencedor de cada chave) e de
 * `declaracoesMortas` (quem perde na própria chave). As duas leem a MESMA lista,
 * então não podem discordar sobre o que a cascata faz — que é exatamente o
 * defeito que uma segunda implementação da mesma regra traria.
 */
export function declaracoesDaCascata(arquivos) {
  const saida = [];
  for (const arquivo of arquivos) {
    const texto = semCr(arquivo.texto);
    for (const regra of analisarRegras(texto)) {
      const [media, seletor] = regra.key.split('||');
      const linha = texto.slice(0, regra.posicao ?? 0).split('\n').length;
      for (const declaracao of regra.decls) {
        const corte = declaracao.indexOf(':');
        if (corte < 1) continue;
        const valor = declaracao.slice(corte + 1).trim();
        saida.push({
          chave: regra.key,
          media: media || null,
          seletor,
          folha: arquivo.nome,
          linha,
          propriedade: declaracao.slice(0, corte).trim().toLowerCase(),
          valor,
          importante: /!important$/i.test(valor),
        });
      }
    }
  }
  return saida;
}

/** A nova substitui a anterior quando é `!important`, ou quando a anterior não é. */
const substitui = (atual, nova) => !atual || nova.importante || !atual.importante;

/**
 * Para cada seletor (e contexto de mídia), o valor que sobrevive à cascata:
 * `!important` vence; empate de importância resolve pela última declaração.
 */
export function cascataDe(arquivos) {
  const porChave = new Map();
  for (const declaracao of declaracoesDaCascata(arquivos)) {
    if (!porChave.has(declaracao.chave)) porChave.set(declaracao.chave, []);
    porChave.get(declaracao.chave).push(declaracao);
  }
  const saida = new Map();
  for (const [chave, declaracoes] of porChave) {
    const vencedores = new Map();
    for (const declaracao of declaracoes) {
      const atual = vencedores.get(declaracao.propriedade);
      if (substitui(atual, declaracao)) {
        vencedores.set(declaracao.propriedade, {
          valor: declaracao.valor,
          importante: declaracao.importante,
          origem: { folha: declaracao.folha, linha: declaracao.linha },
        });
      }
    }
    saida.set(chave, vencedores);
  }
  return saida;
}

/**
 * Declarações que perdem a cascata na PRÓPRIA chave: existem no arquivo e não
 * existem em tela nenhuma.
 *
 * Por que isso merece portão. A chave é o par (media, seletor); duas declarações
 * da mesma propriedade na mesma chave disputam exatamente os mesmos elementos, e
 * a cascata escolhe uma. A que perde não se aplica a elemento algum — nem por
 * herança, porque ninguém herda de uma declaração que nunca vale. Logo ela é
 * inerte para a tela e cara para quem lê o arquivo: sem consultar o cartório,
 * quem abre a folha não sabe qual dos dois valores está vivo. Foi assim que
 * `design.css` acumulou 22 pares de tinta e fundo mortos, apagados em 16/09.
 *
 * O limite, declarado: a comparação é por NOME de propriedade. `background` e
 * `background-color` são propriedades diferentes aqui, mesmo que o atalho apague
 * o longo no navegador; e `@layer`/`@scope` não existem nestas folhas (se um dia
 * existirem, a chave precisa deles). Nos dois casos a régua erra para o lado de
 * NÃO acusar, que é o lado certo para um portão que pede olho humano.
 */
export function declaracoesMortas(arquivos) {
  const porChave = new Map();
  for (const declaracao of declaracoesDaCascata(arquivos)) {
    if (!porChave.has(declaracao.chave)) porChave.set(declaracao.chave, new Map());
    const porPropriedade = porChave.get(declaracao.chave);
    if (!porPropriedade.has(declaracao.propriedade)) porPropriedade.set(declaracao.propriedade, []);
    porPropriedade.get(declaracao.propriedade).push(declaracao);
  }
  const mortas = [];
  for (const [chave, porPropriedade] of porChave) {
    for (const [propriedade, lista] of porPropriedade) {
      if (lista.length < 2) continue;
      let vencedora = null;
      for (const declaracao of lista) if (substitui(vencedora, declaracao)) vencedora = declaracao;
      for (const declaracao of lista) {
        if (declaracao === vencedora) continue;
        mortas.push({
          chave,
          propriedade,
          valor: declaracao.valor,
          importante: declaracao.importante,
          folha: declaracao.folha,
          linha: declaracao.linha,
          seletor: declaracao.seletor,
          media: declaracao.media,
          vencedor: {
            valor: vencedora.valor,
            importante: vencedora.importante,
            folha: vencedora.folha,
            linha: vencedora.linha,
          },
        });
      }
    }
  }
  return mortas;
}

/**
 * Identidade estável de uma declaração morta — sem a linha, que anda quando
 * alguém edita acima. É o que o instantâneo da catraca guarda: uma declaração
 * nova que nasce morta não pode se esconder atrás de uma mudança de número.
 */
export const identidadeDaMorta = (m) =>
  `${m.folha}|${m.media ?? ''}|${m.seletor}|${m.propriedade}:${m.valor}`;

/**
 * Identidades da lista inteira, na ordem do arquivo, com ordinal onde a MESMA
 * declaração morta se repete na mesma chave (uma regra que declara `gap` duas
 * vezes tem duas mortas idênticas). O ordinal sai da ordem de leitura, então o
 * conjunto é estável mesmo se as duas trocarem de lugar.
 */
export function identidadesDeMortas(mortas) {
  const vistos = new Map();
  return mortas.map((morta) => {
    const base = identidadeDaMorta(morta);
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return `${base}#${n}`;
  });
}

/** Contagens do instantâneo: total, por folha e por propriedade. */
export function resumoMortas(mortas) {
  const porFolha = {};
  const porPropriedade = {};
  for (const morta of mortas) {
    porFolha[morta.folha] = (porFolha[morta.folha] || 0) + 1;
    porPropriedade[morta.propriedade] = (porPropriedade[morta.propriedade] || 0) + 1;
  }
  const ordenar = (objeto) =>
    Object.fromEntries(Object.entries(objeto).sort(([a], [b]) => a.localeCompare(b)));
  return { total: mortas.length, porFolha: ordenar(porFolha), porPropriedade: ordenar(porPropriedade) };
}

/** Relatório de quem foi pego: onde está, o que perde e para quem. */
export function relatarMortas(mortas, limite = 20) {
  return mortas
    .slice(0, limite)
    .map(
      (m) =>
        `  ${m.folha}:${m.linha} ${m.media ? `@${m.media} ` : ''}${m.seletor}\n` +
        `     ${m.propriedade}: ${m.valor}  (vence: ${m.vencedor.valor} em ${m.vencedor.folha}:${m.vencedor.linha})`,
    )
    .join('\n');
}

/** Forma estável para versionar: uma linha por seletor, propriedades ordenadas. */
export function serializar(cascata) {
  const objeto = {};
  for (const chave of [...cascata.keys()].sort()) {
    const vencedores = cascata.get(chave);
    objeto[chave] = [...vencedores.keys()]
      .sort()
      .map((p) => {
        const { valor, importante } = vencedores.get(p);
        return `${p}:${valor}${importante ? ' !important' : ''}`;
      })
      .join(';');
  }
  return objeto;
}

/** Diferenças legíveis entre dois instantâneos seriados. */
export function diferenças(esperado, atual, limite = 20) {
  const falhas = [];
  for (const chave of new Set([...Object.keys(esperado), ...Object.keys(atual)])) {
    const a = esperado[chave];
    const b = atual[chave];
    if (a === b) continue;
    if (a === undefined) {
      falhas.push({ chave, resumo: 'seletor novo (não existia no instantâneo)', detalhes: [] });
      continue;
    }
    if (b === undefined) {
      falhas.push({ chave, resumo: 'seletor desapareceu', detalhes: [] });
      continue;
    }
    const antes = new Map(a.split(';').map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]));
    const depois = new Map(b.split(';').map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]));
    const detalhes = [];
    for (const p of new Set([...antes.keys(), ...depois.keys()])) {
      if (antes.get(p) === depois.get(p)) continue;
      detalhes.push(`${p}: ${antes.get(p) ?? '(ausente)'} -> ${depois.get(p) ?? '(ausente)'}`);
    }
    falhas.push({ chave, resumo: `${detalhes.length} propriedade(s)`, detalhes });
  }
  return { total: falhas.length, amostra: falhas.slice(0, limite) };
}

export function relatar(falhas) {
  return falhas.amostra
    .map((f) => `  ${f.chave}\n     ${f.resumo}${f.detalhes.length ? `\n       ${f.detalhes.slice(0, 6).join('\n       ')}` : ''}`)
    .join('\n');
}

/**
 * Fim do cabeçalho de uma folha: onde terminam os `@import`/`@charset`.
 * O `;` só conta fora de aspas e parênteses — a URL do Google Fonts tem `;` na
 * faixa de eixo variável, e cortar ali invalida a folha inteira.
 */
export function fimDoCabecalho(texto) {
  let i = 0;
  while (i < texto.length) {
    if (/\s/.test(texto[i])) {
      i += 1;
      continue;
    }
    if (texto[i] === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2);
      i = fim === -1 ? texto.length : fim + 2;
      continue;
    }
    if (/^@(import|charset|layer|namespace)\b/i.test(texto.slice(i, i + 12))) {
      let j = i;
      let profundidade = 0;
      let aspa = null;
      while (j < texto.length) {
        const c = texto[j];
        if (aspa) {
          if (c.charCodeAt(0) === 92) {
            j += 2;
            continue;
          }
          if (c === aspa) aspa = null;
          j += 1;
          continue;
        }
        if (c === '"' || c === "'") {
          aspa = c;
          j += 1;
          continue;
        }
        if (c === '(') {
          profundidade += 1;
          j += 1;
          continue;
        }
        if (c === ')') {
          profundidade -= 1;
          j += 1;
          continue;
        }
        if (c === ';' && profundidade === 0) {
          j += 1;
          break;
        }
        if (c === '{') break;
        j += 1;
      }
      i = j;
      continue;
    }
    break;
  }
  return i;
}

export function cabecalhoDe(texto) {
  const normalizado = semCr(texto);
  return normalizado
    .slice(0, fimDoCabecalho(normalizado))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chavesBalanceadas(texto) {
  let nivel = 0;
  for (const c of semCr(texto)) {
    if (c === '{') nivel += 1;
    else if (c === '}') nivel -= 1;
    if (nivel < 0) return false;
  }
  return nivel === 0;
}
