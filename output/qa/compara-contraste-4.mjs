// Compara contraste antes x depois pareando pelo ELEMENTO (tela, estado, superfície,
// seletor, caminho) — o texto fica fora da chave porque a fixture sorteia PIN e opções.
import fs from 'node:fs';

const carrega = (p) => JSON.parse(fs.readFileSync(p, 'utf8')).medidas;
const antes = carrega('tmp/qa/contraste-antes-4/contraste.json');
const depois = carrega('tmp/qa/contraste-depois-4/contraste.json');
const chave = (m) => [m.tela, m.estado, m.superficie, m.seletor, m.caminho].join('|');

const A = new Map(antes.map((m) => [chave(m), m]));
const D = new Map(depois.map((m) => [chave(m), m]));
const soA = [...A.keys()].filter((k) => !D.has(k));
const soD = [...D.keys()].filter((k) => !A.has(k));

const iguais = [...A.keys()].filter((k) => D.has(k));
const mudou = iguais.filter((k) => A.get(k).razaoReal !== D.get(k).razaoReal);
const subiu = mudou.filter((k) => D.get(k).razaoReal > A.get(k).razaoReal);
const desceu = mudou.filter((k) => D.get(k).razaoReal < A.get(k).razaoReal);

const abaixoA = depois.filter((m) => m.razaoReal < m.teto);
const teto = (m) => (m.teto === 4.5 ? 'teto4.5' : 'teto3');

console.log('registros antes/depois:', antes.length, '/', depois.length);
console.log('elementos pareados:', iguais.length, '| só no antes:', soA.length, '| só no depois:', soD.length);
console.log('razão mudou:', mudou.length, '| subiu:', subiu.length, '| desceu:', desceu.length);
console.log('abaixo do teto no depois:', abaixoA.length);

console.log('\n=== TODAS as descidas (razão caiu) ===');
for (const k of desceu.map((k) => D.get(k)).sort((a, b) => a.razaoReal - b.razaoReal)) {
  const a = A.get(chave(k));
  console.log(
    `${k.tela}/${k.estado} · ${k.seletor} "${k.texto.slice(0, 26)}"\n` +
      `   ${a.razaoReal.toFixed(2)} -> ${k.razaoReal.toFixed(2)}  (${teto(k)})\n` +
      `   tinta ${a.corDeclarada} -> ${k.corDeclarada}\n` +
      `   fundo ${a.fundoUsado} -> ${k.fundoUsado}`,
  );
}

console.log('\n=== distribuição da razão (depois) ===');
const faixas = [[0, 4.5], [4.5, 5], [5, 5.5], [5.5, 7], [7, 10], [10, 100]];
for (const [lo, hi] of faixas) {
  const n = depois.filter((m) => m.razaoReal >= lo && m.razaoReal < hi).length;
  console.log(`  ${lo}–${hi}: ${n}`);
}
const min = Math.min(...depois.map((m) => m.razaoReal));
console.log('mínimo depois:', min.toFixed(2));
