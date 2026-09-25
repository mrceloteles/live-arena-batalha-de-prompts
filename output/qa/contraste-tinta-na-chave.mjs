// A régua de contraste passou a medir a regra que declara tinta e nenhum fundo,
// compondo com quem pinta na MESMA chave (mídia + seletor). Este script é a prova
// da rodada, em duas partes:
//
//   1. ANTES/DEPOIS dos seis pares que o corte das 598 mortas orfanizou — mesmo
//      instrumento nas duas árvores. As folhas de antes estão congeladas em
//      `tmp/qa/css-antes-corte/` (a cópia que a rodada do corte fez).
//   2. FIDELIDADE: rodada sobre aquelas folhas, a régua nova tem de reproduzir,
//      campo por campo, o instantâneo gravado naquela rodada
//      (`tmp/qa/contraste-antes-corte.json`) — nos pares medidos.
//
//   node output/qa/contraste-tinta-na-chave.mjs
import { readFileSync } from 'node:fs';

import { FOLHAS } from '../../test/support/cascata-css.mjs';
import { contagemPorFamilia, paresDeclarados } from '../../test/support/contraste-css.mjs';

const RAIZ = new URL('../../', import.meta.url);
const ler = (dir) => FOLHAS.map((f) => ({ ...f, texto: readFileSync(new URL(`${dir}${f.nome}`, RAIZ), 'utf8') }));

const ANTES = paresDeclarados(ler('tmp/qa/css-antes-corte/'));
const HOJE = paresDeclarados(ler('public/assets/css/'));

const ALVOS = [
  '.figma-cta-gradient',
  '.figma-cta-blue',
  '.arena-tv-rank',
  '.join-card .arena-field > span',
  '.arena-roster-item',
  '.arena-feedback',
];

const arredondar = (n) => Math.round(n * 100) / 100;
const resumo = ({ conferidos, pulados }) => {
  const escritos = conferidos.filter((p) => p.contexto === 'escrito');
  const porContexto = {};
  for (const p of conferidos) porContexto[p.contexto] = (porContexto[p.contexto] || 0) + 1;
  return {
    conferidos: conferidos.length,
    contexto: Object.fromEntries(Object.entries(porContexto).sort()),
    piso: arredondar(Math.min(...escritos.map((p) => p.razao))),
    pulados: contagemPorFamilia(pulados),
  };
};

console.log('=== 1. os seis pares órfãos, antes e depois ===');
console.log(`antes do corte: ${JSON.stringify(resumo(ANTES))}`);
console.log(`hoje          : ${JSON.stringify(resumo(HOJE))}`);
for (const alvo of ALVOS) {
  const antes = ANTES.conferidos.find((p) => p.seletor === alvo);
  const depois = HOJE.conferidos.find((p) => p.seletor === alvo);
  const mostra = (p) => (p ? `${p.razao.toFixed(2).padStart(6)} ${p.contexto.padEnd(9)} fundo: ${p.fundo}` : '   FORA DA FILA');
  console.log(`\n  ${alvo}\n    antes: ${mostra(antes)}\n    hoje : ${mostra(depois)}`);
}

console.log('\n=== 2. fidelidade: a régua nova sobre as folhas de antes do corte ===');
const obtido = resumo(ANTES);
const gravado = JSON.parse(readFileSync(new URL('tmp/qa/contraste-antes-corte.json', RAIZ), 'utf8'));
const nosPares = ['conferidos', 'contexto', 'piso'];
const iguais = nosPares.every((campo) => JSON.stringify(obtido[campo]) === JSON.stringify(gravado[campo]));
console.log(`obtido : ${JSON.stringify(Object.fromEntries(nosPares.map((c) => [c, obtido[c]])))}`);
console.log(`gravado: ${JSON.stringify(Object.fromEntries(nosPares.map((c) => [c, gravado[c]])))}`);
console.log(iguais ? 'FIEL: os pares medidos e o piso são os do instantâneo da rodada, campo por campo' : 'DIVERGE');
console.log(`(a lista de fora da aritmética mudou, e é o esperado: ${JSON.stringify(obtido.pulados)})`);
