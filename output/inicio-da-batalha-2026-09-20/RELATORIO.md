# Iniciar batalha — as três telas no mesmo clique

**Data:** 20/09/2026 · **Checkout:** `batalha-de-prompts-main` (branch `master`) · **Frente:** §2 passo 5 e §11 do
plano "fluxo de sala, telão e início da batalha".

---

## 1. O que esta frente entrega

O passo anterior fechou "Abrir sala": a sala passa a receber alunos **e o telão entra junto** (`apresentarTelao`,
com o diálogo de projeção quando o navegador bloqueia a aba). O passo seguinte do plano é o outro clique —
**"Iniciar batalha"** — e a exigência dele não é que o servidor abra a rodada (isso o portão de API já cobria),
é que **as três superfícies entrem na rodada no mesmo clique**:

| Superfície | O que tinha de acontecer | O que o portão mede |
|---|---|---|
| Painel do professor | sai de "Pronta para começar" e passa a dizer a missão no ar e a ação da vez | célula de estado, célula de próxima ação, botão primário |
| Telão | sai do lobby e mostra a missão com o tempo correndo | selo da missão, cronômetro, placar coletivo, nenhum controle administrativo |
| Aluno | recebe o formulário da rodada, sem recarregar | campo do prompt visível e a contagem da missão |

O que **não** existia era a verificação disso: nenhum dos 37 portões de navegador olhava as três telas depois do
clique. O defeito que essa lacuna escondia é o que se viu em aula: a sala começava e a projeção seguia no lobby,
mostrando o código para uma turma que já estava escrevendo.

## 2. O portão novo

`test/browser/inicio-da-batalha.test.mjs` — um teste, quatro superfícies de verdade:

1. **Alunos** entram pelo formulário real (`/play?pin=…`) em contextos de navegador separados (sem o cookie do
   painel): 390×844, o celular da sala de aula.
2. **Telão** é a projeção real: sessão própria por `arena_tv_token` (Set-Cookie) e `tv.php?pin=…` em 1920×1080.
3. **Painel** é a página autenticada real, com o detalhe aberto pela ação da lista.
4. O clique é **duplo no mesmo quadro** (`botao.click(); botao.click();`) — a regra que o plano põe antes de tudo
   no início da batalha.

Antes do clique, o teste cobra o que a espera tem de dizer: o aluno lê **"Aguarde o professor iniciar"** e não tem
missão na tela; o telão anuncia **"Todos estão prontos"** com os dois nomes no placar; o painel diz **"Pronta para
começar"**, **2 de 2** lugares e aponta **o botão `start`** como o primário (`data-proximo`).

Depois do clique: uma rodada aberta no banco (a segunda não nasce), a faixa passa a **"Missão 1 de 1"** com
**"Acompanhar os envios"** e **nenhum** botão primário (com a turma escrevendo, a ação é esperar — é o mesmo
desenho da frente da faixa de estado), o telão mostra **`MISSAO 01/01`** com cronômetro numérico e **"0 de 2
prompts recebidos"**, e os dois alunos recebem o formulário.

Uma decisão registrada: a sala do teste é do preset **Personalizado**, e ali o produto chama o clique de
**"Iniciar missão"** (o rótulo "Iniciar batalha" é do preset Clássico). O teste afirma o rótulo **do produto**, não
uma frase escrita no teste — trocar o texto do botão reprova o portão.

## 3. Prova de que o portão morde

`tmp/qa/mutacoes-inicio.mjs` quebra **uma superfície por vez**; cada rodada restaurou o `arena.js` com `diff`
idêntico ao de antes.

| Mutante | O que ele quebra | Como o portão reprova |
|---|---|---|
| `parede-fica-no-lobby` | o telão ignora a rodada e continua no lobby | espera de `.arena-tv-round-badge` estoura |
| `aluno-nao-recebe-a-missao` | a tela do aluno não recebe a missão | espera do campo do prompt estoura |
| `painel-nao-vira-a-missao` | a faixa continua prometendo o início com a rodada aberta | `"e qual é a ação do professor agora"` — esperava `Acompanhar os envios` |
| `sem-ponteiro-de-acao` | a faixa aponta o botão, mas sem o peso de primário | `"e é o botão de iniciar que carrega o peso de primário"` — esperava `start` |

## 4. Medições do fluxo (produto real, navegador de verdade)

`tmp/qa/captura-inicio-batalha.mjs`, 9 prints em `evidencias/`:

| Marco | Medida |
|---|---|
| Abrir sala → **telão em outra aba** | **616 ms** |
| Clique de iniciar → painel | **65 ms** |
| Clique de iniciar → telão | **89 ms** |
| Clique de iniciar → alunos | **100 ms** |
| Rodadas abertas depois do clique duplo | **1** (de 1 criada) |

A dispersão entre a primeira e a última superfície no mesmo clique é de **35 ms** — as três entram na mesma versão,
não "uma depois da outra". A faixa, lida por extenso no estado de jogo:

```
Estado: Em jogo · Missão 1 de 1 | Alunos: 2 de 2 | Envios: 0 de 2 | Próxima ação: Acompanhar os envios
```

Prints: `00-entrada-do-aluno`, `01-painel-sala-fechada`, `02-telao-lobby-vazio`, `03-telao-turma-completa`,
`04-aluno-aguardando`, `05-painel-pronta-para-comecar`, `06-painel-missao-no-ar`, `07-telao-missao-cronometro`,
`08-aluno-missao-aberta` (+ `medidas.json`).

## 5. Portões

| Portão | Antes | Agora |
|---|---|---|
| `npm test` | 540 (539 passam, 1 pulado, 0 falhas) | **540 (539 passam, 1 pulado, 0 falhas)** |
| `npm run test:browser` | 37 | **38/38** |

Nenhum arquivo de produto mudou nesta frente (só teste e documentação), então **nenhum cartório foi regravado** —
e os dois portões verdes confirmam isso por si: `cascata`, `contraste`, `render` e `copia` continuam medindo o
mesmo conteúdo.

## 6. A jornada humanizada (o que passa e o que não fecha)

Roteiro do professor contra o **produto na porta 3000** (`BASE=http://127.0.0.1:3000 node tmp/qa/jornada-professor.mjs`):

- **Passam hoje (steps 01–09)**, com o fluxo de sala desta frente no meio: login, desafio com upload, missão sem
  gabarito criada de propósito, sala montada pelo seletor, **recusa ao abrir** com a pendência listada, "Corrigir"
  abrindo o campo que falta (foco em `reference_text`) e a pendência zerando. Prints em `evidencias/jornada/`.
- **Não fecha (step 12)**: a foto da tela de tempos morre em `Page.captureScreenshot timed out` — **300 s**, mesmo
  com `protocolTimeout` de 300 s. Isso **não é o produto travado**, e a diferença foi medida, não suposta
  (`tmp/qa/sonda-travamento-painel.mjs`, na mesma tela e no mesmo diálogo): `evaluate` responde em **12–68 ms**,
  `rAF` anda, **zero tarefas longas**, **zero animação infinita**, e **a foto sai bem** quando o mesmo estado é
  alcançado por outro caminho. É o instrumento de captura em headless, e fica registrado como limitação no
  `.freebuff/run.md` — os steps 10–25 do roteiro do plano continuam **não testados por este caminho**.

## 7. Pendências desta frente

1. **Roteiro 10–25 da jornada** (tempos, prévias, TV real, aluno no celular, rodada, juiz, encerramento, relatório)
   segue sem execução completa desde 19/09 — o bloqueio é o instrumento da foto.
2. **Dados de teste no banco do checkout**: as rodadas de hoje contra a porta 3000 criaram salas `QA JORNADA *` e
   `QA SONDA TRAVAMENTO *`. São dados de teste identificados, como o plano exige; nenhuma sala de aula real foi
   tocada.
3. O telão **continua sem estado de "sala aberta e pronta" no topo além da linha de espera** (`Todos estão
   prontos`) — atende ao plano, mas a linha vive dentro do bloco do lobby; se a parede ganhar faixa de estado
   própria, é ali que ela entra.

## 8. Arquivos

- `test/browser/inicio-da-batalha.test.mjs` (novo, o portão)
- `tmp/qa/mutacoes-inicio.mjs` (mutações), `tmp/qa/captura-inicio-batalha.mjs` (prints), `tmp/qa/sonda-travamento-painel.mjs` (diagnóstico)
- `tmp/qa/jornada-professor.mjs` (cronômetro por foto + `protocolTimeout` para o diagnóstico)
- `.freebuff/run.md` (duas limitações de instrumento registradas)
