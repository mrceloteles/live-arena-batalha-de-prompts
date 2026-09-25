// O que a faixa de estado ACRESCENTOU de cópia, trecho por trecho.
//
// A régua de orçamento diz o total (+22 palavras no bundle `arena.js`) e não diz
// o que entrou: quem regrava a `nota` precisa da lista, e ela tem de sair do
// mesmo extractor que mede — não de uma contagem de olho.
import { readFileSync } from 'node:fs';

import { copiaDoCliente } from '../../test/support/copia.mjs';

const fonte = readFileSync('public/assets/js/arena.js', 'utf8');
const { trechos, palavras } = copiaDoCliente(fonte);

// As frases e rótulos que esta frente escreveu. Tudo o que aparece aqui conta
// como cópia; o que ficou de fora desta lista não foi somado.
const MEUS = [
  'Estado', 'Alunos', 'Envios', 'Avaliações', 'Próxima ação',
  'Entre rodadas', 'Pausada', 'resultados no ar', 'Missão',
  'Acompanhar os envios', 'Corrigir as missões', 'pendente', 'pendentes',
  'Encerrar rodada', 'Fechar resultados', 'Retomar missão', 'Nova batalha nesta sala',
];

const palavrasDe = (texto) => texto.split(/\s+/).filter((pedaco) => /\p{L}{2,}/u.test(pedaco)).length;
let soma = 0;
for (const trecho of trechos) {
  if (!MEUS.some((meu) => trecho.texto.includes(meu))) continue;
  soma += palavrasDe(trecho.texto);
  console.log(`linha ${String(trecho.linha).padStart(4)}  ${String(palavrasDe(trecho.texto)).padStart(2)} pal  ${trecho.texto}`);
}
console.log(`\nbundle inteiro: ${palavras} palavras em ${trechos.length} trechos`);
