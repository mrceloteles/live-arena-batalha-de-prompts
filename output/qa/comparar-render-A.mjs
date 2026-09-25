// Compara os dois retratos de estilo (antes × depois) elemento por elemento.
//
//   node output/qa/comparar-render-A.mjs tmp/qa/render-antes tmp/qa/render-depois
//
// Por que uma comparação de fora: o portão 2 só diz "o estilo mudou nesta tela",
// por hash. Para atribuir a mudança a uma edição (em vez de aceitá-la), é
// preciso o que o portão não guarda — qual elemento e qual propriedade.
import { readdirSync, readFileSync } from 'node:fs';

const [dirAntes, dirDepois] = process.argv.slice(2);
if (!dirAntes || !dirDepois) {
  console.error('uso: node output/qa/comparar-render-A.mjs <antes> <depois>');
  process.exit(1);
}

const elementosDe = (caminho) =>
  readFileSync(caminho, 'utf8')
    .split('\n')
    .slice(1)
    .filter((linha) => linha.trim())
    .map((linha) => {
      // A linha é `caminho \t tag \t\t propriedades`; o primeiro campo pode
      // chegar vazio (a raiz começa com tab), então os vazios saem antes.
      const campos = linha.split('\t').filter((c) => c !== '');
      const caminhoDoNo = campos[0];
      const props = campos[campos.length - 1];
      const mapa = new Map();
      for (const par of props.split(';')) {
        const corte = par.indexOf(':');
        if (corte > 0) mapa.set(par.slice(0, corte), par.slice(corte + 1));
      }
      return { caminho: caminhoDoNo || '?', mapa };
    });

const arquivos = readdirSync(dirAntes).filter((n) => n.endsWith('.txt')).sort();
let telasMudadas = 0;
let elementosMudados = 0;
const porPropriedade = new Map();
const exemplos = [];

for (const arquivo of arquivos) {
  const antes = elementosDe(`${dirAntes}/${arquivo}`);
  let depois;
  try {
    depois = elementosDe(`${dirDepois}/${arquivo}`);
  } catch {
    console.log(`${arquivo}: sem retrato no depois`);
    continue;
  }
  if (antes.length !== depois.length) {
    console.log(`${arquivo}: número de elementos mudou (${antes.length} -> ${depois.length})`);
    continue;
  }
  const tela = [];
  for (let i = 0; i < antes.length; i += 1) {
    const a = antes[i].mapa;
    const b = depois[i].mapa;
    const props = [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p));
    if (!props.length) continue;
    elementosMudados += 1;
    for (const p of props) {
      if (!porPropriedade.has(p)) porPropriedade.set(p, []);
      porPropriedade.get(p).push(`${arquivo}:${depois[i].caminho}`);
    }
    tela.push(`${depois[i].caminho} -> ${props.map((p) => `${p}: ${a.get(p) ?? '-'} => ${b.get(p) ?? '-'}`).join(' | ')}`);
  }
  if (tela.length) {
    telasMudadas += 1;
    exemplos.push(`### ${arquivo}`);
    exemplos.push(...tela.slice(0, 6).map((l) => `  ${l}`));
    if (tela.length > 6) exemplos.push(`  ... e ${tela.length - 6} elemento(s)`);
  }
}

console.log(`telas comparadas: ${arquivos.length}`);
console.log(`telas com mudança: ${telasMudadas}`);
console.log(`elementos com mudança: ${elementosMudados}`);
console.log('\npropriedades que mudaram (elementos por propriedade):');
for (const [prop, lista] of [...porPropriedade.entries()].sort((x, y) => y[1].length - x[1].length)) {
  const exemplosDe = [...new Set(lista)].slice(0, 3).join(', ');
  console.log(`  ${prop}: ${lista.length} — ${exemplosDe}`);
}
console.log(`\n${exemplos.join('\n')}`);
