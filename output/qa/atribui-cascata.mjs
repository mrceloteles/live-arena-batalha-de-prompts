// Atribuição do cartório da cascata: o que mudou entre dois instantâneos, chave
// por chave e declaração por declaração.
//
//   node output/qa/atribui-cascata.mjs tmp/qa/cascata-antes.json test/css/cascata.json
import fs from 'node:fs';

const [caminhoAntes, caminhoDepois] = process.argv.slice(2);
if (!caminhoAntes || !caminhoDepois) throw new Error('uso: atribui-cascata.mjs <antes.json> <depois.json>');

const antes = JSON.parse(fs.readFileSync(caminhoAntes, 'utf8'));
const depois = JSON.parse(fs.readFileSync(caminhoDepois, 'utf8'));
const mapa = (texto) =>
  new Map((texto || '').split(';').map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]));

let chaves = 0;
let declaracoes = 0;
for (const chave of [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort()) {
  if (antes[chave] === depois[chave]) continue;
  chaves += 1;
  console.log(`  ${chave}`);
  const a = mapa(antes[chave]);
  const d = mapa(depois[chave]);
  for (const prop of new Set([...a.keys(), ...d.keys()])) {
    if (a.get(prop) === d.get(prop)) continue;
    declaracoes += 1;
    console.log(`     ${prop}: ${a.get(prop) ?? '(ausente)'} -> ${d.get(prop) ?? '(ausente)'}`);
  }
}
console.log(`total: ${chaves} chave(s), ${declaracoes} declaração(ões)`);
