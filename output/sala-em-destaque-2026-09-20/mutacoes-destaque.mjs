// As mutações que provam que o portão da SALA EM DESTAQUE morde.
//
// Cada caso quebra UMA das frases do portão — a lista como seletor, o clique na
// linha, o comando solto no cabeçalho, o ponteiro da ação da vez, o menu, a
// faixa no cabeçalho e a repetição da batalha no fim (e não no meio) da aula —,
// e nenhum mexe em mais de um trecho, para que a falha tenha nome.
//
// Uso: node tmp/qa/mutacoes-destaque.mjs <caso> <aplicar|desfazer>
//
// O desfazer troca `para` por `de`. Um `para` vazio seria troca de string vazia
// — que o `String.replace` insere no COMEÇO do arquivo e corrompe o bundle (foi
// o que aconteceu na primeira rodada). Por isso o caso que tira texto do bundle
// não tira: REESCREVE o trecho, e a troca continua tendo dois lados.
//
// A gravação tenta de novo algumas vezes: em 20/09/2026 o Windows travou o
// arquivo no meio da rodada (`UNKNOWN: unknown error, open`), o desfazer não
// aconteceu e as mutações EMPILHARAM — as leituras seguintes saíram todas
// erradas. Uma mutação que não volta é pior que uma mutação que não morde.
import { readFileSync, writeFileSync } from 'node:fs';

const ARQUIVO = 'public/assets/js/arena.js';

const CASOS = {
  // A linha da lista volta a carregar um botão de ação: é o defeito de origem
  // (seis botões por linha, todos com o mesmo peso).
  'lista-volta-a-ter-botoes': [
    '            </span>\n          </button>\n        </article>`;',
    '            </span>\n          </button>\n          <button type="button" data-action="publish">Abrir sala</button>\n        </article>`;',
  ],
  // O clique na linha deixa de selecionar: a linha parece um botão e não
  // responde — o defeito que a lista-seletor existe para tirar.
  'clique-na-linha-nao-seleciona': [
    "        if (action === 'detail') {\n          state.selectedRoomId = roomId;",
    "        if (action === 'nao-e-detail') {\n          state.selectedRoomId = roomId;",
  ],
  // Um comando administrativo solto ao lado da ação da vez: o cabeçalho volta a
  // ter controles concorrentes com o mesmo peso.
  'comando-solto-no-cabecalho': [
    '          <div class="arena-room-card-actions arena-detail-command">\n            ${primario}',
    '          <div class="arena-room-card-actions arena-detail-command">\n            <button type="button" data-action="room-edit">Editar sala</button>\n            ${primario}',
  ],
  // O botão da ação da vez perde o ponteiro: a faixa aponta uma ação e nenhum
  // controle carrega o peso dela.
  'sem-ponteiro-de-acao': [
    'class="arena-detail-primary" data-action="${esc(acao.id)}" data-proximo>',
    'class="arena-detail-primary" data-action="${esc(acao.id)}">',
  ],
  // O comando administrativo sai do •••: o menu deixa de ser a casa do que não
  // é da aula, e o professor não tem por onde editar a sala pelo cabeçalho.
  'menu-sem-comandos': [
    'data-action="room-edit">Editar sala</button>',
    'data-action="room-editar-indisponivel">Editar sala</button>',
  ],
  // A faixa de estado sai de cena: o cabeçalho fica sem os números que o
  // professor lê antes de decidir.
  'faixa-fora-do-cabecalho': [
    "      const faixaSlot = $('[data-arena-state-bar]');\n      if (faixaSlot) {\n        faixaSlot.innerHTML = `",
    "      const faixaSlot = null;\n      if (faixaSlot) {\n        faixaSlot.innerHTML = `",
  ],
  // "Nova batalha nesta sala" volta a aparecer no MEIO da aula: o botão que
  // repete a partida fica ao lado de "Encerrar rodada", a um clique de estrago.
  'nova-batalha-no-meio-da-aula': [
    "        room.status === 'ended' && canStartNewBattle(room, detail)",
    '        canStartNewBattle(room, detail)',
  ],
};

/** Grava com retentativa: um lock de antivírus/indexador não pode empilhar mutação. */
const gravar = (texto) => {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      writeFileSync(ARQUIVO, texto);
      return;
    } catch (erro) {
      if (tentativa >= 20) throw erro;
      const ate = Date.now() + 250;
      while (Date.now() < ate) { /* espera curta */ }
    }
  }
};

const [caso, modo] = process.argv.slice(2);
if (!CASOS[caso]) throw new Error(`caso desconhecido: ${caso} (use ${Object.keys(CASOS).join(', ')})`);
const [de, para] = CASOS[caso];
const atual = readFileSync(ARQUIVO, 'utf8');
const [alvo, troca] = modo === 'aplicar' ? [de, para] : [para, de];
if (!atual.includes(alvo)) throw new Error(`o trecho de "${caso}" não está no arquivo — ${modo}`);
gravar(atual.replace(alvo, troca));
console.log(`${modo} ${caso}: ok`);
