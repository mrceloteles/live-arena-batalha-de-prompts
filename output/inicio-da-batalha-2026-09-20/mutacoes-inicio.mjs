// As mutações que provam que o portão do INÍCIO DA BATALHA morde.
//
// Cada caso quebra UMA das três superfícies do clique — a parede, o aluno e o
// painel — e o quarto quebra o ponteiro da faixa. Nenhum mexe em mais de uma
// linha, para que a falha tenha nome: quem reprovou foi aquela superfície.
//
// Uso: node tmp/qa/mutacoes-inicio.mjs <caso> <aplicar|desfazer>
import { readFileSync, writeFileSync } from 'node:fs';

const ARQUIVO = 'public/assets/js/arena.js';

const CASOS = {
  // A parede fica no lobby depois de o professor iniciar: o defeito que se viu
  // em aula (a sala começava e a projeção seguia mostrando o código).
  'parede-fica-no-lobby': [
    '      if (tv.current_round) {\n        setContent(roundMarkup(tv), \'round\');',
    '      if (false) {\n        setContent(roundMarkup(tv), \'round\');',
  ],
  // O aluno não recebe a missão: continua no lobby esperando o professor.
  'aluno-nao-recebe-a-missao': [
    '      const mission = lobby.current_round;',
    '      const mission = null;',
  ],
  // O painel abre a rodada e a faixa continua prometendo o início — a ação da
  // vez sem acompanhar o que a rodada passou a ser.
  'painel-nao-vira-a-missao': [
    '      if (current) {\n        return faltam > 0',
    '      if (false) {\n        return faltam > 0',
  ],
  // A faixa aponta o botão do início, mas sem o peso de primário: o clique do
  // professor cai no lugar errado.
  'sem-ponteiro-de-acao': [
    "      const marca = (id) => (acao.id === id ? ' data-proximo' : '');",
    "      const marca = () => '';",
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
