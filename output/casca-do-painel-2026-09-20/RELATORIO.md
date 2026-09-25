# A faixa de topo saiu, a barra lateral ficou de pé

Data: 20/09/2026 · branch `master` · sem commit (trabalho no diretório de trabalho)
Tela: `admin-arena.php` (o painel do professor). Nada fora dele foi tocado.

## O que estava errado, nas palavras de quem usa

1. **"Foi criado um menu superior"** — havia uma faixa acima do conteúdo com o
   título *Painel da Arena*, o menu (Analytics, Portal), o selo `Arena aberta` e
   o botão `Fechar Arena`. Ela custava uma altura inteira de tela em toda
   largura, repetia o que a barra lateral já dizia e duplicava o link de
   Analytics (que já é o item *Relatório Analytics* da navegação).
2. **"Ao clicar na sala o menu lateral não deve sumir"** — a camada de composição
   das rodadas anteriores tinha seis regras `body:has(.admin-arena-detail:not([hidden])) …`
   que, ao abrir a sala, deitavam a barra lateral numa faixa horizontal. Elas
   foram removidas (nenhuma existe no commit: `git show HEAD:public/assets/css/refinement.css`
   responde 0). Medido abaixo, nas quatro larguras.

## O que mudou

| Peça | Onde estava | Onde ficou |
|---|---|---|
| Título do painel + "Operação ao vivo" | faixa de topo | topo da barra lateral (`.arena-sidebar-title`) |
| Portão da Arena (`Abrir/Fechar Arena`) e o selo de estado | faixa de topo | pé da barra lateral, acima do cartão do professor |
| Link para o portal público | faixa de topo (Analytics + Portal) | pé da barra lateral, só `Portal` |
| "Ver como o aluno" e "Ver na TV" | faixa de topo | linha dos selos do cartão da sala em destaque |
| Faixa de topo | — | **não existe mais** |

O portão é o controle da operação inteira (vale para toda sala) e é o que o
professor fecha no fim da aula: no pé da lateral ele fica sempre à vista sem
custar altura. As duas portas de inspeção são **da sala em destaque** — no
cabeçalho do painel elas abririam "uma sala", sem dizer qual; no cartão, ficam ao
lado do nome e do código da sala que elas abrem.

O rótulo é `Portal`, o mesmo que a faixa usava: um link de uma palavra, sem
palavra nova no orçamento da tela (o teto de `painel-do-professor` desceu de 73
para 72 palavras com a saída do link duplicado de Analytics).

## Medições (sonda `tmp/qa/sonda-casca.mjs`, painel EM PROCESSO, banco de memória)

| Largura | faixa de topo | lateral | portão na lateral | portas no cartão | rolagem lateral |
|---|---|---|---|---|---|
| sem sala | ausente | 244×900 em coluna | sim | slot vazio | não |
| 1920×1080 | ausente | 244×1080 | sim | 2, preenchidas | não |
| 1440×900 | ausente | 244×900 | sim | 2, preenchidas | não |
| 1024×768 | ausente | 244×768 | sim | 2, preenchidas | não |
| 390×844 | ausente | 390×441 (topo) | sim | 2, preenchidas | não |

`erros: []` — nenhum `pageerror` nem `console.error` no caminho.

## A prova de que o desenho de fora não mudou

O portão 2 (`test/browser/css-render.test.mjs`) compara o estilo computado de
todos os elementos de cada tela. Com a faixa de topo reposta no HTML e a folha
nova, os totais batem **exatamente** com o cartório antigo (252 / 563 / 570) —
ou seja, o HTML de antes foi reproduzido —, mas o hash não, porque os nomes das
classes da casca mudaram (`arena-topbar-title` → `arena-sidebar-title`, etc.).

Comparando as duas capturas **por assinatura de elemento (tag + estilo
computado), sem caminho no DOM** — o desenho de fora, não a ordem:

| Tela | assinaturas que só existem com a faixa | que só existem sem ela |
|---|---|---|
| painel-do-professor (1440 e 390) | 8 | 6 |
| sala-em-destaque-em-jogo (1440 e 390) | 10 | 8 |

Todas as 8/10 que saem são nós da casca (o `header`, o título, o `flex` das
ações, o botão do portão, os dois `a` das portas) e todas as 6/8 que entram são
os nós da casca nova (título na lateral, portão, crumb, portas). **Todo o resto —
244 elementos no painel e 560 na sala — tem estilo computado idêntico**, byte a
byte. Nenhuma regra fora da casca foi tocada por engano.

## O defeito que apareceu no caminho (e foi corrigido)

O teste de navegador `draws the next players, keeps the winner in the bowl and
runs the knockout` estava vermelho (61,7 s de espera). A causa não era o desenho:
a camada de composição tinha trocado

```diff
-        ${drawPanel(detail.draw)}
+        ${arena && arena.enabled ? drawPanel(detail.draw) : ''}
```

e o **Sorteio da vez desaparecia de toda sala que não é do Modo Arena** — isto é,
das salas de missão (`personalizado`), que são as que a aula usa. Reproduzido em
sonda própria: o `draw` vinha no payload do servidor e a seção não estava na
tela (`temSorteio: false`, body sem a seção). O painel do Modo Arena continua
condicionado a `arena.enabled`; o Sorteio da vez voltou a ser o que sempre foi.
Com a correção, o teste passa em 4,4 s e o `Sorteio da vez` reaparece nas fotos.

## Portões

- `npm test` — **540 testes · 538 passam · 1 pulado · 1 falha**, e a falha é a
  conhecida intermitente `test/api/arena-estacionamento.test.mjs` (fila do juiz,
  que depende de tempo real e de máquina livre). Isolada: **10/10 passam**.
- `npm run test:browser` — **42/42**.
- `test/css/{cascata,mortas,classes-vivas,contraste}.json` e
  `test/css/render.json` regravados (`UPDATE_CSS_BASELINE=1`) depois de a prova
  acima; o cartório de cópia (`test/copia/orcamento.json`) foi **apertado**, não
  solto: `painel-do-professor` 73 → 72 palavras.
- A cascata morta continua em **zero** e nenhuma folha tem classe sem produtor:
  a faxina levou junto o cluster `.arena-admin-head` (seis regras que só existiam
  porque o nome da classe da faixa antiga as continha como substring — nenhum
  elemento jamais casou com elas).

## Onde ver

Fotos em `output/casca-do-painel-2026-09-20/evidencias/` (sufixo `-final`), folha
de contato em `folha.html`. Prévia desta thread: `http://127.0.0.1:3000/admin-arena.php`
(`arena.js?v=115`, `refinement.css?v=42`, `design.css?v=61`).

## O que ficou de fora, de propósito

- **A tabela de participantes** continua sendo tabela em 768 e 390 (a referência
  pede lista). Não é a casca; mexer nela agora sujaria as duas causas.
- **O menu do •••** e a bancada de comandos seguem como estavam.
