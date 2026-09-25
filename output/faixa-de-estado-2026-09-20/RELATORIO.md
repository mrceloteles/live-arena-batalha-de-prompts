# Faixa de estado do painel do professor — 20/09/2026

Plano incremental do Live Arena, **Fase 3 (simplificar o painel do professor)**.
Objetivo da frente: o professor não precisar interpretar quatro cartões para
saber o que fazer no minuto seguinte — e existir **uma única ação primária** por
estado.

Nada de regra de batalha, API, SSE, autenticação, ranking, aluno ou TV foi
alterado. As fases 6 (nova batalha) e 7 (pausar/retomar) do plano já existiam
neste checkout e seguem intactas; a fase 2 (lobby e telão) já estava pronta
(PIN, QR, nomes, estados), com exceção do que o relatório anterior já registrou.

---

## 1. O que estava errado, medido

O painel tinha, para a mesma sala:

- o **selo de estado** no cabeçalho (`Em jogo`);
- uma **linha de números** solta (`3 participantes · 3 conectados · Rodada 1 de 2 · ⏱ ajustar`);
- a **missão no ar** dentro do cockpit (`MISSÃO 1 — Precisão`, cronômetro);
- os envios **só** como texto de cada linha da tabela de participantes (`✅ enviou` / `⏳ escrevendo`);
- as pendências do juiz **só** no bloco de espera;
- e, na linha de ações, **pausar + encerrar rodada + ver na TV + encerrar sala + nova batalha** com o mesmo peso visual — com **duas** pílulas azuis quando a rodada estava aberta (o botão de iniciar e o link "Ver na TV").

Quem dava aula tinha de cruzar quatro regiões da tela para responder "em que pé
está a sala" e "o que eu faço agora".

## 2. O que a faixa passou a dizer

Uma linha, no topo do detalhe, com as cinco perguntas na ordem em que são feitas:

```
ESTADO   Em jogo · Missão 1 de 1
ALUNOS   3 de 3 · 0 online
ENVIOS   2 de 3
AVALIAÇÕES  2 pendentes
PRÓXIMA AÇÃO  Acompanhar os envios        ← pílula, e o botão que a executa fica azul
```

- **Estado** é vivo: `Aguardando participantes`, `Em jogo · Missão 1 de 1`,
  `Em jogo · Pausada`, `Em jogo · Missão 1 · resultados no ar`,
  `Em jogo · Entre rodadas`, `Encerrada`.
- **Alunos** diz lugares e conectados (o `· 0 online` só aparece quando a conta
  difere — dado que o professor usa para decidir se espera).
- **Envios** e **Avaliações** só entram quando existem (sem missão no ar não há
  placar de envios; sem pendência não há célula de avaliações).
- **Próxima ação** é a única célula com peso próprio, e o botão que a executa
  carrega a **mesma frase** (`data-proximo` na família primária do CSS).

### A ação da vez, estado por estado

| Estado | Ação da vez | Botão marcado |
|---|---|---|
| Sala que não abre (missão sem gabarito/imagem) | Corrigir as missões | `fix-all` (o CTA do bloco de bloqueios) |
| Missão pausada | Retomar missão | `resume-round` |
| Missão aberta, turma ainda escrevendo | Acompanhar os envios | **nenhum** |
| Missão aberta, todos enviaram | Encerrar rodada | `end-round` |
| Resultados na tela | Fechar resultados | `close-round` |
| Esperando/abrindo, com missão pendente | Iniciar batalha / Iniciar missão | `start` (o botão grande do cockpit) |
| Entre rodadas | Iniciar missão | `start` |
| Batalha encerrada | Nova batalha nesta sala | `new-battle` |
| Sala que espera a turma completa | — (a faixa cala) | **nenhum** |

**Esperar não é ação.** Com a turma escrevendo, a faixa diz o que está
acontecendo e o placar de envios — e não marca botão nenhum. Inventar um
controle ali ("pular", "forçar") seria criar um controle que ninguém pediu.

**A faixa não aponta o que não pode ser executado.** Achado desta frente, na
tela: na sala **Clássica** que ainda espera o terceiro lugar, o botão grande de
iniciar está `disabled` (o preset trava o cadastro nos lugares da sala) e a
faixa prometia `PRÓXIMA AÇÃO Iniciar batalha`. Agora, nesse estado, a faixa cala
e quem diz o que falta são a célula de estado (`Aguardando participantes`) e a
contagem (`2 de 3`), com o botão desabilitado logo abaixo. Foi o único defeito
encontrado **olhando a tela**, não pelo teste — e virou asserção.

## 3. Uma fonte para a frase que aparece duas vezes

`ROTULOS_DA_BATALHA` (em `arena.js`) guarda **uma vez** cada rótulo que a faixa
repete do botão: `Encerrar rodada`, `Fechar resultados`, `Retomar missão`,
`Nova batalha nesta sala` (este último também é o título do diálogo). Em
literais separados seriam 9 palavras a mais no orçamento de cópia — e, pior, a
faixa poderia dizer uma frase e o botão outra. O portão compara as duas.

## 4. Arquivos

| Arquivo | O que mudou |
|---|---|
| `public/assets/js/arena.js` | `ROTULOS_DA_BATALHA`, `acaoDaVez(...)`, a faixa de estado no lugar da linha de números, `data-proximo` nos botões da ação da vez, `is-primary` fora do link "Ver na TV" |
| `public/assets/css/refinement.css` | bloco `.arena-state-bar` / `.arena-state-cell` (+ `[data-proximo]` na família primária); **4 regras mortas removidas** (`.arena-detail-meta` ×3, `.arena-detail-dot`) |
| `test/browser/painel-estado.test.mjs` | **novo**: 8 estados pelo painel, com o par faixa↔botão conferido em cada um |
| `test/css/cascata.json`, `test/css/contraste.json`, `test/css/render.json` | regravados (diff conferido, abaixo) |
| `test/copia/orcamento.json` | teto com `nota` escrita (abaixo) |

As 4 regras mortas saíram pelo instrumento da casa
(`node scripts/remover-css-morto.mjs --apply arena-detail-meta arena-detail-dot`),
que foi quem apontou: a guarda `test/css/classes-vivas.test.mjs` reprovou os
quatro seletores porque a marcação que os produzia saiu junto com a linha de
números.

## 5. Portões

```
npm test               540 testes · 539 passam · 1 pulado · 0 falhas
npm run test:browser   36/36 (era 35: entrou o teste da faixa)
```

Cartórios regravados — e o diff contra o estado anterior foi conferido item a item
(os JSON anteriores ficaram em `evidencias/cartorios-antes/`):

- **cascata**: 12 seletores = 2 famílias alteradas (`:is(...)` ganhou
  `[data-proximo]`) + 10 seletores novos da faixa. **Nenhuma declaração alterada
  em seletor existente.**
- **contraste**: `escrito 182 → 183` e uma "regra com opacity" — o par de cores
  da pílula (`#eff5ff` + `--la-blue-deep`) e o `opacity: .72` do micro-rótulo.
- **render** (estilo por elemento): **4 de 26 telas** mudaram, e são exatamente
  as duas telas do detalhe em duas larguras (`sala-em-destaque-em-espera` 503 →
  506 elementos; `...-em-jogo` 515 → 517). As outras 22 telas: hash idêntico.
  Nenhuma folha de estilo nova.
- **cópia**: `arena.js` 1581 → **1603 palavras** (300 → 308 trechos),
  teto = medido. As telas não mudaram (o detalhe é desenhado no cliente):
  `painel-do-professor` segue em 73. A `nota` do cartório registra o que entrou
  (cinco micro-rótulos + quatro frases de estado), os três cortes que seguraram a
  conta e o motivo de cada um.

## 6. O que foi medido na tela

Sonda própria (`evidencias/sonda-faixa-estado.mjs`), navegador de verdade, seis
estados × três larguras:

| Estado | células | altura da faixa | rolagem lateral | pílulas primárias na linha de ações |
|---|---|---|---|---|
| 1 espera | Estado, Alunos, Próxima ação | 30 px (1440) · 30 (1280) · 120 (390) | 0 | nenhuma |
| 2 missão no ar | + Envios | 30 · 30 · 90 | 0 | nenhuma |
| 3 metade dos envios | idem | 30 · 60 · 90 | 0 | nenhuma |
| 4 turma inteira enviou | idem | 30 · 60 · 90 | 0 | `end-round` |
| 5 resultados | idem (+ "resultados no ar") | 60 · 60 · 141 | 0 | `close-round` |
| 6 encerrada | Estado, Alunos, Próxima ação | 30 · 30 · 90 | 0 | `new-battle` |

Nenhuma rolagem lateral em nenhuma largura; a faixa **quebra em linhas** em vez
de espremer (30 px = uma linha; o pior caso a 390 px é a barra a cinco linhas no
estado de resultados).

Confirmação no painel real (preview `http://127.0.0.1:3000/`, sala de teste com
missão no ar, medido dentro do navegador):

- **1** elemento primário no corpo do detalhe, e é o botão marcado
  (`data-action=start`, o botão grande do cockpit); **0** na linha de ações;
- estado encerrado: **1** primário — `Nova batalha nesta sala`; "Ver na TV"
  passou a pílula neutra;
- `ENVIOS 2 de 3` com dois envios pendentes do juiz local (`AVALIAÇÕES 2 pendentes`).

18 capturas em `evidencias/faixa__<estado>__<largura>.png`.

## 7. As mutações (o portão morde?)

`evidencias/mutacoes-faixa.mjs` aplica e desfaz cada mutação no fonte do produto:

| Mutação | Reprovação |
|---|---|
| `sem-marca` — ninguém recebe o peso da ação da vez | "a faixa e o botão que ela marcou dizem a mesma frase" |
| `rotulo-por-fora` — a faixa volta a escrever por fora do rótulo compartilhado | "a faixa e o botão que ela marcou dizem a mesma frase" |
| `espera-vira-acao` — com a turma escrevendo, um botão ganha o peso da ação | "nenhum botão recebe o peso da ação enquanto a turma escreve" |
| `promete-o-impossivel` — a sala que espera lugar volta a prometer a partida | "e não promete uma ação que o botão não pode executar" |

Cada rodada restaurou o arquivo (`diff` contra a cópia de segurança, idêntico).

## 8. Limitações e decisões registradas

1. **`AVALIAÇÕES: N pendentes` repete o número** do cabeçalho do bloco de espera
   logo abaixo. É deliberado e é a regra de níveis de informação: a faixa resume
   (o professor lê em um olhar), o bloco explica (quem, qual missão, há quanto
   tempo, se a nota volta sozinha).
2. **A 390 px a faixa chega a cinco linhas** (141 px) no estado de resultados.
   É adaptação controlada, sem corte de texto e sem rolagem; num celular o painel
   não é a tela de aula.
3. **O estado "Acompanhar os envios" não tem botão.** Com a missão aberta e gente
   escrevendo, a linha de ações ainda oferece pausar, encerrar rodada e encerrar
   sala — nenhum é a ação do minuto, e por isso nenhum recebe o azul.
4. **A nota chegando sozinha continua dependendo do juiz.** Nesta sessão o juiz
   local está fora: as pendências apareceram como pendências (e não como zero),
   que é o comportamento correto — mas o caminho "Gemini responde e a célula de
   pendência desaparece" não foi medido aqui.
5. **Dado de teste criado no banco local**: sala
   `QA FAIXA DE ESTADO 04:07 (dado de teste)`, PIN `KNHU75`, 3 alunos, 2 envios,
   missão no ar. Identificada como teste no próprio título; pode ser encerrada e
   arquivada pelo painel.

## 9. Próximo passo do plano

**Fase 4 — acompanhamento individual**: a tabela de participantes hoje diz
`online/ausente` e `enviou/escrevendo`; falta o estado por aluno
(`não enviou · enviado · avaliando · avaliado · desconectado`) e os filtros
(todos / aguardando envio / aguardando avaliação / concluídos / desconectados).
Depois dela, a fase 8 (acabamento) antes do teste humanizado da fase 9.
