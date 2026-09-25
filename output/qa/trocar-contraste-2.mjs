// Aplica ou desfaz as emendas de contraste desta rodada (os 10 pares declarados
// que a régua nova reprovou). Usado para reconstruir o "antes" e provar que a
// reversão é fiel contra o retrato versionado, e depois para reaplicar.
//
//   node output/qa/trocar-contraste-2.mjs volta   # desfaz
//   node output/qa/trocar-contraste-2.mjs ida     # reaplica
//
// Cada substituição tem de casar: se uma não casar, o script falha alto em vez
// de gerar um estado que não é o de verdade.
import fs from 'node:fs';

// [depois, antes]
const alvos = {
  'public/assets/css/arena.css': [
    ['.arena-status-badge.is-draft {\n  background: #fff4e5;\n  color: #8a5a12;\n}', '.arena-status-badge.is-draft {\n  background: #fff4e5;\n  color: #b06000;\n}'],
    ['.arena-status-badge.is-refinamento {\n  background: #eef3ff;\n  color: var(--color-primary);\n}', '.arena-status-badge.is-refinamento {\n  background: #eef3ff;\n  color: #1a73e8;\n}'],
    ['.arena-status-badge.is-sprint {\n  background: #fdeaf2;\n  color: #b3261e;\n}', '.arena-status-badge.is-sprint {\n  background: #fdeaf2;\n  color: #d93025;\n}'],
    ['.arena-challenge-criteria span {\n  border-radius: 999px;\n  background: #eef3ff;\n  color: var(--color-primary);', '.arena-challenge-criteria span {\n  border-radius: 999px;\n  background: #eef3ff;\n  color: #1a73e8;'],
    ['.arena-table button.is-danger {\n  background: #fdeae7;\n  color: #b3261e;\n}', '.arena-table button.is-danger {\n  background: #fdeae7;\n  color: #d93025;\n}'],
    ['.arena-image-preview button {\n  border: 0;\n  border-radius: 999px;\n  background: #fdeae7;\n  color: #b3261e;', '.arena-image-preview button {\n  border: 0;\n  border-radius: 999px;\n  background: #fdeae7;\n  color: #d93025;'],
  ],
  'public/assets/css/design.css': [
    ['.arena-mission-badge {\n  border-radius: 999px;\n  background: #eef3ff;\n  color: var(--color-primary);\n  font-size: 12px;\n  font-weight: 900;', '.arena-mission-badge {\n  border-radius: 999px;\n  background: #eef3ff;\n  color: #1a73e8;\n  font-size: 12px;\n  font-weight: 900;'],
    ['  border-radius: 999px;\n  background: #f1f3f4;\n  color: #5f6368;\n  font-size: 13px;\n  font-weight: 900;\n}', '  border-radius: 999px;\n  background: #eef0f5;\n  color: #9aa0a6;\n  font-size: 13px;\n  font-weight: 900;\n}'],
    ['.arena-attempt-dot { background: #f1f3f4; color: #5f6368; }', '.arena-attempt-dot { background: #eef2f8; color: #8b98ad; }'],
    ['.arena-detail-close:hover {\n  color: #b3261e !important;', '.arena-detail-close:hover {\n  color: #ef4444 !important;'],
    ['.arena-admin .arena-room-card-actions button[data-action="end-room"]:hover {\n  background: #fef2f2 !important;\n  border-color: #fca5a5 !important;\n  color: #b3261e !important;', '.arena-admin .arena-room-card-actions button[data-action="end-room"]:hover {\n  background: #fef2f2 !important;\n  border-color: #fca5a5 !important;\n  color: #dc2626 !important;'],
    ['.arena-admin .arena-challenge-actions button.is-danger:hover {\n  background: #fef2f2 !important;\n  border-color: #fca5a5 !important;\n  color: #b3261e !important;', '.arena-admin .arena-challenge-actions button.is-danger:hover {\n  background: #fef2f2 !important;\n  border-color: #fca5a5 !important;\n  color: #dc2626 !important;'],
    ['  background: #f1f5f9 !important;\n  color: #5f6368 !important;\n  font-size: 13px !important;\n  font-weight: 800 !important;\n  border: 1px solid #e2e8f0 !important;', '  background: #f1f5f9 !important;\n  color: #64748b !important;\n  font-size: 13px !important;\n  font-weight: 800 !important;\n  border: 1px solid #e2e8f0 !important;'],
    ['.arena-attempt-dot.is-scored {\n  background: linear-gradient(135deg, #047857, #065f46) !important;\n  color: #ffffff !important;\n  border-color: #065f46 !important;', '.arena-attempt-dot.is-scored {\n  background: linear-gradient(135deg, #10b981, #059669) !important;\n  color: #ffffff !important;\n  border-color: #059669 !important;'],
  ],
};

const sentido = process.argv[2];
if (!['ida', 'volta'].includes(sentido)) throw new Error('uso: trocar-contraste-2.mjs <ida|volta>');

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
