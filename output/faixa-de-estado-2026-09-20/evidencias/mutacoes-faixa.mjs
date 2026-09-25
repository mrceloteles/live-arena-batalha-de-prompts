// As mutações que provam que o portão da faixa de estado MORDE.
//
// Um teste que passa na primeira execução não provou nada por si só: ele pode
// estar medindo o vazio. Cada caso abaixo é uma troca exata no fonte do produto
// — aplicada e desfeita por este mesmo script —, e o portão tem de reprovar com
// a mensagem da asserção que a mutação contraria.
//
// Uso: node tmp/qa/mutacoes-faixa.mjs <caso> <aplicar|desfazer>
import { readFileSync, writeFileSync } from 'node:fs';

const ARQUIVO = 'public/assets/js/arena.js';

const CASOS = {
  // Ninguém recebe o peso da ação da vez: o estado 1 (sala esperando) deixa de
  // apontar o botão de iniciar.
  'sem-marca': [
    "const marca = (id) => (acao.id === id ? ' data-proximo' : '');",
    "const marca = () => '';",
  ],
  // A faixa volta a escrever por fora do rótulo compartilhado: a ação é a mesma,
  // a frase não — é a divergência que o `ROTULOS_DA_BATALHA` existe para tornar
  // impossível, e o único jeito de reintroduzi-la é ignorar o mapa.
  'rotulo-por-fora': [
    "? { id: '', rotulo: 'Acompanhar os envios' }\n          : { id: 'end-round', rotulo: ROTULOS_DA_BATALHA.endRound };",
    "? { id: '', rotulo: 'Acompanhar os envios' }\n          : { id: 'end-round', rotulo: 'Encerrar a missão' };",
  ],
  // Esperar vira clicar: com gente ainda escrevendo, um botão passa a receber o
  // peso da ação primária.
  'espera-vira-acao': [
    "? { id: '', rotulo: 'Acompanhar os envios' }",
    "? { id: 'end-round', rotulo: 'Acompanhar os envios' }",
  ],
  // A sala que espera lugar volta a prometer a partida: é o defeito que apareceu
  // na tela antes de virar guarda — a faixa apontando um botão desabilitado.
  'promete-o-impossivel': [
    "if (trava && ['waiting', 'open'].includes(room.status) && pendentes) return { id: '', rotulo: '' };",
    "if (false) return { id: '', rotulo: '' };",
  ],
};

const [caso, modo] = process.argv.slice(2);
if (!CASOS[caso]) throw new Error(`caso desconhecido: ${caso} (use ${Object.keys(CASOS).join(', ')})`);
const [de, para] = CASOS[caso];
const atual = readFileSync(ARQUIVO, 'utf8');
const [alvo, troca] = modo === 'aplicar' ? [de, para] : [para, de];
if (!atual.includes(alvo)) throw new Error(`o trecho de "${caso}" não está no arquivo — ${modo}`);
writeFileSync(ARQUIVO, atual.replace(alvo, troca));
console.log(`${modo} ${caso}: ok`);
