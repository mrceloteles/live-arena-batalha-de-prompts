// O que a guarda de `hidden` (test/css/hidden.test.mjs) consegue enxergar.
//
// A guarda reprova quando uma regra de folha viva declara `display` e vence o
// atributo `hidden` num elemento que o carrega. Este script é o instrumento
// dela: imprime o alcance da régua — quantos elementos esconde de verdade, quais
// alvos não têm marcação, o que ficou fora da conta e as vitórias declaradas.
//
// Uso:
//   node scripts/mede-hidden.mjs            (tabela)
//   node scripts/mede-hidden.mjs conflitos  (só o que reprova, para investigar)
import { fileURLToPath } from 'node:url';

import { conflitosDeDisplay, lerFolhas, lerFontes, relatarConflitos } from '../test/support/hidden-css.mjs';

const RAIZ = new URL('../', import.meta.url);
const medida = conflitosDeDisplay({ folhas: lerFolhas(RAIZ), fontes: lerFontes(RAIZ) });

const porOrigem = new Map();
for (const carregador of medida.carregadores) {
  const chave = String(carregador.como ?? 'atributo').startsWith('cliente')
    ? String(carregador.como).split(' ')[0] + (carregador.semMarcacao ? ' (não localizado)' : '')
    : 'atributo na marcação';
  porOrigem.set(chave, (porOrigem.get(chave) ?? 0) + 1);
}

const porMotivo = new Map();
for (const visto of medida.ignorados) {
  porMotivo.set(visto.motivo, (porMotivo.get(visto.motivo) ?? 0) + 1);
}

if (process.argv[2] === 'conflitos') {
  if (!medida.conflitos.length) console.log('nenhum conflito: nenhuma regra viva pinta um elemento escondido.');
  else {
    console.log(`${medida.conflitos.length} conflito(s):`);
    console.log(relatarConflitos(medida.conflitos, 50));
  }
  process.exit(medida.conflitos.length ? 1 : 0);
}

const tabela = (titulo, linhas) => {
  console.log(`\n${titulo}`);
  for (const [chave, valor] of linhas) console.log(`  ${String(valor).padStart(5)}  ${chave}`);
};

console.log(`Arquivo: ${fileURLToPath(RAIZ)}`);
tabela('Elementos que carregam o atributo `hidden`', [[`total: ${medida.carregadores.length}`, ''], ...porOrigem].filter(([, v]) => v !== ''));
tabela('Declarações de `display` lidas das folhas vivas', [['', medida.declaracoes]]);
tabela('Carregadores avaliados na cascata', [['', medida.avaliados]]);
tabela('Ocorrências de `hidden` fora da conta (com motivo)', [...porMotivo.entries()]);
tabela('Alvos do cliente sem marcação nenhuma', medida.semMarcacao.map((s) => [`${s.seletor} (${s.origem}) ${s.declarado ? 'declarado' : 'NÃO DECLARADO'}`, '']));
tabela('Regras que vencem o `hidden` por declaração escrita', medida.deliberados.map((d) => [`${d.vencedor.folha}:${d.vencedor.linha} ${d.vencedor.seletor}`, '']));
tabela('Conflitos (a guarda reprova)', [['', medida.conflitos.length]]);
if (medida.conflitos.length) console.log(`\n${relatarConflitos(medida.conflitos, 20)}`);
