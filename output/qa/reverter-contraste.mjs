// Reconstrói o estado ANTERIOR às emendas de contraste, aplicando a troca inversa
// em cada hunk. Cada substituição tem que casar: se uma não casar, o script falha
// alto em vez de gerar um "antes" que não é o de verdade.
import fs from 'node:fs';

const alvos = {
  'public/assets/css/arena.css': [
    [
      `/* Botao de envio travado apos a ultima tentativa.
   A opacidade de 0.55 apagava o controle inteiro junto com o texto: "Enviar
   prompt" e o atalho "Ctrl + Enter" ficavam em 2,83 e 2,24 de contraste
   (medido no navegador). O estado desligado passa a ter paleta propria —
   superficie neutra e tinta escura — que le como indisponivel e continua
   legivel: 7,03 no rotulo e 7,30 no atalho. */
.arena-submit:disabled {
  opacity: 1 !important;
  background: #e3e8f0 !important;
  color: #414c60 !important;
  box-shadow: none !important;
  cursor: not-allowed;
}
.arena-submit:disabled .arena-submit-hint {
  background: #cbd3e1;
  color: #333c52;
}`,
      `/* Botao de envio travado apos a ultima tentativa */
.arena-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}`,
    ],
    [
      `/* Cada modo carrega um par opaco: a tinta precisa sobreviver tanto no painel
   claro quanto no topbar escuro da TV. O \`is-arena\` nao tinha par e herdava o
   azul do tema claro — no topbar escuro dava 2,12 de contraste. */
.arena-preset-chip.is-classic { background: #fff1de; color: #9a4d00; }
.arena-preset-chip.is-turma { background: #e3f2ff; color: #0052c2; }
.arena-preset-chip.is-personalizado { background: #e9fbf4; color: #007a5e; }
.arena-preset-chip.is-arena { background: #f5f7fc; color: #071f49; }`,
      `.arena-preset-chip.is-classic { background: #fff1de; color: #b35a00; }
.arena-preset-chip.is-turma { background: #e3f2ff; color: #0052c2; }
.arena-preset-chip.is-personalizado { background: #e9fbf4; color: #007a5e; }`,
    ],
    [`color: #8a5a12;\n  text-transform: uppercase;`, `color: #b7791f;\n  text-transform: uppercase;`],
  ],
  'public/assets/css/round.css': [
    [`color: #136c2f !important; font-size: 14px !important; }`, `color: #188038 !important; font-size: 14px !important; }`],
    [`content: '🏆 RESULTADO FINAL 🎉'; background: #fef2ca; color: #8a5a12;`, `content: '🏆 RESULTADO FINAL 🎉'; background: #fef2ca; color: #b07e00;`],
    [`  font-size: 1.15em;\n  color: #8a5a12;`, `  font-size: 1.15em;\n  color: #b07e00;`],
  ],
  'public/assets/css/design.css': [
    [
      `  /* #188038 sobre a própria pílula verde dava 4,28 — abaixo de AA para 14px. */
  color: #136c2f !important;
}
body[data-page='arena'] .arena-lobby-stats > span:first-child strong {
  color: #136c2f !important;`,
      `  color: #188038 !important;
}
body[data-page='arena'] .arena-lobby-stats > span:first-child strong {
  color: #188038 !important;`,
    ],
  ],
};

for (const [caminho, trocas] of Object.entries(alvos)) {
  let texto = fs.readFileSync(caminho, 'utf8');
  for (const [novo, antigo] of trocas) {
    if (!texto.includes(novo)) throw new Error(`não achei o trecho em ${caminho}: ${JSON.stringify(novo.slice(0, 60))}`);
    texto = texto.split(novo).join(antigo);
  }
  fs.writeFileSync(caminho, texto);
  console.log('revertido:', caminho);
}
