// PLANO DE CORTE das declarações que perdem a cascata na própria chave.
//
// Localiza cada declaração morta pelo CORPO da regra dona — não por varredura de
// linha, que erra em folha minificada onde dezenas de regras moram na linha 1 —
// e imprime o que sairia, com o deslocamento exato no arquivo.
//
//   node output/qa/plano-corte.mjs          (revisão)
//   node output/qa/plano-corte.mjs aplicar  (escreve os arquivos)
//
// Três cuidados que o corte precisa, e que estão conferidos aqui:
//  1. comentário e string viram ESPAÇO do mesmo tamanho numa máscara paralela, e
//     todo o trabalho estrutural (achar o `}`, achar o começo da regra) usa a
//     máscara: assim um `}` dentro de `content: "}"` não engana ninguém;
//  2. a declaração é identificada pelo texto normalizado, comparado com o que a
//     cascata leu (`regra.decls`) — se a partição do corpo discordar do contrato,
//     o script ABORTA em vez de apagar a coisa errada;
//  3. regra cujas declarações morrem TODAS sai inteira. É seguro pelo mesmo
//     motivo que apagar a declaração: a chave continua com a regra que venceu.
import { readFileSync, writeFileSync } from 'node:fs';

import {
  FOLHAS,
  analisarRegras,
  declaracoesMortas,
  limpo,
  semCr,
} from '../../test/support/cascata-css.mjs';

const aplicar = process.argv.includes('aplicar');
const folhas = FOLHAS.map((folha) => ({
  ...folha,
  texto: semCr(readFileSync(`public/assets/css/${folha.nome}`, 'utf8')),
}));

/** Comentário e string viram espaços, preservando o comprimento (offsets alinhados). */
function mascara(texto) {
  const saida = texto.split('');
  const apagar = (de, ate) => {
    for (let i = de; i < ate; i += 1) saida[i] = ' ';
  };
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2);
      const ate = fim === -1 ? texto.length : fim + 2;
      apagar(i, ate);
      i = ate;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < texto.length) {
        if (texto[j] === '\\') {
          j += 2;
          continue;
        }
        if (texto[j] === c) break;
        j += 1;
      }
      apagar(i + 1, j);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return saida.join('');
}

/** Regras com o corpo, o `}` e o começo do SELETOR em deslocamento absoluto. */
function regrasComCorpo(folha, problemas) {
  const texto = folha.texto;
  const mask = mascara(texto);
  const saida = [];
  for (const regra of analisarRegras(texto)) {
    const inicio = regra.posicao; // logo depois do `{`
    let fim = inicio;
    while (fim < texto.length && mask[fim] !== '}') fim += 1;
    const abre = inicio - 1; // o `{`
    // O começo da regra é o que vem depois do último `{`, `}` ou `;` estrutural.
    // Contar a partir do corpo (e não do `{`) é o erro que deixa `seletor {`
    // órfão no arquivo e inventa chave nova na leitura seguinte.
    let de = abre;
    while (de > 0 && !['{', '}', ';'].includes(mask[de - 1])) de -= 1;
    // Comentário e espaço entre o limite e o seletor não são da regra.
    for (;;) {
      while (de < abre && /\s/.test(texto[de])) de += 1;
      if (texto.startsWith('/*', de)) {
        const fecha = texto.indexOf('*/', de + 2);
        de = fecha === -1 ? abre : fecha + 2;
        continue;
      }
      break;
    }
    const seletor = regra.key.split('||')[1];
    if (limpo(texto.slice(de, abre)) !== seletor) {
      problemas.push(`${folha.nome}:${regra.key} prelúdio lido como "${limpo(texto.slice(de, abre)).slice(0, 60)}"`);
      continue;
    }
    saida.push({ ...regra, inicio, fim, inicioRegra: de, abre, linha: texto.slice(0, inicio).split('\n').length });
  }
  return saida;
}

/**
 * Declarações do corpo, cada uma com o deslocamento e o comprimento exatos.
 *
 * `texto` é o corpo com comentário trocado por ESPAÇO DE MESMO TAMANHO: o
 * contrato (`regra.decls`) faz a mesma troca antes de partir em `;`, e é essa a
 * comparação que vale. O corte no arquivo usa só o deslocamento e o comprimento,
 * então o comentário continua no lugar até a hora de apagar.
 */
function partesDoCorpo(texto, regra) {
  const limpoCorpo = texto
    .slice(regra.inicio, regra.fim)
    .replace(/\/\*[\s\S]*?\*\//g, (achado) => ' '.repeat(achado.length));
  const partes = [];
  let offset = 0;
  for (const parte of limpoCorpo.split(';')) {
    partes.push({ offset, comprimento: parte.length, conteudo: parte });
    offset += parte.length + 1;
  }
  return partes;
}

const planos = [];
const problemas = [];
// A morte é julgada na cascata INTEIRA (as cinco folhas, na ordem em que as
// páginas as carregam): uma declaração pode perder para um vencedor que mora em
// outra folha, e cortar só as mortes internas de cada folha deixaria essas vivas
// no arquivo. Aqui cada morta é localizada na folha dela, que é onde o
// deslocamento existe.
const todasMortas = declaracoesMortas(folhas);
let consumidas = 0;

for (const folha of folhas) {
  const texto = folha.texto;
  const regras = regrasComCorpo(folha, problemas);
  // Nenhuma regra da folha pode sair daqui com o prelúdio não reconhecido.
  if (regras.length !== analisarRegras(texto).length) {
    problemas.push(`${folha.nome}: ${analisarRegras(texto).length - regras.length} regra(s) sem prelúdio reconhecido`);
  }
  const mortasDaFolha = todasMortas.filter((morta) => morta.folha === folha.nome);

  // Cada regra confere com o contrato antes de ser candidata a corte: se a
  // partição do corpo discordar do que a cascata leu, nada nesta folha é cortado.
  const partesPorRegra = new Map();
  for (const regra of regras) {
    const partes = partesDoCorpo(texto, regra);
    partesPorRegra.set(regra, partes);
    const lidas = partes.map((p) => limpo(p.conteudo)).filter(Boolean);
    const doContrato = regra.decls;
    if (lidas.length !== doContrato.length || lidas.some((d, i) => d !== doContrato[i])) {
      problemas.push(`${folha.nome}:${regra.linha} ${regra.key.split('||')[1]}: corpo não bate com o contrato`);
    }
  }

  // A folha minificada põe dezenas de regras na mesma linha, e várias com a MESMA
  // chave. Quem diz de quem é cada morta é a ordem de leitura: dentro de uma
  // chave, o perdedor de uma identidade é toda declaração dela menos a última.
  // Então os alvos viram um bolo por (chave, linha) e cada regra do grupo come
  // os que ela tem, na ordem do arquivo.
  const bolos = new Map();
  for (const morta of mortasDaFolha) {
    const grupo = `${morta.chave}@${morta.linha}`;
    if (!bolos.has(grupo)) bolos.set(grupo, new Map());
    const bolo = bolos.get(grupo);
    const identidade = `${morta.propriedade}\u0000${morta.valor}`;
    bolo.set(identidade, (bolo.get(identidade) ?? 0) + 1);
  }

  const porGrupo = new Map();
  for (const regra of regras) {
    const grupo = `${regra.key}@${regra.linha}`;
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push(regra);
  }

  for (const [grupo, doGrupo] of porGrupo) {
    const restantes = new Map(bolos.get(grupo) ?? []);
    if (!restantes.size) continue;

    for (const regra of doGrupo) {
      const partes = partesPorRegra.get(regra);
      const marcadas = [];
      for (const parte of partes) {
        const normalizada = limpo(parte.conteudo);
        if (!normalizada) continue;
        const corte = normalizada.indexOf(':');
        if (corte < 1) continue;
        const identidade = `${normalizada.slice(0, corte).trim()}\u0000${normalizada.slice(corte + 1).trim()}`;
        if ((restantes.get(identidade) ?? 0) > 0) {
          restantes.set(identidade, restantes.get(identidade) - 1);
          marcadas.push(parte);
        }
      }
      if (!marcadas.length) continue;
      consumidas += marcadas.length;

      const vivas = partes.filter(
        (parte) => limpo(parte.conteudo) && !marcadas.includes(parte),
      ).length;
      if (vivas === 0) {
        // A regra inteira sai: sobra dela nenhuma declaração.
        // A folga em branco entre regras vai para quem estiver ANTES dela: só
        // para trás. Reivindicada dos dois lados, dois vizinhos removidos geram
        // spans sobrepostos — foi o que a conferência pegou antes de gravar.
        let de = regra.inicioRegra;
        while (de > 0 && /\s/.test(texto[de - 1])) de -= 1;
        if (texto[regra.fim] !== '}') problemas.push(`${folha.nome}:${regra.linha} o fim da regra não é um fecha-chaves`);
        const ate = regra.fim + 1;
        planos.push({ folha: folha.nome, linha: regra.linha, seletor: regra.key.split('||')[1], media: regra.key.split('||')[0], regra: true, mortas: marcadas.length, de, ate, bruto: texto.slice(de, ate) });
        continue;
      }
      for (const parte of marcadas) {
        // O corte leva o `;` que segue a declaração. A última do corpo pode não
        // ter `;` nenhum — aí sai só o texto dela, porque engolir o `;` anterior
        // seria engolir a declaração de cima, e duas vizinhas marcadas gerariam
        // spans sobrepostos.
        const ultima = parte === partes[partes.length - 1];
        const de = regra.inicio + parte.offset;
        const ate = de + parte.comprimento + (ultima ? 0 : 1);
        planos.push({ folha: folha.nome, linha: regra.linha, seletor: regra.key.split('||')[1], media: regra.key.split('||')[0], regra: false, mortas: 1, de, ate, bruto: texto.slice(de, ate) });
      }
    }

    const sobrou = [...restantes.values()].some((n) => n > 0);
    if (sobrou) {
      problemas.push(`${folha.nome} ${grupo.split('@')[0].split('||')[1]}: morta sem declaração no corpo`);
    }
  }
}

const porFolha = {};
// Spans sobrepostos quebrariam o corte (aplicado do fim para o começo): melhor
// descobrir aqui do que gravar arquivo pela metade.
for (const folha of folhas) {
  const alvos = planos.filter((p) => p.folha === folha.nome).sort((a, b) => a.de - b.de);
  for (let i = 1; i < alvos.length; i += 1) {
    if (alvos[i].de < alvos[i - 1].ate) {
      problemas.push(
        `${folha.nome}: spans sobrepostos em ${alvos[i].de} (${alvos[i].seletor})\n` +
          `      antes: [${alvos[i - 1].de},${alvos[i - 1].ate}) ${alvos[i - 1].regra ? 'REGRA' : 'decl'} ${alvos[i - 1].seletor} ${JSON.stringify(alvos[i - 1].bruto.slice(-60))}\n` +
          `      agora: [${alvos[i].de},${alvos[i].ate}) ${alvos[i].regra ? 'REGRA' : 'decl'} ${alvos[i].seletor} ${JSON.stringify(alvos[i].bruto.slice(0, 60))}`,
      );
    }
  }
}
for (const plano of planos) {
  const alvo = (porFolha[plano.folha] ??= { declaracoes: 0, regras: 0 });
  alvo.declaracoes += plano.mortas;
  alvo.regras += plano.regra ? 1 : 0;
}

console.log(`declarações mortas na cascata inteira: ${todasMortas.length}`);
console.log(`declarações localizadas para corte: ${consumidas}`);
console.log(`spans de corte: ${planos.length}`);
if (consumidas !== todasMortas.length) {
  problemas.push(`localizadas ${consumidas} de ${todasMortas.length}: sobrou declaração sem dona`);
}
for (const [folha, conta] of Object.entries(porFolha)) {
  console.log(`  ${folha.padEnd(20)} ${String(conta.declaracoes).padStart(3)} declaração(ões), ${conta.regras} regra(s) inteira(s)`);
}
if (problemas.length) {
  console.log(`\nPROBLEMAS (${problemas.length}):`);
  for (const problema of problemas.slice(0, 20)) console.log(`  ${problema}`);
}

const amostra = planos.filter((p) => p.regra).slice(0, 3);
if (amostra.length) {
  console.log('\nregras que saem inteiras (amostra):');
  for (const alvo of amostra) {
    console.log(`  ${alvo.folha}:${alvo.linha} ${alvo.media ? `@${alvo.media} ` : ''}${alvo.seletor}  (${alvo.mortas} morta(s))`);
    console.log(`      ${JSON.stringify(alvo.bruto.slice(0, 160))}`);
  }
}

if (!aplicar) {
  console.log('\n(simulação — rode com "aplicar" para escrever)');
  process.exit(problemas.length ? 1 : 0);
}
if (problemas.length) {
  console.log('\nABORTADO: há problema de localização.');
  process.exit(1);
}

// Aplica do fim para o começo, por folha: os deslocamentos não se deslocam.
for (const folha of folhas) {
  const alvos = planos.filter((p) => p.folha === folha.nome).sort((a, b) => b.de - a.de);
  if (!alvos.length) continue;
  let texto = folha.texto;
  for (const alvo of alvos) {
    if (texto.slice(alvo.de, alvo.ate) !== alvo.bruto) throw new Error(`deslocamento mudou em ${alvo.folha}:${alvo.linha}`);
    texto = texto.slice(0, alvo.de) + texto.slice(alvo.ate);
  }
  writeFileSync(`public/assets/css/${folha.nome}`, texto);
  console.log(`  ${folha.nome}: ${alvos.length} span(s) apagado(s)`);
}
