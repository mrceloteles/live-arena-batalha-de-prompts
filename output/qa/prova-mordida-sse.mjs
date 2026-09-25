// Prova de mordida do filtro de eventos por sala.
//
// Desfaz UMA metade de cada vez, a partir de uma copia byte a byte, roda o teste
// que vigia aquela metade e exige a reprovacao com a mensagem certa. No fim,
// devolve os arquivos e confere o hash.
//
//   node output/qa/prova-mordida-sse.mjs
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const raiz = process.cwd();
const hash = (caminho) => createHash('sha256').update(readFileSync(caminho)).digest('hex');

const metades = [
  {
    nome: 'cliente da TV: conectar antes de saber a sala',
    caminho: 'public/assets/js/arena.js',
    de: '        // O PIN identifica a sala na URL, mas o ID da sala vem do servidor — e a\r\n'
      + '        // conexao do stream e DA SALA. Entao a primeira leitura vem antes dela:\r\n'
      + '        // sem o id, a conexao nasceria no escopo global (so o evento da arena) e\r\n'
      + '        // a TV perderia o empurrao da propria sala.\r\n'
      + '        refresh(true).then(() => { if (tvRoomId) connectAndPoll(); });\r\n',
    para: '        connectAndPoll();\r\n',
    teste: 'test/browser/stream-por-sala.test.mjs',
    // A espera estoura antes das asserções, e o proprio recado ja mostra a
    // conexao anonima que a metade desfeita produz.
    esperado: 'anônimas: 1',
  },
  {
    nome: 'servidor: evento de sala entregue a quem nao provou a sala',
    caminho: 'src/server/events.mjs',
    de: "      : [...(roomClients.get(String(roomId)) ?? [])];\n",
    para: "      : [...globalClients, ...(roomClients.get(String(roomId)) ?? [])];\n",
    teste: 'test/smoke/arena-room-events.test.mjs',
    esperado: 'nao podia chegar evento nesta conexao',
  },
  {
    nome: 'servidor: a conexao deixa de ser reverificada (autorizacao vira selo de entrada)',
    caminho: 'src/server/events.mjs',
    de: "    if (roomId && typeof revalidate === 'function') {\n",
    para: "    if (false && roomId && typeof revalidate === 'function') {\n",
    teste: 'test/smoke/arena-room-events.test.mjs',
    esperado: 'a conexao da Ana recebe o aviso de revogacao',
  },
  {
    nome: 'cliente: a tela reconecta depois da revogacao em vez de fechar',
    caminho: 'public/assets/js/arena.js',
    de: "    roomEventSource.addEventListener('revoked', () => { closeRoomEvents(); });\r\n",
    para: '',
    teste: 'test/browser/stream-por-sala.test.mjs',
    esperado: 'a superfície revogada não reconecta sem prova de sala',
  },
];

let falhou = 0;
for (const metade of metades) {
  const caminho = `${raiz}/${metade.caminho}`;
  const original = readFileSync(caminho, 'utf8');
  const antes = hash(caminho);
  if (!original.includes(metade.de)) {
    console.log(`✖ ${metade.nome}: nao achei o trecho a desfazer (o produto mudou?)`);
    falhou += 1;
    continue;
  }
  writeFileSync(caminho, original.replace(metade.de, metade.para));
  writeFileSync(`${caminho}.mordida.bak`, original);
  let saida = '';
  try {
    execFileSync(process.execPath, ['--test', metade.teste], { cwd: raiz, encoding: 'utf8', stdio: 'pipe', timeout: 420_000 });
    saida = '(o teste passou com a metade desfeita)';
  } catch (error) {
    saida = `${error.stdout || ''}${error.stderr || ''}`;
  }
  copyFileSync(`${caminho}.mordida.bak`, caminho);
  writeFileSync(caminho, original);
  // A copia de seguranca nao pode ficar na arvore: ela e do instrumento, nao do
  // projeto, e um `.mordida.bak` esquecido entra no proximo commit sem querer.
  rmSync(`${caminho}.mordida.bak`, { force: true });
  const depois = hash(caminho);
  const mordeu = saida.includes(metade.esperado);
  const restaurado = depois === antes;
  console.log(`${mordeu && restaurado ? '✔' : '✖'} ${metade.nome}`);
  console.log(`   reprovou com o texto esperado: ${mordeu ? 'sim' : 'NAO'} — esperado "${metade.esperado}"`);
  console.log(`   arquivo restaurado byte a byte: ${restaurado ? 'sim' : 'NAO'} (${depois.slice(0, 12)})`);
  if (!mordeu || !restaurado) {
    console.log('   trecho da saida:', saida.split('\n').filter((linha) => linha.trim()).slice(-6).join(' | '));
    falhou += 1;
  }
}
console.log(falhou === 0 ? `\nAs ${metades.length} metades mordem.` : `\n${falhou} de ${metades.length} metade(s) NAO mordem.`);
process.exit(falhou === 0 ? 0 : 1);
