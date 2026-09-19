// Nenhuma gravação do ESTADO COLETIVO da sala pode voltar a ser cega.
//
// O defeito é medido, não hipotético: o Boss, os votos, o sorteio e a
// configuração do modo vivem num JSON por sala em `settings`. Enquanto a
// gravação era um `settings.set` direto, a sequência le-modifica-grava de duas
// instâncias do app (dois processos, dois contêineres) se sobrepunha: as duas
// liam o mesmo JSON, cada uma gravava a sua versão, e a última apagava a outra.
// O voto de um aluno ficava de fora do resultado, o desafio era fechado duas
// vezes, o sorteio perdia o grupo que o professor tinha acabado de fechar — sem
// erro nenhum na tela. `test/api/arena-mode-cas.test.mjs` prova o comportamento
// com dois despachantes sobre o mesmo banco; aqui se protege o CAMINHO, para o
// próximo `settings.set` não nascer cego dentro da mesma função.
//
// A regra tem duas partes:
//   - **as chaves do estado coletivo (`arenaModeKey`, `drawKey`) só podem ser
//     gravadas por `trocarEstado`** — o compare-and-swap que relê e reaplica
//     quando alguém gravou no meio. Chaves que não são estado coletivo (tokens e
//     códigos de projeção, o interruptor global da Arena, o índice de códigos)
//     continuam podendo gravar direto: são avisos, não decisões da turma;
//   - **o helper precisa continuar usando as duas metades** (`getComBruto` para
//     ler o texto cru que vai ser comparado, `setSeIntacto` para a gravação
//     condicional). Se alguém trocar a comparação por um `set` comum, o teste de
//     API acima ainda passaria a maior parte do tempo — este aqui reprova sempre.
//
// Controle positivo junto: o arquivo precisa continuar tendo chamadas de
// `settings.set` e os helpers do CAS. Sem isso, uma varredura quebrada (arquivo
// renomeado, expressão mudada) passaria verde sem vigiar nada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ARENA_API = 'src/server/arena-api.mjs';

/** Chaves que guardam o estado coletivo: só o compare-and-swap pode gravar. */
const CHAVES_COLETIVAS = ['arenaModeKey(', 'drawKey('];

/** Chaves que NÃO são estado coletivo — gravação direta é legítima. */
const CHAVES_LIVRES = ['tvTokenKey(', 'tvCodeIndexKey', 'ARENA_OPEN_KEY'];

function linhasDeGravacao(fonte) {
  return fonte.split('\n')
    .map((texto, indice) => ({ numero: indice + 1, texto }))
    .filter(({ texto }) => /repositories\.settings\.set\(/.test(texto));
}

test('nenhuma chave do estado coletivo é gravada direto, sem compare-and-swap', () => {
  const fonte = readFileSync(ARENA_API, 'utf8');
  const gravacoes = linhasDeGravacao(fonte);

  // Controle positivo: o arquivo realmente grava em settings, então a varredura
  // tem o que vigiar.
  assert.ok(gravacoes.length > 0, `nenhuma gravação encontrada em ${ARENA_API} — a varredura perdeu o alvo`);

  const coletivas = gravacoes.filter(({ texto }) => CHAVES_COLETIVAS.some((chave) => texto.includes(chave)));
  assert.deepEqual(
    coletivas.map(({ numero, texto }) => `${numero}: ${texto.trim()}`),
    [],
    'o estado coletivo (Boss, votos, sorteio, configuração) tem de ser gravado por trocarEstado — a gravação direta não relê nem reaplica quando outra instância gravou no meio',
  );

  // E a lista de exceções continua sendo exatamente a esperada: uma chave nova
  // aqui precisa ser classificada de propósito.
  const livres = gravacoes.filter(({ texto }) => CHAVES_LIVRES.some((chave) => texto.includes(chave)));
  assert.equal(
    livres.length + coletivas.length,
    gravacoes.length,
    `há gravação de uma chave não classificada em ${ARENA_API}: ${gravacoes
      .filter(({ texto }) => !CHAVES_COLETIVAS.some((c) => texto.includes(c)) && !CHAVES_LIVRES.some((c) => texto.includes(c)))
      .map(({ numero, texto }) => `${numero}: ${texto.trim()}`)
      .join(' | ')} — diga se é estado coletivo (vai para trocarEstado) ou não (entra em CHAVES_LIVRES)`,
  );
});

test('o compare-and-swap continua lendo o texto cru e gravando condicionalmente', () => {
  const fonte = readFileSync(ARENA_API, 'utf8');
  const inicio = fonte.indexOf('async function trocarEstado(');
  assert.notEqual(inicio, -1, 'trocarEstado sumiu: o compare-and-swap do estado coletivo precisa existir');

  const corpo = fonte.slice(inicio, fonte.indexOf('\n  }\n', inicio));
  assert.match(corpo, /settings\.getComBruto\(/, 'trocarEstado precisa ler o TEXTO guardado para comparar');
  assert.match(corpo, /settings\.setSeIntacto\(/, 'trocarEstado precisa gravar condicionalmente');
  assert.match(corpo, /tentativa/, 'trocarEstado precisa reler e reaplicar quando a gravação não acontece');
});
