// Analisa o JSON do probe de contraste: imprime tudo abaixo do teto por tela.
// Uso: node output/qa/analisa-contraste.mjs <json> [filtroRegex]
import fs from 'node:fs';

const arquivo = process.argv[2] || 'tmp/qa/contraste-antes/contraste.json';
const filtro = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const j = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

const medidas = j.medidas.filter((m) => !filtro || filtro.test(m.tela + ' ' + m.seletor + ' ' + String(m.texto)));

console.log('=== resumo por tela');
const porTela = new Map();
for (const m of medidas) {
  const t = porTela.get(m.tela) || { total: 0, reprovado: 0, decidir: 0, suspeita: 0 };
  t.total++;
  if (m.suspeita) t.suspeita++;
  else if (m.razaoReal < m.teto) t.reprovado++;
  else if (m.confiancaBaixa) t.decidir++;
  porTela.set(m.tela, t);
}
for (const [tela, t] of porTela) {
  console.log(
    String(tela).padEnd(34),
    String(t.total).padStart(4),
    'válidas:', String(t.total - t.reprovado - t.decidir - t.suspeita).padStart(3),
    'abaixo:', String(t.reprovado).padStart(3),
    'a decidir:', String(t.decidir).padStart(3),
    'suspeitas:', String(t.suspeita).padStart(2),
  );
}

for (const nivel of ['REPROVADO (abaixo do teto)', 'A DECIDIR (texto fino)', 'RÉGUA SUSPEITA']) {
  const linha = medidas.filter((m) =>
    nivel.startsWith('REPROVADO') ? !m.suspeita && m.razaoReal < m.teto
    : nivel.startsWith('A DECIDIR') ? !m.suspeita && m.razaoReal >= m.teto && m.confiancaBaixa
    : m.suspeita);
  if (!linha.length) continue;
  console.log('\n=== ' + nivel + ' — ' + linha.length);
  for (const m of linha.sort((a, b) => a.razaoReal - b.razaoReal)) {
    console.log(
      m.razaoReal.toFixed(2).padStart(6),
      '<', String(m.teto).padEnd(5),
      (m.confianca || '-').padEnd(9),
      String(m.tela).padEnd(30),
      String(m.seletor).slice(0, 40).padEnd(41),
      JSON.stringify(String(m.texto).slice(0, 34)).padEnd(37),
      '| fundo', String(m.fundoUsado).padEnd(22),
      '| liso', m.fundoLiso,
    );
  }
}
