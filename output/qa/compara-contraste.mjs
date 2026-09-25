// Compara as duas passagens do probe de contraste: o que estava abaixo do teto
// antes e o que aconteceu com exatamente a mesma caixa depois.
import fs from 'node:fs';

const ler = (p) => JSON.parse(fs.readFileSync(p, 'utf8')).medidas;
const antes = ler('tmp/qa/contraste-antes/contraste.json');
const depois = ler('tmp/qa/contraste-depois/contraste.json');

const chave = (m) => `${m.tela}|${m.caminho}|${m.texto}`;
const mapaDepois = new Map(depois.map((m) => [chave(m), m]));

const resumo = (linhas) => {
  const validas = linhas.filter((l) => !l.suspeita && !l.confiancaBaixa);
  return {
    total: linhas.length,
    validas: validas.length,
    decidir: linhas.filter((l) => !l.suspeita && l.confiancaBaixa).length,
    suspeitas: linhas.filter((l) => l.suspeita).length,
    reprovadasValidas: validas.filter((l) => !l.passa).length,
    reprovadasTodas: linhas.filter((l) => !l.passa).length,
  };
};
const a = resumo(antes), d = resumo(depois);
console.log('=== total (19 telas: aluno + TV)');
for (const campo of ['total', 'validas', 'decidir', 'suspeitas', 'reprovadasValidas', 'reprovadasTodas']) {
  console.log('  ' + campo.padEnd(18), String(a[campo]).padStart(4), '→', String(d[campo]).padStart(4));
}

console.log('\n=== linha a linha: tudo que reprovava antes (qualquer classificação)');
const falhasAntes = antes.filter((m) => !m.passa).sort((x, y) => x.razaoReal - y.razaoReal);
for (const m of falhasAntes) {
  const dep = mapaDepois.get(chave(m));
  const estado = dep
    ? (dep.suspeita ? 'fora do veredito (' + dep.suspeita.split(':')[0] + ')'
      : dep.passa ? 'passa' : 'AINDA FALHA')
    : 'não medido depois';
  console.log(
    '\n  ' + m.tela + ' · ' + m.seletor + ' · ' + m.fontPx + 'px/' + m.peso + ' · "' + m.texto + '"',
    '\n      declarada', m.corDeclarada, '→', dep ? dep.corDeclarada : '-',
    '\n      antes', String(m.razaoReal).padStart(5), '(' + (m.confiancaBaixa ? 'a decidir' : m.suspeita ? 'suspeita' : 'válida') + ') teto', m.teto,
    '\n      depois', dep ? String(dep.razaoReal).padStart(5) : '   -', '(' + (dep ? (dep.confiancaBaixa ? 'a decidir' : dep.suspeita ? 'suspeita' : 'válida') : '-') + ') teto', dep ? dep.teto : '-',
    '\n      →', estado,
  );
}

console.log('\n=== régua: linhas que mudaram de classificação (mesma caixa)');
let mudaram = 0;
for (const m of antes) {
  const dep = mapaDepois.get(chave(m));
  if (!dep) continue;
  const cls = (x) => (x.suspeita ? 'suspeita' : x.confiancaBaixa ? 'a decidir' : 'válida');
  if (cls(m) !== cls(dep)) {
    mudaram++;
    if (mudaram <= 12) console.log('  ' + m.tela.padEnd(24), String(m.seletor).slice(0, 30).padEnd(31), cls(m).padEnd(10), '→', cls(dep), dep.suspeita ? '(' + dep.suspeita.split(':')[0] + ')' : '');
  }
}
console.log('  total de mudanças de classificação:', mudaram);
