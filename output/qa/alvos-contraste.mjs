// WCAG: escolhe as cores de correção com margem, medindo contra os fundos reais medidos no navegador.
// Uso: node output/qa/alvos-contraste.mjs
function paraRgb(cor) {
  if (Array.isArray(cor)) return cor;
  if (cor.startsWith('#')) {
    const n = parseInt(cor.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return cor.match(/[\d.]+/g).slice(0, 3).map(Number);
}
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const L = (cor) => { const [r, g, b] = paraRgb(cor); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const razao = (a, b) => { const la = L(a), lb = L(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const misturar = (frente, alfa, atras) => paraRgb(frente).map((v, i) => Math.round(v * alfa + paraRgb(atras)[i] * (1 - alfa)));

// cada caso: fundos onde o texto é pintado + candidatos [fundo, tinta] ou [tinta]
const casos = [
  {
    nome: '1. botão desabilitado — "Enviar prompt" (16px/900, teto 4.5); pior caso: cartão branco por trás',
    fundos: ['rgb(255,255,255)'],
    candidatos: [['#e6eaf2', '#4b5563'], ['#e3e8f0', '#414c60'], ['#dfe4ee', '#3f4a5f']],
  },
  {
    nome: '2. hint do botão desabilitado (11px/700, teto 4.5) — sobre o fundo do próprio botão',
    fundos: ['#e6eaf2', '#e3e8f0'],
    candidatos: [['#ccd4e2', '#39425a'], ['#cbd3e1', '#333c52'], ['#c8d1e0', '#2f384d']],
  },
  {
    nome: '3. "1º lugar · Campeão" (11px/800, teto 4.5) — cartão campeão do aluno',
    fundos: ['rgb(255,251,241)', 'rgb(255,249,229)', 'rgb(255,251,236)'],
    candidatos: [['#b7791f'], ['#8a5a12'], ['#8f6117'], ['#845413'], ['#7a4f0e']],
  },
  {
    nome: '4. nome do campeão (15px/700, teto 4.5) — hoje #b07e00',
    fundos: ['rgb(255,249,229)', 'rgb(255,251,241)'],
    candidatos: [['#b07e00'], ['#8a6200'], ['#7f5a00'], ['#8c6400'], ['#755100']],
  },
  {
    nome: '5. "1" verde do topo do aluno (14px/700, teto 4.5) — hoje #188038 sobre a pílula verde',
    fundos: ['rgb(227,240,234)'],
    candidatos: [['#188038'], ['#136c2f'], ['#0f6b2c'], ['#116b2e'], ['#0a5c26']],
  },
  {
    nome: '6. chip is-arena (11px/800, teto 4.5) — par próprio, sobre topbar escuro E sobre painel claro',
    fundos: ['rgb(21,45,89)', 'rgb(255,255,255)'],
    candidatos: [['#e3e8f5', '#17407e'], ['#e6ecfa', '#0b57d0'], ['#ede7fb', '#5b3bbd'], ['#e9edf6', '#123a75'], ['#fff3d6', '#8a5a12']],
  },
];

for (const caso of casos.slice(0, 6)) {
  console.log('\n=== ' + caso.nome);
  for (const cand of caso.candidatos) {
    const [fundo, tinta] = cand.length === 2 ? cand : [null, cand[0]];
    const fundos = fundo ? [fundo] : caso.fundos;
    const razoes = fundos.map((f) => razao(tinta, f));
    const pior = Math.min(...razoes);
    console.log(
      '  ' + (fundo ? fundo : '(fundo da tela)').padEnd(18),
      'tinta ' + tinta.padEnd(9),
      razoes.map((r) => r.toFixed(2).padStart(6)).join(' '),
      pior >= 4.5 ? '✓ AA (pior ' + pior.toFixed(2) + ')' : '✗ pior ' + pior.toFixed(2),
    );
  }
}

casos.push({
  nome: '7. família de chips de preset — is-classic hoje 4.31 e is-arena sem par próprio',
  fundos: ['#fff1de'],
  candidatos: [['#fff1de', '#b35a00'], ['#fff1de', '#9a4d00'], ['#fff1de', '#8f4700'], ['#f5f7fc', '#071f49']],
});
casos.push({
  nome: '8. um âmbar só para a família ouro (lugar, nome e badge ::before)',
  fundos: ['rgb(255,251,241)', 'rgb(255,249,229)', '#fef2ca'],
  candidatos: [['#8a5a12'], ['#8a6200'], ['#845413'], ['#7f5a00']],
});

for (const caso of casos.slice(-2)) {
  console.log('\n=== ' + caso.nome);
  for (const cand of caso.candidatos) {
    const [fundo, tinta] = cand.length === 2 ? cand : [null, cand[0]];
    const fundos = fundo ? [fundo] : caso.fundos;
    const razoes = fundos.map((f) => razao(tinta, f));
    const pior = Math.min(...razoes);
    console.log('  ' + (fundo || '(fundo da tela)').padEnd(18), 'tinta ' + tinta.padEnd(9), razoes.map((r) => r.toFixed(2).padStart(6)).join(' '), pior >= 4.5 ? '✓ AA (pior ' + pior.toFixed(2) + ')' : '✗ pior ' + pior.toFixed(2));
  }
}

console.log('\n=== referência: campeão da TV (pos-1) — o pior ponto medido foi rgb(151,124,45)');
console.log('  branco sobre rgb(151,124,45):', razao('#ffffff', 'rgb(151,124,45)').toFixed(2), '(texto grande/bold: teto 3.0)');
console.log('  #fbbf24 (pontos) sobre o mesmo:', razao('#fbbf24', 'rgb(151,124,45)').toFixed(2));
console.log('  âmbar .22 sobre escuro rgb(6,27,63):', misturar('rgb(245,158,11)', 0.22, 'rgb(6,27,63)').join(','), '→ branco daria', razao('#ffffff', misturar('rgb(245,158,11)', 0.22, 'rgb(6,27,63)')).toFixed(2));
console.log('  âmbar .14 sobre escuro rgb(6,27,63):', misturar('rgb(245,158,11)', 0.14, 'rgb(6,27,63)').join(','), '→ branco daria', razao('#ffffff', misturar('rgb(245,158,11)', 0.14, 'rgb(6,27,63)')).toFixed(2));
