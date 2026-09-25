// Aplica ou desfaz as emendas de folga desta rodada (o accent mais fundo, o
// gradiente de marca, o verde e o vermelho únicos, o âmbar e os dois azuis
// avulsos). Serve para reconstruir o "antes" e provar que a reversão é fiel
// contra o retrato versionado, e depois para reaplicar.
//
//   node output/qa/trocar-contraste-3.mjs volta
//   node output/qa/trocar-contraste-3.mjs ida
import fs from 'node:fs';

// [depois, antes]
const alvos = {
  'public/assets/css/refinement.css': [
    ['  --color-accent: #00725a;', '  --color-accent: #00875a;'],
  ],
  'public/assets/css/design.css': [
    ['#0a63c9 86%', '#087edc 86%'],
    [
      '.arena-timer.is-danger {\n  color: #b3261e !important;\n  background: #fff !important;\n}',
      '.arena-timer.is-danger {\n  color: #d93025 !important;\n  background: #fff !important;\n}',
    ],
    [
      '.arena-detail-close {\n  font-size: 13px !important;\n  color: #5f6368 !important;',
      '.arena-detail-close {\n  font-size: 13px !important;\n  color: #64748b !important;',
    ],
    [
      '.arena-roster-item.is-me em {\n  background: #eaf1ff;\n  color: var(--color-primary);\n}',
      '.arena-roster-item.is-me em {\n  background: #eaf1ff;\n  color: #0b56e9;\n}',
    ],
    [
      '.arena-roster-item.is-connected em {\n  background: #e9f8ef;\n  color: #12692c;\n}',
      '.arena-roster-item.is-connected em {\n  background: #e9f8ef;\n  color: #176f4e;\n}',
    ],
    ['  background: #e9f9f0;\n  color: #12692c;', '  background: #e9f9f0;\n  color: #16734f;'],
  ],
  'public/assets/css/arena.css': [
    [
      '.arena-status-badge.is-results {\n  background: #e6f6f2;\n  color: #12692c;\n}',
      '.arena-status-badge.is-results {\n  background: #e6f6f2;\n  color: #188038;\n}',
    ],
    [
      '.arena-image-preview button {\n  border: 1px solid rgba(217, 48, 37, 0.35);\n  border-radius: 999px;\n  background: #fff;\n  color: #b3261e;',
      '.arena-image-preview button {\n  border: 1px solid rgba(217, 48, 37, 0.35);\n  border-radius: 999px;\n  background: #fff;\n  color: #d93025;',
    ],
    [
      '.arena-preset-chip.is-personalizado { background: #e9fbf4; color: var(--color-accent); }',
      '.arena-preset-chip.is-personalizado { background: #e9fbf4; color: #007a5e; }',
    ],
    [
      '.arena-ranking-row.is-champion .arena-ranking-place {\n  color: #845413;',
      '.arena-ranking-row.is-champion .arena-ranking-place {\n  color: #8a5a12;',
    ],
    [
      '.arena-status-badge.is-draft {\n  background: #fff4e5;\n  color: #845413;\n}',
      '.arena-status-badge.is-draft {\n  background: #fff4e5;\n  color: #8a5a12;\n}',
    ],
  ],
  'public/assets/css/round.css': [
    [
      '  background: #fce8e6 !important;\n  color: #b3261e !important;',
      '  background: #fce8e6 !important;\n  color: #c5221f !important;',
    ],
    [
      '.arena-attempt-dot.is-scored { background: #e6f4ea; color: #12692c; border-color: #b7dfc1; }',
      '.arena-attempt-dot.is-scored { background: #e6f4ea; color: #137333; border-color: #b7dfc1; }',
    ],
    [
      '.arena-attempt-dot.is-scored { background: #e6f4ea !important; color: #12692c !important; }',
      '.arena-attempt-dot.is-scored { background: #e6f4ea !important; color: #137333 !important; }',
    ],
    [
      "content: '🏆 RESULTADO FINAL 🎉'; background: #fef2ca; color: #845413;",
      "content: '🏆 RESULTADO FINAL 🎉'; background: #fef2ca; color: #8a5a12;",
    ],
    ['  font-size: 1.15em;\n  color: #845413;', '  font-size: 1.15em;\n  color: #8a5a12;'],
  ],
};

const sentido = process.argv[2];
if (!['ida', 'volta'].includes(sentido)) throw new Error('uso: trocar-contraste-3.mjs <ida|volta>');

for (const [caminho, trocas] of Object.entries(alvos)) {
  let texto = fs.readFileSync(caminho, 'utf8');
  for (const [depois, antes] of trocas) {
    const [de, para] = sentido === 'volta' ? [depois, antes] : [antes, depois];
    if (!texto.includes(de)) throw new Error(`não achei o trecho em ${caminho}: ${JSON.stringify(de.slice(0, 70))}`);
    texto = texto.split(de).join(para);
  }
  fs.writeFileSync(caminho, texto);
  console.log(`${sentido === 'volta' ? 'revertido' : 'reaplicado'}: ${caminho} (${trocas.length} trocas)`);
}
