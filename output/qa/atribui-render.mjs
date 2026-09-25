// Atribuição do retrato: o que mudou de estilo entre o "antes" reconstruído (reversão
// provada contra o retrato versionado) e o "depois" com as emendas de contraste.
import fs from 'node:fs';
import path from 'node:path';

const dirA = 'tmp/qa/render-antes';
const dirD = 'tmp/qa/render-depois';
const props = (linha) => {
  const campos = linha.split('\t');
  const mapa = new Map();
  for (const par of (campos[campos.length - 1] || '').split(';')) {
    const j = par.indexOf(':');
    if (j > 0) mapa.set(par.slice(0, j), par.slice(j + 1));
  }
  return { identificacao: campos[0], mapa };
};

const pares = new Map();
const porTela = new Map();
const elementos = new Map();
for (const f of fs.readdirSync(dirD).filter((n) => n.endsWith('.txt')).sort()) {
  const A = fs.readFileSync(path.join(dirA, f), 'utf8').split('\n');
  const D = fs.readFileSync(path.join(dirD, f), 'utf8').split('\n');
  if (A.length !== D.length) { console.log('!! ' + f + ': o número de linhas mudou (' + A.length + ' → ' + D.length + ')'); continue; }
  let n = 0;
  for (let i = 0; i < A.length; i += 1) {
    if (A[i] === D[i] || !A[i].trim()) continue;
    const a = props(A[i]);
    const d = props(D[i]);
    // A linha de cabeçalho do dump (# url + contagem) não é elemento: o PIN do
    // sorteio muda a cada execução e faria toda tela entrar na conta.
    if (a.mapa.size === 0 || d.mapa.size === 0) continue;
    n += 1;
    const difs = [];
    for (const k of new Set([...a.mapa.keys(), ...d.mapa.keys()])) {
      if (a.mapa.get(k) !== d.mapa.get(k)) {
        difs.push(k + ': ' + a.mapa.get(k) + ' → ' + d.mapa.get(k));
        const chave = k + ': ' + a.mapa.get(k) + ' → ' + d.mapa.get(k);
        pares.set(chave, (pares.get(chave) || 0) + 1);
      }
    }
    elementos.set(f + ' :: ' + d.identificacao, difs);
  }
  if (n) porTela.set(f.replace('__', ' ').replace('.txt', ''), n);
}

const linhas = [];
linhas.push('=== elementos alterados por tela');
for (const [t, n] of porTela) linhas.push('  ' + String(n).padStart(3) + '  ' + t);
linhas.push('\n=== propriedades alteradas (agregado)');
for (const [k, n] of [...pares].sort((x, y) => y[1] - x[1])) linhas.push('  (' + String(n).padStart(2) + '×) ' + k);
linhas.push('\n=== cada elemento alterado, com as propriedades que mudaram');
for (const [el, difs] of elementos) linhas.push('  ' + el.padEnd(64) + ' · ' + difs.join(' | '));
linhas.push('\n' + porTela.size + ' telas, ' + [...porTela.values()].reduce((a, b) => a + b, 0) + ' elementos, ' + pares.size + ' pares (propriedade, valor) distintos');
const texto = linhas.join('\n');
fs.writeFileSync('tmp/qa/atribuicao-render.txt', texto + '\n');
console.log(texto);
