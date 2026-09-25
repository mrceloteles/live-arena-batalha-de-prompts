// Quantas declarações — de QUALQUER propriedade — perdem a cascata na própria
// chave, e de que propriedades são. É o universo da guarda que se quer criar.
import { readFileSync } from 'node:fs';

import { FOLHAS, analisarRegras, semCr } from '../../test/support/cascata-css.mjs';

const folhas = FOLHAS.map((f) => ({ ...f, texto: semCr(readFileSync(`public/assets/css/${f.nome}`, 'utf8')) }));

/** Para cada chave, as declarações na ordem em que aparecem, com origem. */
const porChave = new Map();
for (const folha of folhas) {
  for (const regra of analisarRegras(folha.texto)) {
    const linha = folha.texto.slice(0, regra.posicao ?? 0).split('\n').length;
    if (!porChave.has(regra.key)) porChave.set(regra.key, []);
    for (const decl of regra.decls) {
      const corte = decl.indexOf(':');
      if (corte < 1) continue;
      const propriedade = decl.slice(0, corte).trim().toLowerCase();
      const valor = decl.slice(corte + 1).trim();
      porChave.get(regra.key).push({
        propriedade,
        valor,
        importante: /!important$/i.test(valor),
        folha: folha.nome,
        linha,
        seletor: regra.key.split('||')[1],
        media: regra.key.split('||')[0],
      });
    }
  }
}

const mortas = [];
for (const [chave, decls] of porChave) {
  const porPropriedade = new Map();
  for (const d of decls) {
    if (!porPropriedade.has(d.propriedade)) porPropriedade.set(d.propriedade, []);
    porPropriedade.get(d.propriedade).push(d);
  }
  for (const [propriedade, lista] of porPropriedade) {
    if (lista.length < 2) continue;
    // Mesma cascata que o cartório usa: `!important` vence; empate resolve pela última.
    let vencedora = lista[0];
    for (const d of lista.slice(1)) if (d.importante || !vencedora.importante) vencedora = d;
    for (const d of lista) if (d !== vencedora) mortas.push({ ...d, chave, vencedora });
  }
}

const porPropriedade = {};
for (const m of mortas) porPropriedade[m.propriedade] = (porPropriedade[m.propriedade] || 0) + 1;
const ordenado = Object.entries(porPropriedade).sort((a, b) => b[1] - a[1]);

console.log(`declarações mortas (qualquer propriedade): ${mortas.length}`);
console.log(`chaves envolvidas: ${new Set(mortas.map((m) => m.chave)).size}`);
console.log('\npor propriedade:');
for (const [p, n] of ordenado) console.log(`  ${String(n).padStart(3)}  ${p}`);

const porFolha = {};
for (const m of mortas) porFolha[m.folha] = (porFolha[m.folha] || 0) + 1;
console.log('\npor folha:', JSON.stringify(porFolha));

// As cores: o que a guarda nova pega além da família que acabou de zerar.
const cor = mortas.filter((m) => m.propriedade === 'color');
console.log(`\ndas quais 'color': ${cor.length}`);
for (const m of cor.slice(0, 40)) {
  console.log(`  ${m.folha}:${m.linha}  ${m.media ? `@${m.media} ` : ''}${m.seletor.slice(0, 46)}`);
  console.log(`      ${m.valor}  perde para  ${m.vencedora.valor}`);
}
