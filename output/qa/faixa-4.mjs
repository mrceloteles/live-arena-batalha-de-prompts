// Reconstrói as duas cascatas (antes = rodada 3, depois = rodada 4) a partir dos
// cartórios seriados e mede a MESMA aritmética que a guarda do CI usa.
//
// Serve para duas coisas:
//   1. validar a reconstrução — o "depois" sintético tem de reproduzir a varredura
//      real das folhas em disco (mesmos pares, mesmas razões);
//   2. nomear a faixa que esta rodada atacou: quem estava entre 5,0 e 5,5 no
//      "antes" e onde ficou.
import fs from 'node:fs';

import { paresDeclarados, tokensDe } from '../../test/support/contraste-css.mjs';

const doCartorio = (caminho) => {
  const objeto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  // Uma folha sintética por contexto: o que importa ao par é a regra que vence,
  // e ela já está resolvida no cartório.
  const texto = Object.entries(objeto)
    .map(([chave, decls]) => {
      const [media, seletor] = chave.split('||');
      const corpo = decls
        .split(';')
        .filter(Boolean)
        .map((d) => {
          const corte = d.indexOf(':');
          const importante = / !important$/.test(d);
          const valor = (importante ? d.slice(0, -11) : d).slice(corte + 1).trim();
          return `${d.slice(0, corte).trim()}: ${valor}${importante ? ' !important' : ''};`;
        })
        .join('\n  ');
      const regra = `${seletor} {\n  ${corpo}\n}`;
      return media ? `@media ${media} {\n${regra}\n}` : regra;
    })
    .join('\n');
  return [{ nome: 'sintetica.css', ordem: 0, texto }];
};

const medir = (caminho) => {
  const folhas = doCartorio(caminho);
  const tokens = tokensDe(folhas);
  const { conferidos, pulados } = paresDeclarados(folhas, { tokens });
  return { conferidos, pulados, tokens };
};

const identificar = (p) => `${p.folha}:${p.linha} ${p.chave.split('||')[1]}`;
const porPar = (conferidos) => {
  const mapa = new Map();
  for (const p of conferidos) {
    const k = `${p.chave}|${p.cor}|${p.fundo}`;
    if (!mapa.has(k)) mapa.set(k, p);
  }
  return mapa;
};

const antes = medir('tmp/qa/cascata-antes-4.json');
const depois = medir('test/css/cascata.json');

const faixas = (conferidos) => {
  const f = [[0, 4.5], [4.5, 5], [5, 5.5], [5.5, 6], [6, 7], [7, Infinity]];
  return f.map(([lo, hi]) => [lo, hi, conferidos.filter((p) => p.razao >= lo && p.razao < hi).length]);
};

const resumo = (rotulo, m) => {
  const ord = [...m.conferidos].sort((a, b) => a.razao - b.razao);
  console.log(`--- ${rotulo}: ${m.conferidos.length} conferidos, ${m.pulados.length} fora`);
  console.log(`    mínimo ${ord[0].razao.toFixed(2)} | máximo ${ord[ord.length - 1].razao.toFixed(2)}`);
  for (const [lo, hi, n] of faixas(m.conferidos)) console.log(`      ${lo}–${hi}: ${n}`);
};

resumo('antes (rodada 3)', antes);
resumo('depois (rodada 4)', depois);

console.log('\n=== a faixa 5,0–5,5 do "antes": quais pares eram ===');
const faixa = antes.conferidos.filter((p) => p.razao >= 5 && p.razao < 5.5).sort((a, b) => a.razao - b.razao);
const depoisMapa = porPar(depois.conferidos);
for (const p of faixa) {
  const atual = depoisMapa.get(`${p.chave}|${p.cor}|${p.fundo}`)
    ?? depois.conferidos.find((d) => d.chave === p.chave);
  console.log(
    `  ${p.razao.toFixed(2)} -> ${atual ? atual.razao.toFixed(2) : '—'}  ${identificar(p)}\n` +
      `      [${p.cor} / ${p.fundo}]`,
  );
}

console.log('\n=== pares que existiam antes e hoje saíram da aritmética ===');
const chavesDepois = new Set(depois.conferidos.map((p) => `${p.chave}|${p.cor}|${p.fundo}`));
const saiu = antes.conferidos.filter((p) => !chavesDepois.has(`${p.chave}|${p.cor}|${p.fundo}`));
console.log('  total:', saiu.length);
for (const p of saiu.slice(0, 12)) console.log(`  ${p.razao.toFixed(2)}  ${identificar(p)} [${p.cor} / ${p.fundo}]`);
