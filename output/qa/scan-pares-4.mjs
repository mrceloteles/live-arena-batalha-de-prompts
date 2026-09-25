// Fila de pares declarados (fundo + cor na mesma regra), medida com a MESMA
// leitura que a guarda do CI usa — sem reimplementar nada.
import { readFileSync } from 'node:fs';

import { FOLHAS } from '../../test/support/cascata-css.mjs';
import { contraste, paresDeclarados, tokensDe } from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const lerFolhas = () =>
  FOLHAS.map((folha) => ({
    ...folha,
    texto: readFileSync(new URL(`public/assets/css/${folha.nome}`, RAIZ), 'utf8'),
  }));

const folhas = lerFolhas();
const tokens = tokensDe(folhas);
const { conferidos, pulados } = paresDeclarados(folhas, { tokens });
const ord = [...conferidos].sort((a, b) => a.razao - b.razao);

console.log('conferidos:', conferidos.length, '| fora da aritmética:', pulados.length);
console.log('mínimo:', ord[0].razao.toFixed(2), '| máximo:', ord[ord.length - 1].razao.toFixed(2));

const faixas = [[0, 4.5], [4.5, 5], [5, 5.5], [5.5, 6], [6, 7], [7, Infinity]];
for (const [lo, hi] of faixas) {
  const n = conferidos.filter((p) => p.razao >= lo && p.razao < hi).length;
  console.log(`  ${lo}–${hi}: ${n}`);
}

console.log('--- os 14 mais apertados ---');
for (const p of ord.slice(0, 14)) {
  console.log(
    `  ${p.razao.toFixed(2)}  ${p.folha}:${p.linha}  ${p.seletor}  [${p.cor} / ${p.fundo}]`,
  );
}

// O piso da catraca é o menor conferido. Também confiro que o teto AA morde.
const abaixo = conferidos.filter((p) => p.razao < p.teto);
console.log('abaixo do teto AA:', abaixo.length);
for (const p of abaixo) {
  console.log(`  REPROVA ${p.razao.toFixed(2)} < ${p.teto}  ${p.folha}:${p.linha} ${p.seletor}`);
}

console.log('--- composição direta de exemplo (sanity da régua) ---');
console.log('  branco sobre #00725a:', contraste([255, 255, 255, 1], [0, 114, 90, 1]).toFixed(2));
