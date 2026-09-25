// Reconstrói o "antes" desta rodada com o MÍNIMO de cirurgia: só as propriedades
// que o cartório registra como diferentes voltam ao valor anterior, dentro de cada
// regra que as declara. Nada de corpo inteiro, nada de chave sintética.
//
// A prova importa mais que a medida: se a cascata serializada das cópias não for
// idêntica, declaração por declaração, ao cartório anterior, o "antes" é palpite.
//
//   node output/qa/reverter-4.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { FOLHAS, analisarRegras, cascataDe, serializar } from '../../test/support/cascata-css.mjs';
import { paresDeclarados, tokensDe } from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const DESTINO = new URL('tmp/qa/css-antes-4/', RAIZ);
const ler = (nome) => readFileSync(new URL(`public/assets/css/${nome}`, RAIZ), 'utf8');

const antes = JSON.parse(readFileSync(new URL('tmp/qa/cascata-antes-4.json', RAIZ), 'utf8'));
const depois = JSON.parse(readFileSync(new URL('test/css/cascata.json', RAIZ), 'utf8'));

const declara = (serializado) => {
  const mapa = new Map();
  for (const d of serializado.split(';')) {
    const corte = d.indexOf(':');
    if (corte < 1) continue;
    let valor = d.slice(corte + 1).trim();
    // `serializar` acrescenta ' !important' quando o valor já termina assim:
    // a forma no arquivo tem só um.
    if (/!important !important$/i.test(valor)) valor = valor.slice(0, -11).trim();
    mapa.set(d.slice(0, corte).trim().toLowerCase(), valor);
  }
  return mapa;
};

const mudadas = new Set(Object.keys(depois).filter((k) => antes[k] !== depois[k]));
const trocas = new Map(); // chave -> Map(prop -> valor anterior)
for (const k of mudadas) {
  const a = antes[k] === undefined ? null : declara(antes[k]);
  const d = declara(depois[k]);
  if (!a) continue;
  for (const [prop, valor] of d) {
    const anterior = a.get(prop);
    if (anterior !== undefined && anterior !== valor) {
      if (!trocas.has(k)) trocas.set(k, new Map());
      trocas.get(k).set(prop, anterior);
    }
  }
}
console.log('chaves mudadas:', mudadas.size, '| chaves com propriedade trocada:', trocas.size);

const substituir = (corpo, prop, valor) => {
  const re = new RegExp(`(^|[;{\\s])${prop}\\s*:[^;]*`, 'i');
  if (!re.test(corpo)) return { corpo, achou: false };
  return { corpo: corpo.replace(re, (_m, p1) => `${p1}${prop}: ${valor}`), achou: true };
};

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });

const porFolha = [];
const naoAchadas = [];
for (const folha of FOLHAS) {
  let texto = ler(folha.nome);
  const regras = analisarRegras(texto).filter((r) => trocas.has(r.key));
  for (const regra of [...regras].sort((a, b) => b.posicao - a.posicao)) {
    if (!/!important !important$/i.test('') && false) continue;
    const fim = texto.indexOf('}', regra.posicao);
    let corpo = texto.slice(regra.posicao, fim);
    for (const [prop, valor] of trocas.get(regra.key)) {
      const r = substituir(corpo, prop, valor);
      corpo = r.corpo;
      if (!r.achou) naoAchadas.push(`${folha.nome} ${regra.key} ${prop}`);
    }
    texto = `${texto.slice(0, regra.posicao)}${corpo}${texto.slice(fim)}`;
  }
  writeFileSync(new URL(folha.nome, DESTINO), texto);
  porFolha.push({ ...folha, texto });
}

console.log('propriedades não encontradas no corpo da regra:', naoAchadas.length);
for (const n of naoAchadas.slice(0, 10)) console.log('   ', n);

const atual = serializar(cascataDe(porFolha));
const chaves = [...new Set([...Object.keys(antes), ...Object.keys(atual)])].sort();
const divergentes = chaves.filter((k) => antes[k] !== atual[k]);
console.log('\nFIDELIDADE — chaves:', Object.keys(antes).length, '| divergências:', divergentes.length);
for (const k of divergentes.slice(0, 6)) {
  console.log(`  ${k}\n    antes: ${antes[k]}\n    copia: ${atual[k]}`);
}

const tokens = tokensDe(porFolha);
const { conferidos } = paresDeclarados(porFolha, { tokens });
const ord = [...conferidos].sort((a, b) => a.razao - b.razao);
console.log('\n--- ANTES: conferidos', conferidos.length, '| mínimo', ord[0].razao.toFixed(2));
for (const [lo, hi] of [[0, 4.5], [4.5, 5], [5, 5.5], [5.5, 6], [6, 7], [7, Infinity]]) {
  console.log(`    ${lo}–${hi}: ${conferidos.filter((p) => p.razao >= lo && p.razao < hi).length}`);
}
console.log('--- a faixa 5,0–5,5 do ANTES ---');
for (const p of conferidos.filter((p) => p.razao >= 5 && p.razao < 5.5).sort((a, b) => a.razao - b.razao)) {
  console.log(`  ${p.razao.toFixed(2)}  ${p.folha}:${p.linha}  ${p.chave.split('||')[1]}`);
}
writeFileSync(
  new URL('tmp/qa/antes-4.json', RAIZ),
  JSON.stringify(
    conferidos.map((p) => ({ chave: p.chave, folha: p.folha, linha: p.linha, razao: p.razao })),
    null,
    1,
  ),
);
console.log('\nfila do antes em tmp/qa/antes-4.json');
