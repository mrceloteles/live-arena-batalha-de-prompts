// Antes -> depois dos pares que estavam na faixa apertada, pareando pelo seletor.
import { readFileSync } from 'node:fs';

import { FOLHAS } from '../../test/support/cascata-css.mjs';
import { paresDeclarados, tokensDe } from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const ler = (base, nome) => readFileSync(new URL(`${base}${nome}`, RAIZ), 'utf8');

const antesFolhas = FOLHAS.map((f) => ({ ...f, texto: ler('tmp/qa/css-antes-4/', f.nome) }));
const depoisFolhas = FOLHAS.map((f) => ({ ...f, texto: ler('public/assets/css/', f.nome) }));

const medir = (folhas) => paresDeclarados(folhas, { tokens: tokensDe(folhas) }).conferidos;
const antes = medir(antesFolhas);
const depois = medir(depoisFolhas);
console.log('pares: antes', antes.length, '| depois', depois.length);

const porChave = new Map();
for (const p of depois) {
  if (!porChave.has(p.chave)) porChave.set(p.chave, []);
  porChave.get(p.chave).push(p);
}

const faixa = antes.filter((p) => p.razao >= 5 && p.razao < 5.5).sort((a, b) => a.razao - b.razao);
console.log(`\n=== os ${faixa.length} pares entre 5,00 e 5,50 no ANTES ===`);
let pior = Infinity;
for (const p of faixa) {
  const candidatos = porChave.get(p.chave) ?? [];
  // O par que continua sendo o mesmo: mesma superfície quando possível.
  const par = candidatos.find((c) => c.fundo === p.fundo) ?? candidatos[0];
  const agora = par ? par.razao : NaN;
  if (agora < pior) pior = agora;
  console.log(
    `  ${p.razao.toFixed(2)} -> ${agora.toFixed(2)}  ${p.chave.split('||')[1]}\n` +
      `       ${p.folha}:${p.linha}  [${p.cor} / ${p.fundo}]`,
  );
}
console.log('\npior do depois entre esses:', pior.toFixed(2));

const ord = [...depois].sort((a, b) => a.razao - b.razao);
console.log('\n=== os 10 pares mais apertados de HOJE ===');
for (const p of ord.slice(0, 10)) {
  console.log(`  ${p.razao.toFixed(2)}  ${p.folha}:${p.linha}  ${p.chave.split('||')[1]}`);
}
console.log('\nabaixo do teto AA hoje:', depois.filter((p) => p.razao < p.teto).length);
const faixas = [[0, 4.5], [4.5, 5], [5, 5.5], [5.5, 6], [6, 7], [7, Infinity]];
for (const [lo, hi] of faixas) {
  console.log(`  ${lo}–${hi}: ${depois.filter((p) => p.razao >= lo && p.razao < hi).length}`);
}
