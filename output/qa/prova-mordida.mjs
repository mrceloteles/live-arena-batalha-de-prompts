// PROVA DE QUE AS GUARDAS MORDEM.
//
//   node output/qa/prova-mordida.mjs
//
// Uma guarda que nunca reprovou não é uma guarda: é uma testemunha que concorda
// com tudo. Este roteiro desfaz, UMA METADE POR VEZ, exatamente as emendas que o
// refinamento de 16/09 fez nas folhas, roda o teste que vigia aquela metade e
// guarda o texto do erro. Depois restaura da cópia e confirma de novo o verde.
//
// A cópia é a fonte da verdade da restauração: se algo der errado no meio, o
// arquivo volta byte a byte do backup, não de uma segunda substituição (que
// poderia não casar e deixar a folha pela metade).
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const arquivo = (caminho) => `${raiz}${caminho}`;

// --- As metades, como estavam antes de cada emenda ---------------------------
const metades = [
  {
    nome: 'TV — a faixa única do cabeçalho',
    folhas: ['public/assets/css/refinement.css'],
    teste: 'test/browser/arena-ui.test.mjs',
    filtro: 'faixa da TV',
    emendas: [{
      de: '  grid-template-columns: auto minmax(0, 1fr) auto auto;',
      para: '  grid-template-columns: auto minmax(0, 1fr) auto;',
    }, {
      // Repor só as colunas não reproduziria o defeito: com `grid-column: 4` o
      // botão iria para uma quarta coluna implícita e continuaria na linha 1. A
      // reversão repõe as duas coisas — três colunas E a ausência de posição
      // explícita no botão, que é o que o jogava para a linha 2.
      de: '.arena-tv-fullscreen-btn {\n  grid-column: 4;\n  grid-row: 1;\n  justify-self: end;\n}',
      para: '.arena-tv-fullscreen-btn {\n  justify-self: end;\n}',
    }],
    esperado: /faixa de ferramentas tem de ser UMA linha/,
  },
  {
    nome: 'entradas — o botão e o anel de foco',
    folhas: ['public/assets/css/refinement.css'],
    teste: 'test/browser/arena-ui.test.mjs',
    filtro: 'faixa da TV',
    emendas: [{
      de: '  height: 48px !important;\n  min-height: 48px !important;\n  border-radius: 10px !important;\n  font-size: 15px !important;\n  font-weight: 600 !important;',
      para: '  height: 50px !important;\n  min-height: 50px !important;\n  border-radius: 999px !important;\n  font-size: 16px !important;\n  font-weight: 900 !important;',
    }],
    esperado: /as duas entradas usam o mesmo botão/,
  },
  {
    nome: 'a espera durante a votação (item 7)',
    folhas: ['public/assets/css/design.css'],
    teste: 'test/browser/arena-ui.test.mjs',
    filtro: 'Wild Card ocupa a tela',
    emendas: [{
      de: '.arena-mission-panel:not([hidden]):has(.arena-mission-empty:not([hidden])) {\n  min-height: 480px;\n  display: flex !important;',
      para: '.arena-mission-panel:has(.arena-mission-empty:not([hidden])) {\n  min-height: 480px;\n  display: flex !important;',
    }],
    esperado: /o painel da missão não pode estar pintado durante a votação/,
    // Contraprova do caminho: com a folha íntegra a mesma guarda passa, e é ela
    // que sustenta a correção no CI.
    contraProva: 'com a folha íntegra, o painel fica `display: none` e a votação ocupa a tela sozinha',
  },
];

// Devolve o texto que o runner imprimiu, tenha passado ou não.
function rodar({ teste, filtro }) {
  try {
    const saida = execFileSync('node', ['--test', '--test-concurrency=1', `--test-name-pattern=${filtro}`, teste], {
      cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000,
    });
    return { passou: true, saida };
  } catch (erro) {
    return { passou: false, saida: `${erro.stdout || ''}${erro.stderr || ''}` };
  }
}

// A asserção que reprovou, com a mensagem dela — e não o resumo do runner.
function mensagemDaFalha(saida) {
  const marcadas = saida.split(/\r?\n/).filter((linha) => /AssertionError|Error:/.test(linha));
  return marcadas[0]?.trim() || saida.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
}

// O estado íntegro de todas as folhas envolvidas, guardado ANTES de qualquer
// emenda: a restauração não depende de o roteiro acertar o caminho de volta.
const originais = new Map();
const copias = new Map();
for (const metade of metades) {
  for (const caminho of metade.folhas) {
    if (originais.has(caminho)) continue;
    const texto = readFileSync(arquivo(caminho), 'utf8');
    const copia = arquivo(`${caminho}.backup-mordida`);
    writeFileSync(copia, texto);
    originais.set(caminho, texto);
    copias.set(caminho, copia);
  }
}

const restaurar = () => { for (const [caminho, texto] of originais) writeFileSync(arquivo(caminho), texto); };
const limpar = () => { for (const copia of copias.values()) rmSync(copia); };

// `design.css` está em CRLF e `refinement.css` em LF — a mesma emenda escrita
// com `\n` casa numa folha e não na outra. O padrão aceita as duas terminações;
// quem restaura é a cópia byte a byte, então a emenda temporária não precisa
// preservar o terminador original.
const comoRegex = (texto) => new RegExp(
  texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'),
);

let falhouAlguma = false;
try {
  for (const metade of metades) {
    restaurar();
    for (const caminho of metade.folhas) {
      let texto = readFileSync(arquivo(caminho), 'utf8');
      for (const emenda of metade.emendas) {
        const alvo = comoRegex(emenda.de);
        if (!alvo.test(texto)) {
          throw new Error(`a emenda de "${metade.nome}" não casou em ${caminho}: ${JSON.stringify(emenda.de.slice(0, 60))}`);
        }
        texto = texto.replace(alvo, emenda.para);
      }
      writeFileSync(arquivo(caminho), texto);
    }
    console.log(`\n=== ${metade.nome}: emenda desfeita, rodando a guarda ===`);

    const resultado = rodar(metade);
    const mensagem = mensagemDaFalha(resultado.saida);
    if (resultado.passou) {
      falhouAlguma = true;
      console.log(`REPROVOU A PROVA: a guarda passou com a metade desfeita.`);
    } else if (!metade.esperado.test(resultado.saida)) {
      falhouAlguma = true;
      console.log(`REPROVOU A PROVA: o erro não é o esperado (${metade.esperado}). Veio: ${mensagem}`);
    } else {
      console.log(`morde: ${mensagem}`);
    }
  }
} finally {
  restaurar();
  limpar();
}

console.log('\n=== folhas restauradas; as guardas voltam a passar? ===');
for (const metade of metades) {
  const resultado = rodar(metade);
  if (!resultado.passou) {
    falhouAlguma = true;
    console.log(`AINDA REPROVA (${metade.nome}): ${mensagemDaFalha(resultado.saida)}`);
  } else {
    console.log(`verde de novo: ${metade.nome}`);
  }
}

console.log(falhouAlguma ? '\nA PROVA FALHOU' : '\nA PROVA PASSOU: cada guarda reprova sem a sua emenda e passa com ela');
process.exit(falhouAlguma ? 1 : 0);
