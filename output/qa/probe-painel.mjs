// Por que a regra do painel não aparece como vencedora sem o `:not([hidden])`?
import { conflitosDeDisplay, declaracoesDeDisplay, lerFolhas, lerFontes, casaCadeia } from '../../test/support/hidden-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const folhas = lerFolhas(RAIZ);
const fontes = lerFontes(RAIZ);
const design = folhas.find((f) => f.nome === 'design.css');
design.texto = design.texto.replaceAll('.arena-mission-panel:not([hidden]):has(', '.arena-mission-panel:has(');

const base = conflitosDeDisplay({ folhas, fontes });
const painel = base.carregadores.find((c) => [...c.classes].includes('arena-mission-panel'));
console.log('carregador:', painel.origem, painel.como, [...painel.classes], [...painel.atributos]);
console.log('ancestrais:', (painel.ancestrais ?? []).map((a) => `${a.tag}.${[...a.classes].join('.')}`));

const declaracoes = declaracoesDeDisplay(folhas);
const candidatas = [];
for (const d of declaracoes) {
  const v = casaCadeia(d.cadeia, painel);
  if (v === null || v === 'nao') continue;
  if (d.esconde && v !== 'sim') continue;
  candidatas.push({ ...d, veredito: v });
}
console.log('candidatas para o painel:', candidatas.length);
for (const c of candidatas) {
  console.log(`  ${c.folha}:${c.linha} ${c.seletor} -> ${c.valor} [${c.espec.join('-')}${c.importante ? ' !' : ''} o${c.ordem} p${c.posicao}] ${c.veredito}`);
}
console.log('vencedor calculado:', candidatas.length ? (() => { const chave = (d) => [d.importante ? 1 : 0, ...d.espec, d.ordem, d.posicao]; const melhor = candidatas.reduce((x, y) => { const a = chave(x), b = chave(y); for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i] > a[i] ? y : x; return x; }); return `${melhor.folha}:${melhor.linha} ${melhor.seletor} -> ${melhor.valor} esconde=${melhor.esconde} deliberada=${melhor.deliberada}`; })() : 'nada');
console.log('conflitos:', base.conflitos.length, 'avaliados:', base.avaliados);
