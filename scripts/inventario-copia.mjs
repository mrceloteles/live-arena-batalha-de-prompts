// O inventário de cópia, legível: quantas palavras de texto visível cada tela
// entrega hoje, quanto o site base congelado entregava na mesma função, e o teto
// que a guarda (`test/copia/orcamento.test.mjs`) defende.
//
//   node scripts/inventario-copia.mjs            # tabela + perfil + texto de API
//   node scripts/inventario-copia.mjs --trechos  # + os trechos do cliente, por linha
//
// O PERFIL é a parte que a régua não faz, e é onde cada corte desta frente saiu:
// a guarda conta PALAVRAS, e uma palavra tanto pode ser uma frase que ninguém lê
// quanto o nome de um campo. Separando os dois, a fila de corte fica explícita —
// frase é candidata, rótulo é o preço da tela existir. O critério é grosseiro de
// propósito (termina em pontuação de frase e tem 4+ palavras), porque a decisão de
// cortar é humana; o que este número faz é dizer ONDE olhar.
//
// O TEXTO DE API sai aqui com a FRASE INTEIRA, e é o único lugar do repositório
// que faz isso. Ele não passa pelo bundle: o cliente só interpola, então enxugar
// o cliente deixa a versão longa viva no servidor sem aparecer em número nenhum.
// A lista de frases é o que denuncia — por isso ela é impressa por padrão, e não
// atrás de uma flag.
//
// Quem GRAVA o cartório é o teste (`UPDATE_COPY_BASELINE=1`), para existir um
// caminho só de escrita — este script é para ler.
import { existsSync, readFileSync } from 'node:fs';

import {
  DIRETORIO_DO_CLIENTE,
  copiaDaApi,
  copiaDoCliente,
  inventario,
  linhaDeBase,
  palavras,
  relatarTabela,
  replicasDaApi,
} from '../test/support/copia.mjs';

const RAIZ = new URL('../', import.meta.url);
const CARTORIO = new URL('test/copia/orcamento.json', RAIZ);
const inventarioDeHoje = inventario(RAIZ);
const base = linhaDeBase(RAIZ);

// O cartório entra para a coluna TETO dizer o mesmo número que a guarda usa —
// sem ele a tabela diria "teto 290" onde a guarda reprova a partir de 148.
const cartorioDeHoje = existsSync(CARTORIO) ? JSON.parse(readFileSync(CARTORIO, 'utf8')) : null;
if (!cartorioDeHoje) console.log('(sem test/copia/orcamento.json: o teto não pode ser mostrado — regrave o cartório)');

console.log(relatarTabela(inventarioDeHoje, base, cartorioDeHoje));
console.log('');

// Perfil do cliente: quanto do texto é prosa e quanto é rótulo de interface.
const ehFrase = (texto) => /[.!?…]$/.test(texto.trim()) && palavras(texto) >= 4;
const somar = (lista) => lista.reduce((total, trecho) => total + palavras(trecho.texto), 0);
for (const arquivo of Object.keys(inventarioDeHoje.cliente)) {
  const { trechos } = copiaDoCliente(readFileSync(new URL(arquivo, RAIZ), 'utf8'));
  const frases = trechos.filter((trecho) => ehFrase(trecho.texto));
  const rotulos = trechos.filter((trecho) => !ehFrase(trecho.texto));
  console.log(
    `${arquivo}: ${somar(frases)} palavras de frase (${frases.length} trechos) · ` +
      `${somar(rotulos)} de rótulo (${rotulos.length} trechos)`,
  );
}
console.log('');

// Texto de API: o que o servidor manda e a tela mostra depois. Crescer aqui é
// crescer na frente do aluno sem tocar em bundle; e encurtar aqui é o único corte
// que de fato muda o que ele lê nesses pontos da tela.
const { campos: camposDaApi, textos: textosDaApi } = copiaDaApi();
console.log('TEXTO DE API — o servidor manda, a tela mostra (fora do bundle)');
for (const [chave, campo] of Object.entries(camposDaApi)) {
  console.log(`  ${chave} — ${campo.trechos} frases, ${campo.palavras} palavras — ${campo.onde}`);
  for (const texto of textosDaApi[chave]) console.log(`      "${texto}"`);
}
const replicas = replicasDaApi(RAIZ);
console.log(
  replicas.length === 0
    ? '  réplicas no cliente: nenhuma'
    : `  réplicas no cliente (a mesma frase nos dois lados): ${replicas.map((r) => `${r.chave} "${r.texto}"`).join(' · ')}`,
);
console.log('');

const comTrechos = process.argv.includes('--trechos');
if (!comTrechos) {
  console.log('Use --trechos para listar cada trecho do cliente com o número da linha.');
  process.exit(0);
}

for (const arquivo of Object.keys(inventarioDeHoje.cliente)) {
  const { trechos } = copiaDoCliente(readFileSync(new URL(arquivo, RAIZ), 'utf8'));
  console.log(`\n===== ${arquivo} — ${trechos.length} trechos =====`);
  for (const trecho of trechos) {
    console.log(`  L${String(trecho.linha).padStart(5)}  ${trecho.texto}`);
  }
}

console.log(`\n(diretório do cliente: ${DIRETORIO_DO_CLIENTE}/)`);
