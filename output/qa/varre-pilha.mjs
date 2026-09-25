// A pilha inteira de cada par reprovado: cada camada com o seletor, a cor e o que
// ela contribui, até a tinta. É o que permite dizer se a conta está certa.
import { readFileSync } from 'node:fs';

import { FOLHAS } from '../../test/support/cascata-css.mjs';
import {
  compor,
  contraste,
  interpretarCor,
  paresDeclarados,
  tokensDe,
} from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const folhas = FOLHAS.map((f) => ({ ...f, texto: readFileSync(new URL(`public/assets/css/${f.nome}`, RAIZ), 'utf8') }));
const tokens = tokensDe(folhas);
const { conferidos } = paresDeclarados(folhas);
void tokens;
const camadas = (await import('../../test/support/contraste-css.mjs')).camadasDeTras(folhas);

for (const p of conferidos.filter((x) => !x.ok).sort((a, b) => a.razao - b.razao)) {
  console.log(`\n=== ${p.razao.toFixed(2)} < ${p.teto}  (${p.contexto})  ${p.folha}:${p.linha}  ${p.chave.split('||')[1]}`);
  console.log(`    tinta: ${p.tinta}`);
  const propria = camadas.porChave.get(p.chave);
  console.log(`    camada da própria chave: ${propria ? `${propria.camada.tipo} ${JSON.stringify(propria.camada.cores)}` : '(nenhuma)'}`);
  const ancestrais = camadas.ancestraisDe(p.chave);
  let base = [255, 255, 255, 1];
  for (const a of ancestrais) {
    console.log(`      ancestral pos ${a.posicao}  ${a.seletor}\n        ${a.camada.tipo} ${JSON.stringify(a.camada.cores)}`);
    for (const cor of a.camada.cores) base = compor(cor, base);
  }
  console.log(`    base composta (sem a própria camada): ${JSON.stringify(base)}`);
  const tinta = interpretarCor(p.tinta, tokens);
  console.log(`    tinta resolvida: ${JSON.stringify(tinta.rgba)} | razão contra a base: ${tinta.ok ? contraste(tinta.rgba, base).toFixed(2) : '—'}`);
  console.log(`    campo fundo do par: ${String(p.fundo).slice(0, 90)}`);
}
