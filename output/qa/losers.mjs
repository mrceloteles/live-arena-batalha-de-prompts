// Enumera as declarações de `color` que perdem a cascata na própria chave:
// arquivo, linha da regra, seletor, o valor que perde e o valor que vence.
// É a fila de corte desta rodada — apagar quem perde não muda o que se pinta,
// porque a chave (media + seletor) é a MESMA: o conjunto de elementos é idêntico.
import { readFileSync } from 'node:fs';

import { FOLHAS, analisarRegras, semCr } from '../../test/support/cascata-css.mjs';
import { paresDeclarados } from '../../test/support/contraste-css.mjs';

const folhas = FOLHAS.map((f) => ({ ...f, texto: readFileSync(`public/assets/css/${f.nome}`, 'utf8') }));
const { pulados } = paresDeclarados(folhas);
const perde = pulados.filter((p) => p.familia === 'regra que perde a cascata');

const porFolha = new Map();
for (const folha of folhas) {
  const regras = new Map();
  const linhas = semCr(folha.texto).split('\n');
  for (const regra of analisarRegras(semCr(folha.texto))) {
    const linha = semCr(folha.texto).slice(0, regra.posicao ?? 0).split('\n').length;
    regras.set(`${regra.key}@${regra.posicao}`, { regra, linha, linhas });
  }
  porFolha.set(folha.nome, regras);
}

console.log(`declarações que perdem a cascata: ${perde.length}\n`);
const alvos = [];
for (const p of perde) {
  const achado = porFolha.get(p.folha)?.get(`${p.chave}@?`);
  // Procura pela chave e pela linha anotada: `posicao` não vem no registro do par.
  const candidatos = [...(porFolha.get(p.folha)?.values() ?? [])].filter(
    (c) => c.regra.key === p.chave && c.linha === p.linha,
  );
  const alvo = candidatos[0];
  if (!alvo) {
    console.log(`  ?? ${p.folha}:${p.linha} ${p.chave.split('||')[1]}  (não localizei a regra)`);
    continue;
  }
  // Índice da declaração `color` dentro do corpo da regra.
  const corpo = alvo.linhas.slice(alvo.linha - 1);
  let indice = -1;
  for (let i = 0; i < corpo.length && i < 40; i += 1) {
    if (/^\s*color\s*:/.test(corpo[i])) { indice = alvo.linha - 1 + i; break; }
    if (/^\s*\}/.test(corpo[i])) break;
  }
  const valor = indice >= 0 ? corpo[indice - (alvo.linha - 1)].trim() : '(não achei)';
  console.log(`  ${p.folha}:${indice + 1}  ${p.chave.includes('@') ? '@' + p.chave.split('||')[0] + ' ' : ''}${p.chave.split('||')[1]}`);
  console.log(`      perde:   ${valor}`);
  console.log(`      motivo:  ${p.motivo}`);
  alvos.push({ folha: p.folha, linha: indice + 1, texto: corpo[indice - (alvo.linha - 1)], chave: p.chave, seletor: p.chave.split('||')[1], valor });
}
console.log(`\ntotal localizado: ${alvos.length}`);
