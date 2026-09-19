// Tira das folhas vivas o composto que exige uma classe que ninguém produz,
// preservando os vizinhos da mesma lista de seletores.
//
// Por que existe: a guarda `test/css/classes-vivas.test.mjs` diz exatamente quais
// classes ficaram sem produtor depois que alguém tirou marcação, mas a folha é
// minificada — a lista de seletores é compartilhada (`.portal-hint, .arena-empty,
// .arena-counter { ... }`) e apagar a regra inteira levaria junto o estilo de
// classes vivas. Este instrumento recorta por COMPOSTO, com o mesmo predicado da
// guarda (`classesDe`, que ignora `:not(...)`): o que sai é exatamente o que ela
// condena — nem mais, nem menos.
//
// Uso:
//   node scripts/remover-css-morto.mjs --list portal-kicker portal-hint
//   node scripts/remover-css-morto.mjs --apply portal-kicker portal-hint
//
// Recebe as classes sem produtor (a lista sai do relatório da guarda, ou de uma
// leitura como `node tmp/qa/orfas.mjs`). `--list` mostra o que sairia, com
// arquivo:linha:coluna; `--apply` reescreve as folhas em disco.
//
// Depois de aplicar, a prova é a mesma da faxina de CSS, e são três portões:
//   node --test test/css/classes-vivas.test.mjs   (nenhuma classe sem produtor)
//   UPDATE_CSS_BASELINE=1 node --test test/css/cascata.test.mjs
//   UPDATE_CSS_BASELINE=1 npm run test:browser     (o estilo por elemento)
//
// A cascata regravada tem de mostrar o que se espera: os seletores que saíram e
// NENHUMA declaração alterada nos que ficaram. Se aparecer um "ALTERADO", o
// recorte pegou um composto que não era só seu — volte uma etapa.
import { readFileSync, writeFileSync } from 'node:fs';

import { FOLHAS } from '../test/support/cascata-css.mjs';
import { classesDe, compostosDe, localizar } from '../test/support/classes-vivas.mjs';

const RAIZ = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const aplicar = args.includes('--apply');
const alvos = args.filter((arg) => !arg.startsWith('--'));

if (!alvos.length) {
  console.error('passe as classes a remover: --list <classe...> | --apply <classe...>');
  process.exit(2);
}

/** Regras de estilo com os offsets absolutos do prelúdio e do fim da regra. */
function regrasComOffset(texto) {
  const regras = [];
  const pilha = [];
  let inicio = 0;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2);
      i = fim === -1 ? texto.length : fim + 2;
      continue;
    }
    if (c === '{') {
      const preludio = texto.slice(inicio, i).trim();
      pilha.push({
        tipo: preludio.startsWith('@') ? 'at' : 'regra',
        preludioInicio: inicio,
        preludioFim: i,
        dentroDeKeyframes: pilha.some((f) => /^@(-[a-z]+-)?keyframes\b/i.test(f.preludio || '')),
      });
      i += 1;
      inicio = i;
      continue;
    }
    if (c === '}') {
      const quadro = pilha.pop();
      if (quadro && quadro.tipo === 'regra' && !quadro.dentroDeKeyframes) {
        regras.push({ ...quadro, fim: i + 1 });
      }
      i += 1;
      inicio = i;
      continue;
    }
    if (c === ';' && !pilha.length) {
      i += 1;
      inicio = i;
      continue;
    }
    i += 1;
  }
  return regras;
}

let total = 0;
for (const folha of FOLHAS) {
  const caminho = new URL(`public/assets/css/${folha.nome}`, RAIZ);
  const texto = readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
  const edicoes = [];
  let saida = 0;
  for (const regra of regrasComOffset(texto)) {
    const preludio = texto.slice(regra.preludioInicio, regra.preludioFim);
    const compostos = compostosDe(preludio.trim());
    const condenados = compostos.filter((composto) =>
      classesDe(composto).some((classe) => alvos.includes(classe)),
    );
    if (!condenados.length) continue;
    saida += condenados.length;
    const restantes = compostos.filter((composto) => !condenados.includes(composto));
    const primeira = /\.([\w-]+)/.exec(condenados[0]);
    const local = primeira ? localizar(texto, primeira[1]) : null;
    const onde = local ? `${folha.nome}:${local.linha}:${local.coluna}` : folha.nome;
    console.log(
      `  ${onde}${restantes.length ? ' (parcial)' : ''}\n` +
        `    sai: ${condenados.join(' , ')}\n` +
        (restantes.length ? `    fica: ${restantes.join(' , ')}\n` : ''),
    );
    edicoes.push(
      restantes.length
        ? { inicio: regra.preludioInicio, fim: regra.preludioFim, texto: restantes.join(', ') }
        : { inicio: regra.preludioInicio, fim: regra.fim, texto: '' },
    );
  }
  total += saida;
  if (!aplicar || !edicoes.length) {
    if (!edicoes.length) console.log(`  ${folha.nome}: nada a remover`);
    continue;
  }
  let novo = texto;
  for (const edicao of [...edicoes].sort((a, b) => b.inicio - a.inicio)) {
    novo = novo.slice(0, edicao.inicio) + edicao.texto + novo.slice(edicao.fim);
  }
  writeFileSync(caminho, novo);
  console.log(`  ${folha.nome}: ${edicoes.length} regra(s) reescrita(s) em disco`);
}
console.log(`\n${aplicar ? 'removidos' : 'removeria(m)'} ${total} composto(s).`);
