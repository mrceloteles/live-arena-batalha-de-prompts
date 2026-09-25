// Para cada par reprovado pela régua nova: a tinta e o fundo que a regra declara,
// e o que a cascata resolve para a MESMA chave — quem perde a cascata não pinta.
import { readFileSync } from 'node:fs';

import { FOLHAS, analisarRegras, cascataDe } from '../../test/support/cascata-css.mjs';
import { paresDeclarados } from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const folhas = FOLHAS.map((f) => ({ ...f, texto: readFileSync(new URL(`public/assets/css/${f.nome}`, RAIZ), 'utf8') }));
const cascata = cascataDe(folhas);
const { conferidos } = paresDeclarados(folhas);

const propsDe = (regra) => {
  const m = new Map();
  for (const d of regra.decls) {
    const c = d.indexOf(':');
    if (c > 0) m.set(d.slice(0, c).trim().toLowerCase(), d.slice(c + 1).trim());
  }
  return m;
};
const regraPorChave = new Map();
for (const folha of folhas) {
  for (const regra of analisarRegras(folha.texto)) {
    if (!regraPorChave.has(regra.key)) regraPorChave.set(regra.key, []);
    regraPorChave.get(regra.key).push({ folha: folha.nome, regra, props: propsDe(regra) });
  }
}

for (const p of conferidos.filter((x) => !x.ok).sort((a, b) => a.razao - b.razao)) {
  const vencedores = cascata.get(p.chave) ?? new Map();
  const color = vencedores.get('color');
  console.log(`\n${p.razao.toFixed(2)} (teto ${p.teto}, ${p.contexto}) ${p.folha}:${p.linha} ${p.chave.split('||')[1].slice(0, 64)}`);
  console.log(`   tinta da regra: ${p.tinta}`);
  console.log(`   cor vencedora da chave: ${color ? `${color.valor}${color.importante ? ' !important' : ''}` : '(nenhuma)'}`);
  const proprios = regraPorChave.get(p.chave) ?? [];
  console.log(`   regras com esta chave: ${proprios.map((r) => `${r.folha} tinta=${r.props.get('color')} fundo=${r.props.get('background') ?? r.props.get('background-color')}`).join(' | ')}`);
}
