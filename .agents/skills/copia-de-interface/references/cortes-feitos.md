# Cortes feitos — corpus de calibração

O corte de set/2026 é a melhor referência de voz que este produto tem: cada linha
abaixo é uma decisão real, com as palavras contadas pelo **mesmo** critério do
inventário (`palavras()` em `test/support/copia.mjs` — só token com 2+ caracteres
alfanuméricos, então `0` e `—` não contam).

Leia isto antes de propor substituição, e não copie as frases: copie o **critério**.
Número estimado a olho envelhece mal; os daqui foram medidos.

## O que saiu, com substituto

45 pares de 645 → 243 palavras (**−402, −62%**). Os dois maiores são o parágrafo do
gabarito (41 → 8) e o do "Faltando para abrir a sala" (43 → 9) — ambos explicavam um
controle que, depois do corte, o próprio rótulo explica.

| Onde | Antes | Depois | − |
|---|---|---|---|
| Sorteio (mata-mata) | Como no futebol: quem vence fica no jogo e só volta a jogar contra outros vencedores; quem perde sai. | Só quem vence continua no sorteio. | 11 |
| Preset clássico | A batalha original: 3 lugares fixos, 3 rounds de 60s com o juiz clássico. O início é sempre do professor. | 3 lugares fixos, juiz clássico. | 10 |
| Preset turma | Batalha clássica para a turma inteira: juiz original, 3 rounds de 60s, início pelo professor. Defina o total de participantes antes de abrir. | O clássico para a turma inteira. | 16 |
| Preset personalizado | Sala de missões de Engenharia de Prompt: você escolhe os desafios do banco e as regras de cada um. | Você escolhe os desafios e as regras. | 12 |
| Preset arena | Todos escrevem, 3 vão à Arena e a turma inteira ataca o Juiz IA em desafios coletivos. Ninguém fica só assistindo. | A turma inteira ataca o Juiz IA. | 11 |
| Faltando para abrir a sala | Cada Corrigir abre o desafio sem sair daqui, direto no campo que falta: o gabarito do juiz (nas missões de imagem, o prompt que gerou a imagem) ou a imagem. Depois de salvar, a sala libera sozinha — ou use Remover da sala na missão que não vai ser usada. | Corrigir abre o desafio aqui mesmo, no campo que falta. | 34 |
| Gabarito do juiz (formulário) | Este é o gabarito: é com ele que o juiz compara a resposta do aluno, e ele nunca aparece na tela do aluno (nem na prévia, que mostra só o que ele recebe). A imagem também não é enviada ao modelo — sem este texto o juiz só tem a missão para julgar. | O juiz compara a resposta do aluno com este texto. | 33 |
| Tempo das missões | Quanto tempo cada missão leva nesta sala. Missão sem cronômetro só termina quando você clicar em Encerrar rodada — a sugestão ao lado vem da modalidade e do tamanho do que o aluno lê. Nada é aplicado sozinho: aceite, ajuste ou deixe em branco. | Missão sem cronômetro só termina quando você clicar em Encerrar rodada. | 28 |
| Pendências da sala | nesta sala. Preencha o que falta e salve de uma vez — o que ficar em branco continua como está. Os gabaritos daqui são só do juiz: nenhum deles aparece na tela do aluno. | nesta sala. Preencha o que falta e salve de uma vez. | 21 |
| Config da partida (nova sala) | Todos escrevem, 3 vão à Arena e a turma ataca o Juiz em desafios coletivos. Os valores abaixo já são os recomendados — dá para mudar depois, no detalhe da sala. | Os valores abaixo são os recomendados; dá para mudar depois. | 15 |
| Config do modo Arena | Mudar rodadas, corações ou ataques só vale numa partida nova — a vida conquistada pela turma não é reescrita no meio da aula. | Mudanças só valem numa partida nova. | 14 |
| Missões da sala (nova sala) | Marque os desafios desta sala. Cada missão mostra aqui a imagem que o aluno recebe e o gabarito que o juiz usa. Ordem e remoção podem ser ajustadas depois, no detalhe da sala. | Marque os desafios desta sala, na ordem em que os alunos vão ver. | 14 |
| Dica das aulas | Conjuntos prontos de desafios por aula. Adicione direto à sala aberta ou apenas ao banco de desafios. | Conjuntos prontos de desafios por aula. | 10 |
| Aplicar prompt colado | O prompt que você colou ainda não foi aplicado — use um dos botões de aplicar acima. | O prompt colado ainda não foi aplicado. | 9 |
| Atualizar a prévia (title) | Reler a sala agora (a turma pode ter jogado desde que você abriu) | Reler a sala agora | 8 |
| Wild Card | Leia os três prompts (sem saber de quem são) e escolha o que merece entrar em campo. | Escolha o prompt que merece entrar em campo. | 8 |
| Gabarito em branco | Nenhum gabarito em branco: ajuste o que quiser no campo de cada missão. | Nenhum gabarito em branco. | 8 |
| Legenda das missões | Missões desta sala — na ordem em que os alunos vão ver | Missões desta sala | 8 |
| Próximo passo do sorteio | Próximo passo: encerre a missão quando a turma terminar de escrever — aí o sorteio abre. | Encerre a missão para abrir o sorteio. | 7 |
| Prévia do aluno | Prévia: é exatamente isto que o aluno recebe. O campo de resposta não envia nada. | Prévia do aluno: nada é enviado. | 7 |
| Gabarito em branco (opção) | Nenhum gabarito em branco nessa opção — use o campo de cada missão para ajustar. | Nenhum gabarito em branco nessa opção. | 7 |
| Linhas esgotadas | Acabaram as linhas antes das missões — cole mais prompts ou preencha o resto à mão. | Acabaram as linhas antes das missões. | 7 |
| Linha por missão | , uma linha para cada — confira se a ordem bate com as missões. | , uma linha para cada. | 7 |
| Mesmo prompt | com o mesmo prompt — ajuste o que for diferente antes de salvar. | com o mesmo prompt. | 7 |
| Projeção (QR) | Aponte a câmera para o QR code e a projeção abre no aparelho. Sem câmera? Abra o endereço e digite o código acima. | Aponte a câmera para o QR code — ou abra o endereço e digite o código. | 6 |
| Faixa de prévia (aluno) | Nada disto está no ar — a sala continua fechada para os alunos. | Nada disto está no ar. | 6 |
| Rodapé do tempo | Nenhuma missão desta sala tem cronômetro: todas terminam quando você encerrar a rodada. | Nenhuma missão desta sala tem cronômetro. | 6 |
| Sem missão marcada | Nenhuma missão marcada: a sala nasce vazia e você adiciona depois. | Nenhuma missão marcada. | 6 |
| Código da sala | Os alunos entram com esse código ou lendo o QR code. | Alunos entram com este código. | 5 |
| Sessão de projeção | Sua sessão de projeção expirou. Digite o código de projeção novamente (exibido no Painel do professor). | Sua sessão de projeção expirou. Digite o código de projeção novamente. | 5 |
| Sem internet | Estamos tentando reconectar com o servidor. Aguarde alguns instantes. | Reconectando com o servidor… | 5 |
| Formato de tempo | Use mm:ss (ex.: 2:00) ou segundos — entre 15 s e 1 h; vazio deixa a missão sem cronômetro. | Use mm:ss (ex.: 2:00) ou segundos, de 15 s a 1 h. | 5 |
| Rodapé do painel | Salas ao vivo, banco de desafios e controle pedagógico | Operação ao vivo | 5 |
| Cabeçalho do relatório | Métricas, ranking e respostas das batalhas. Exporte em CSV ou imprima. | Métricas, ranking e respostas das batalhas. | 5 |
| Espera (clássico) | O professor inicia quando a sala estiver pronta. Fique de olho na tela! | O professor inicia quando a sala estiver pronta. | 5 |
| Espera (arena) | O professor vai iniciar uma missão. Fique de olho na tela! | O professor vai iniciar uma missão. | 5 |
| Recomeçar a partida (title) | Zera a partida: Juiz cheio, energia zero e ninguém competiu. | Recomeçar do zero | 5 |
| Rótulo de campo | Missao (o que o aluno deve produzir) | Missão | 4 |
| Imagem que o aluno vê | Imagem que o aluno vê (arquivo, ~1,5 MB) | Imagem que o aluno vê | 3 |
| Dica da imagem | Seja preciso e estratégico: a imagem veio de um prompt real. | A imagem veio de um prompt real. | 3 |
| Batalha encerrada | O grande momento chegou! Confira a classificação final dos campeões. | Confira a classificação final dos campeões. | 3 |
| Editar sala | Bloquear entrada de novos participantes | Bloquear novas entradas | 2 |
| Kicker do relatório | Professor · Analytics pedagógico | Professor | 2 |
| Contexto (rótulo) | Contexto (situacao) | Contexto | 1 |

## O que saiu sem substituto

| Onde | O que era | Por que não precisava |
|---|---|---|
| Sorteio (`DRAW_MODE_OPTIONS`) | Sorteia da turma inteira. Quem venceu continua no sorteio e pode ser sorteado de novo. | O botão já diz **todos concorrem sempre**; a pista visível vem do servidor e encurtou junto |
| Detalhe da sala | `title="Abrir a sala como o aluno vê, missão por missão"` | O botão se chama **👁 Ver como o aluno** |
| Detalhe da sala | `title="Ver o que a TV projeta para a turma: espera, rodada, resultado e classificação final"` | O botão se chama **📺 Ver na TV** |
| Cartões de métrica do relatório | Salas iniciadas · Media das notas · Maior similaridade · Ate enviar resposta · Heartbeat recente | Cada uma repetia o rótulo da linha de cima ("Acerto medio", "Tempo medio", "PCs ativos") |
| Tempo das missões | "Nada é aplicado sozinho." | A frase existia para tranquilizar sobre um botão que se chama **Aceitar as sugestões** |

## O que NÃO foi cortado, e por quê

| Onde | Texto | Motivo |
|---|---|---|
| Fim da missão | A conexão falhou e nada foi gravado. Os tempos que você digitou continuam aqui — clique em salvar de novo. | **Fato**: o que não foi gravado e o que sobrou na tela. Erro não perdeu o direito de ser longo quando a pessoa ficou sem saber o que aconteceu |
| Modo Arena | Recomeçar a partida? O Juiz volta cheio, a energia zera e ninguém competiu. | Confirmação destrutiva: nomeia a consequência |
| Voto | Voto registrado. Pode trocar até o professor fechar. | Estado + janela de reversibilidade |
| Sorteio | Escolha de 2 a 10 pessoas por sorteio. | Limite, não decoração |
| Salvamento de tempo | Se salvar assim: 1 h 30 min de aula. | Consequência calculada |
| Missões do aluno | Sua missão: transforme esse pedido em um prompt realmente utilizável… | A tela do aluno está em **0,61×** do site base (177 contra 290): cortar ali é cortar o que o aluno lê com o cronômetro correndo |
| Botão de envio (aluno) | Ctrl + Enter para enviar · Ctrl + Enter ↵ | **Réplica pendente**: a mesma instrução em dois lugares da mesma tela. Tirar exige encostar em CSS sob a guarda de classes — dívida registrada, não esquecida |

## Números da frente (retrato de 2026-09-15)

Medido pelo inventário; **não** são meta, são calibração.

| Superfície | Depois | Antes | Site base |
|---|---|---|---|
| cliente (família) | 1.608 | 2.055 | 836 |
| — `arena.js` | 1.366 | 1.796 | — |
| — `app.js` | 242 | 259 | — |
| painel do professor | 72 | 89 | 31 |
| relatório | 107 | 114 | 0 (tela nova) |
| entrada do aluno | 148 | 177 | 290 |
| portal | 49 | 57 | 38 |
| painel (login) | 26 | 36 | 31 |
| projeção / prévia da TV | 21 | 21 | 15 |
| página não encontrada | 3 | 3 | — |

Perfil do cliente depois do corte: `arena.js` **669 palavras de frase em 86 trechos** e
**697 de rótulo em 175 trechos**; `app.js` 46 de frase (9 trechos) e 196 de rótulo
(90 trechos). Ou seja: o que resta acima do site base é, na maior parte, nome de campo,
botão e coluna — não prosa. Foi por isso que a frente parou onde parou, e é por isso
que o teto de cada superfície foi baixado para o medido (regravar o cartório aperta a
régua, nunca afrouxa).

## A fila da varredura, tela por tela (2026-09-15)

Segunda passada, agora sobre a **varredura** (`node scripts/varredura-copia.mjs`) em
vez do inventário: das 22 frases candidatas das 9 telas, o corte saiu em quatro.

| Tela | Antes | Depois | O que saiu, e por quê |
|---|---|---|---|
| portal | 57 | **49** | O parágrafo de 18 → 8: saiu o triple "observação, estratégia e linguagem" (não opera nada) e "desafio de inteligência artificial" (repetia o kicker duas linhas acima) |
| entrada / prévia do aluno | 177 | **148** | Espera alinhada ao cliente (`Fique de olho na tela!` era o resto de um corte); kicker que repetia os rótulos → "O código vem do professor."; botão `Entrar na batalha` → `Entrar` (ecoava o `h1`); placeholder que repetia o rótulo; dica de três imperativos; estado vazio alinhado aos irmãos |
| painel (login) | 36 | **26** | O parágrafo explicava as funções do painel **antes** de entrar, com pill, `h1`, rótulo e placeholder já dizendo o mesmo — virou o fato útil: onde a senha mora |
| painel do professor | 74 | **72** | "Conjuntos prontos de desafios por aula" repetia o `h2` "Progressão das aulas" |

O que **não** foi cortado e ficou declarado: os 8 chips do portal (fora do mandato — é
a faixa de valor, e cortá-los muda o desenho da banda), o kicker
`DESAFIO DE ENGENHARIA DE PROMPT` (parou de repetir quando o parágrafo enxugou),
`A projeção abre pelo Painel do professor…` (instrução da TV sem sessão),
`Escreva o prompt que produziria algo com estas características` (sem ela o aluno não
sabe o que produzir diante de uma imagem), `Métricas, ranking e respostas das
batalhas` (nomeia os três blocos do relatório) e a reconexão (estado, não decoração).

Duas lições de mecânica, porque valem para o próximo corte: **não dá para remover
elemento** — a cascata vigia o seletor e a guarda de classes exige produtor para
cada classe, então `<p class="round-writing-hint">` ficou vazio em vez de sumir (e a
única regra dele é `margin-bottom: 18px`: era espaçador, não texto); e **o corte de
texto não move o portão de estilo**, porque geometria está fora do retrato de
propósito — os dois portões passaram sem regravação.

## O texto que vem por API (medido em 2026-09-15, depois do corte)

Esta é a cópia que **não** passa pelo bundle: o cliente só interpola, e a frase
visível é do servidor. Foi por isso que o corte de set/2026 encurtou o `DRAW_MODE_HINTS`
no servidor junto com o resto — o daqui é o número que o corte do cliente não alcança,
e que a família `api` da guarda passou a defender.

| Campo | Palavras | Frases | Onde aparece |
|---|---|---|---|
| `sorteio.mode_hint` | 12 | 2 | pista embaixo dos botões de sorteio |
| `sorteio.cannot_reason` | 36 | 4 | motivo escrito quando o sorteio trava |
| `dinamica.label` | 19 | 8 | rótulo do botão de desafio coletivo |
| `dinamica.question` | 46 | 8 | pergunta do desafio, no cartão |
| `dinamica.teach` | 67 | 8 | `title` do botão de desafio (texto de apoio) |
| `poder.label` | 8 | 4 | rótulo do botão de energia |
| `poder.hint` | 34 | 4 | `title` do botão de energia |

**222 palavras em 7 campos.** As 8 dinâmicas são as de `ARENA_DYNAMICS`: se alguém
citar um número diferente, mediu de outro lugar.

Para calibrar o que é frase longa nesse lado: as 2 pistas de sorteio têm 6 palavras
cada ("Só quem vence continua no sorteio."), as 8 de `question` ficam em 5,8 na média
(máximo 7) e os motivos de bloqueio em até 10, enquanto um `teach` de apoio fica em
8,4 na média e chega a 10 ("Antecipar o olhar do Juiz é o mesmo raciocínio de escrever
para ele."). `teach` é o campo onde a tentação de explicar aparece primeiro, e onde o
teto por campo — 67 — é a régua.

## A duplicação de estado (2026-09-15, fase 1 da carga de leitura)

O corte mais rentável desta frente não foi encurtar frase — foi tirar a SEGUNDA
frase do mesmo estado. O sintoma que o professor relatou ("tem texto demais") quase
nunca é uma frase longa: é a mesma coisa dita em três lugares, cada uma curta.

| Onde | Antes | Depois | − |
|---|---|---|---|
| Abertura (portal) | kicker + título + parágrafo + CTA + dica + 4 blocos de características, com `arena` ×3, `prompt` ×3, `desafio` ×2 e `entrar` ×2 entre as 49 palavras | marca + título + CTA (10 palavras) | 39 |
| Espera do aluno | "Aguardando a próxima missão" + "O professor vai iniciar uma missão." (e a variante clássica escrita em outro ponto do cliente) | "Aguarde o professor iniciar" | 6 |
| Encerramento do aluno | "Confira a classificação final dos campeões abaixo." — a classificação está logo abaixo | — | 6 |
| Missão do aluno | "01 / O desafio" e "02 / Sua resposta" | — (o título da missão e o rótulo do campo já nomeiam; `aria-labelledby` foi movido para eles) | 5 |
| Botão de envio | "Ctrl + Enter para enviar" numa linha própria + "Ctrl + Enter ↵" no botão | só o do botão (que já sumia no celular) | 5 |
| Login do professor | selo "Área do Professor" + "Acesso Administrativo" + a explicação do `.env` | "Entrar no painel" + botão "Entrar" | 10 |
| Entrada do aluno | selo "Entrada do jogador" sobre "Entrar na batalha" | só o título | 3 |

Três lições que valem mais que as frases:

1. **Estado não se explica duas vezes.** Título + linha de apoio repetindo a mesma
   espera é o padrão mais comum do produto. Fica a mensagem principal; a linha de
   apoio só sobrevive se acrescentar fato (o que fazer agora, quanto falta).
2. **Rótulo de seção que compete com o título não é hierarquia, é ruído.** "01 / O
   desafio" acima de "Cartaz da feira" não informa nada que o título e a posição na
   tela já não digam. Quando o rótulo sai, a âncora de acessibilidade vai para o
   elemento que dá nome à seção — não se deixa seção sem nome acessível.
3. **Estado vazio é cópia.** "Ainda sem resultados." não é interface neutra: é uma
   frase escrita para o aluno ler antes de ter o que ler. Cartão vazio não se
   preenche com texto melhor; ele não aparece até ter dado.

O portal ficou em **10 palavras contra as 38 do site base** — a primeira tela a
ficar abaixo dele. Não é meta de tamanho: é que a abertura só precisa dizer quem é,
qual é a promessa e o que fazer agora.

## A dobra: quando o texto é curto e ainda assim pesa (2026-09-15, fase 2)

Nem todo excesso de leitura se resolve cortando. Quando o conteúdo **precisa**
existir — os critérios que explicam a nota, o resultado de cada missão, os destaques
—, o que se corta é a **obrigação de ler agora**, não o texto. A ferramenta é o
`<details>`/`<summary>` nativo: abre no clique, no toque e no teclado, e o produto
já usava esse padrão no `Histórico` do sorteio e na `⚙ Configuração da partida`.

| Onde | Antes | Depois | Custo de cópia |
|---|---|---|---|
| Avaliação do aluno | nota + critérios + feedback + evolução + próximo passo, todos na mesma leitura | nota, feedback, evolução e próximo passo na frente; critérios atrás de "Ver critérios" | +2 palavras de alça |
| Encerramento do aluno | resultado por missão e destaques abertos junto da classificação | classificação aberta; resultado por missão e destaques fechados, e o título do cartão é a alça | 0 (o `h2` que já existia virou a alça) |

Três regras que este corte ensina:

1. **A alça é texto de interface, e conta.** "Ver critérios" são 2 palavras no
   orçamento — baratas, mas não de graça. Se o título que já existe pode ser a alça
   (o caso dos cartões do encerramento), use-o: rótulo novo só quando não há um.
2. **Dobra é estado, não estilo.** "Resultados" e "Destaques" ficam **abertos**
   durante a partida e **fechados** no encerramento: o mesmo cartão, aberto quando é
   curto e é o assunto, fechado quando a leitura principal é outra. Fechar sempre
   seria esconder conteúdo a um clique de distância sem motivo.
3. **Não se desenha o marcador.** O triângulo do navegador já é o affordance e o
   `summary` já responde ao teclado. O que a folha precisa é de `cursor: pointer` e
   da tipografia — nada de ícone próprio, nada de `aria-expanded` à mão.

O que **não** vira dobra: mensagem de erro, estado de espera, o que o aluno está
lendo enquanto escreve. Dobra serve para o que se consulta; esconder o que se lê
agora é o mesmo defeito, ao contrário.

E uma correção de régua que veio junto: o instrumento contava **seletor como
prosa** — `'.arena-side [data-arena-fold]'` tem duas palavras e nenhum caractere de
código, então entrava na conta e inflava o `arena.js` em 10 palavras (e a captura do
site base em 4). Sob pressão de orçamento, isso empurraria alguém a cortar cópia de
verdade para pagar por uma consulta de DOM. A régua nova: frase de tela não começa
em `.`, `#` ou `[` — e há controle positivo no teste para as duas metades.

## A tela do professor: resumo na frente, ferramenta atrás da alça (2026-09-15, fase 3)

Aqui não faltava corte de frase — o painel do professor já estava em 68 palavras e a
varredura não achava nele nenhuma frase candidata. O que pesava era **ordem de
leitura**: o professor abria a sala e atravessava ferramenta administrativa, lista
completa de participantes e gabarito de cada missão antes de chegar na ação do dia.

| Onde | Antes | Depois |
|---|---|---|
| Ações da sala | editar, bloquear, pausar, encerrar rodada, encerrar sala, arquivar, excluir — tudo na mesma fileira | **pausar/retomar, encerrar rodada, fechar resultados e encerrar sala na fileira**; editar, bloquear, arquivar e excluir em "Gerenciar sala" |
| Missão | enunciado, gabarito e resultado esperado abertos no cartão | situação, `MISSÃO n — modalidade`, título, cronômetro e pendência na frente; "O aluno recebe" e "Gabarito do juiz" em dobras por missão |
| Participantes | tabela completa no meio da página | dobra com a contagem no cabeçalho; **aberta enquanto a sala não começou**, fechada em jogo |
| Aulas | quatro selos iguais ("Engenharia Reversa" ×4) e a lista de missões solta | "4 missões de Engenharia Reversa" como alça da lista; "Desafios prontos por aula" saiu |

Quatro regras que esta fase ensina:

1. **A ação do momento não entra na dobra.** "Gerenciar sala" guarda o que se usa de
   vez em quando (editar, bloquear, arquivar, excluir). Pausar com a rodada correndo
   é o clique que o professor procura **agora**: atrás de uma alça, custa dois.
   A régua é o estado, não a raridade: a mesma ação pode ser dobra em um estado e
   fileira em outro.
2. **Resumo substitui repetição — se ele informa.** Quatro selos dizendo
   "Engenharia Reversa" viram um resumo que diz **quantos**: o número é a
   informação que se perdeu na repetição. "Resumo curto" não é sinônimo de "menos
   texto": é a mesma informação em uma linha.
3. **Dobra precisa de memória.** O painel se redesenha a cada poll (2,5 s). Sem
   guardar a escolha e reaplicá-la no desenho seguinte, a dobra abre e fecha
   sozinha — e o professor desiste de usar. `data-fold-key` + um mapa é o mínimo.
4. **A dobra que falha silenciosamente custa caro.** Um erro de escopo (o mapa
   criado no estado de outra página) fazia o desenho do painel lançar exceção a cada
   poll; o erro era capturado e virava `alert()`, que **bloqueia a página**. O
   sintoma visível foi três testes de fluxo do portão 2 estourando 180 s em vez de
   ~4 s. Lição: `alert()` em `catch` transforma defeito de código em "teste lento".

O que **não** virou dobra na tela do professor: o aviso de gabarito ausente (impede o
uso), a pendência por missão, o cronômetro, a contagem de participantes, e os
controles do sorteio/Modo Arena — esses já eram recolhíveis por decisão própria.

## O formulário longo e a barra da prévia: agrupar, resumir, e deixar o que trava à vista (2026-09-15, fase 4)

Três superfícies em que o problema não era frase comprida: era **tudo pedindo leitura
ao mesmo tempo**. Nenhuma delas cabia em "cortar palavra" — o texto cortado teria de
voltar, porque cada frase nomeava um campo que existe.

| Onde | Antes | Depois |
|---|---|---|
| Formulário do desafio | 14 blocos soltos, 1475px, critérios sempre abertos (351px) | 2 grupos ("O aluno recebe", "O juiz avalia") + 4 dobras com resumo, **836px** |
| Critérios e pesos | legenda fixa no meio do formulário | alça `Critérios e pesos — 2 critérios · 100%` |
| Adicionar missão | enunciado + gabarito inteiros na prévia (317px) | resumo (imagem, título, modalidade, tempo, o que falta) + 2 alças, **141px** |
| Tempo das missões | formato repetido em cada linha, enunciado aberto | formato explicado uma vez no topo, linha com `⏱ 2:00` / `sem cronômetro` + sugestão, enunciado e motivo sob alça |
| Barra da prévia (celular) | 364px = 43% da primeira tela | **289px = 34%**, com o conteúdo do aluno começando 75px mais alto |

Cinco regras que esta fase ensina:

1. **Grupo obrigatório não é dobra.** O plano diz "não esconder erro nem campo
   obrigatório pendente dentro de grupo fechado". A forma barata de cumprir isso é
   não fazer do grupo obrigatório uma dobra: `<details>` fechado com `required`
   dentro **trava o envio em silêncio** (o navegador não consegue focar o campo
   escondido). Ficaram abertos `fieldset` + `legend` para o que é o trabalho, e
   dobra só para o opcional. "Abrir a dobra no erro" é a segunda linha de defesa —
   usada onde o grupo tem de ser recolhível (os critérios, que não são `required`).
2. **A alça pode ser a frase que já existia.** Na barra da prévia, o aviso "Nada
   disto está no ar." virou a própria alça da preparação: o aviso não some e o
   custo de cópia é zero. Vale procurar a frase que **já precisa estar ali** antes
   de escrever um rótulo novo ("Ver detalhes", "Mais opções").
3. **O que trava fica à vista; o que confirma pode esperar.** Na prévia, "⚠ sem
   gabarito" (impede a sala de abrir) continua na barra; "✓ pronta para ir ao ar"
   foi para a alça. A régua não é o tamanho da frase, é se ela muda a decisão de
   quem lê.
4. **Resumo é a mesma informação em menos linhas — e com um número que se perdeu.**
   `4 missões de Engenharia Reversa` (fase 3) e `1× · 2:00 · Influencia alta` (fase
   4): a repetição some, o dado fica. Resumo que não informa é enfeite.
5. **Recolher não pode apagar.** Os campos continuam no formulário quando a dobra
   fecha — o teste do portão 2 lê `expected_result` dentro da dobra fechada e
   confirma que o valor está lá. Se o recolhido for campo de texto, o valor só pode
   viver no DOM (não em `innerHTML` recriado).

O que **não** virou dobra: o campo da imagem quando a modalidade é visual (o `open`
vem da modalidade, e a troca de modalidade abre — nunca esconde valor), o aviso de
formato do tempo no topo, o que impede a sala de abrir, e a ação do momento
("Aceitar as sugestões", "Salvar"). Também não virou dobra: o diretório de cada
bloco, que é o que permite ao teste afirmar **quantas** dobras e com que resumo
existem.

Duas observações de instrumento, porque custaram tempo:

- **O texto de um `<details>` fechado continua no `textContent` e some do
  `innerText`.** A régua para "o que o usuário lê" é `innerText`; a régua para
  "o que existe no documento" é `textContent`. E o conteúdo fechado **mantém caixa**
  (`offsetParent` não é nulo) no Chromium: medir visibilidade por `offsetParent`
  mente — o que não é pintado continua tendo geometria.
- **O portão de estilo não cobre diálogo.** `test/css/render.json` fotografa as 10
  telas no estado base; formulário de desafio, ajuste de tempo e prévia aberta por
  `?room=` ficam fora. Quem os mede é a sonda (`tmp/qa/probe-etapa4.mjs`), com o
  mesmo fixture, as mesmas dimensões e prints antes/depois.

## O relatório: resumo primeiro, consulta sob demanda, e um vazio só (2026-09-15, fase 5)

O relatório era 12 cartões, 6 gráficos e 5 tabelas abertos em série (2884px em
1440×900; 4295px no celular), e no período sem dados **sete** cartões repetindo o
mesmo aviso. A pergunta que resolveu a tela não foi "como encurtar" — foi **o que
precisa estar à vista sem clique**: quatro indicadores e o ranking. O resto abre
pelo título que já existia.

| Onde | Antes | Depois |
|---|---|---|
| Indicadores à vista | 12 | **4** + `Mais indicadores (8)` |
| Rolagem (1440 / 390) | 2884px / 4295px | **1491px / 2300px** |
| Palavras visíveis na tela (1440) | 475 | **111** |
| Período vazio | 7 avisos "sem dados" | **1** estado, com instrução |
| Impressão | 12 painéis | 13 painéis, **dobras abertas no papel** |

Cinco regras que esta fase acrescenta às quatro anteriores:

1. **A alça pode ser o título que já existe — inclusive o de um cartão.** Aqui o
   `summary` é o próprio `.panel-title`: nenhum rótulo novo, custo de cópia zero, e
   o professor continua encontrando a seção pelo nome que ela sempre teve. Antes de
   escrever "Ver detalhes", veja se o título já não faz esse trabalho.
2. **Título em linha flex perde o marcador do navegador.** O affordance nativo do
   `summary` só existe em `list-item`; com `display:flex` (título + legenda na
   mesma linha) ele não é desenhado. Ou seja: quando a alça é um cabeçalho
   existente, o caret tem de ser desenhado — e isso é decisão de interface, não
   detalhe.
3. **UM estado vazio para o período inteiro; o vazio de UMA seção continua sendo
   dela.** Esconder as outras seções quando só uma está vazia mentiria sobre o que
   existe. A condição é "nenhuma linha em lugar nenhum", e ela tem de ser medida
   por contador — séries que preenchem o eixo vazio (as 24 horas de `by_hour`)
   fazem uma lista vazia parecer cheia.
4. **O papel não tem clique: abra as dobras no `beforeprint`.** Imprimir é uma
   feature declarada do relatório; um `<details>` fechado imprime fechado. Abrir em
   `beforeprint` e restaurar em `afterprint` cobre botão e Ctrl+P de uma vez.
5. **O que é escondido continua no DOM.** O estado vazio esconde os blocos, não os
   destrói: é o caminho de reserva da exportação e é o que faz o filtro voltar a
   mostrar dado. A prova é do navegador, não do código: filtrar para um período
   vazio, esconder, e voltar.

O que **não** virou dobra: o resumo do período (é a resposta), o ranking (é a
pergunta) e os filtros. E o que não foi cortado de jeito nenhum: os enunciados, as
colunas exportadas e as fórmulas — o corte desta fase é de *apresentação*, e a
cópia da tela desceu 4 palavras só porque duas legendas repetiam o próprio dado
(a legenda do canvas e o rótulo das linhas da comparação).

## Repetição de título não é prosa: a alça substitui a `legend`, e o resultado da TV tem UM título (2026-09-15, fase 6)

Duas telas em que o excesso não eram parágrafos, eram **títulos dizendo a mesma
coisa em camadas**. É o caso mais fácil de passar batido: cada linha, sozinha, é
curta e está no lugar certo.

| Onde | Antes | Depois |
|---|---|---|
| Nova sala, ajustes do Arena | `fieldset` + `legend` **"Arena — Turma vs. Juiz"** (a mesma frase da opção já escolhida) + aviso de 2 linhas, sempre aberto | dobra com o valor na alça: `Partida — 3 rodadas · Juiz 5 ♥ · dano a partir de 60% · 2 ataques` |
| Nova sala, rótulo do campo | `Preset` | `Modo de jogo` |
| TV, resultado da rodada | selo `RODADA 01` + `h1` "Resultado da rodada 1" + linha "Rodada 1 — Cartaz da feira" | `h1` "Resultado da rodada 1" + linha **"Cartaz da feira"** |
| TV, fim | selo `CLASSIFICAÇÃO FINAL` + `h1` "Batalha encerrada!" + `Campeão da batalha` | `h1` "Batalha encerrada!" + `Campeão da batalha` |

Medido: o formulário do Arena 798 → **695px**, 67 → **53** palavras visíveis, e
"Arena — Turma vs. Juiz" de 2 → **1** ocorrência; o cabeçalho da TV 9 → **6**
palavras na rodada e 9 → **7** no fim. Regras que esta fase acrescenta:

1. **Quando a seção repete a escolha do próprio campo, a alça resolve as duas
   coisas.** `legend` = rótulo da opção selecionada é repetição pura: o seletor já
   disse. A alça tira a repetição **e** põe o valor ali — é o único lugar da tela
   onde o resumo substitui dois textos em vez de acrescentar um.
2. **O resumo da dobra de configuração sai dos CAMPOS, e cai no recomendado quando
   o campo está vazio.** Escrever esse resumo à mão mente na primeira edição; e o
   recomendado não é chute: é o valor que o servidor aplica ao receber o campo
   vazio, então o resumo não promete à sala o que ela não vai fazer.
3. **Recolher só é seguro porque o campo continua no formulário.** A prova não é a
tela — é criar (ou salvar) com a dobra fechada e **ler de volta do servidor**: no
fixture da fase 6, Rodadas = 5 com a dobra fechada criou a sala com
`arenaRounds: 5`. Asserção sobre DOM escondido prova que o campo existe, não que o
valor chegou.
4. **UM título principal por estado — e o selo fica só onde carrega o que o título
   não diz.** `CLASSIFICAÇÃO FINAL` acima de "Batalha encerrada!" era a mesma frase
duas vezes; na rodada em andamento o selo (`MISSAO 01/03`) continua vivo, porque ali
ele dá o número. Na dúvida, pergunte qual das camadas o leitor perderia se ela
sumisse — se a resposta é "nenhuma", ela é a repetição.
5. **A linha de apoio deve carregar informação NOVA.** "Rodada 1 — Cartaz da feira"
   atrás de um `h1` "Resultado da rodada 1" gastava metade da linha repetindo o
   título; o nome da missão, sozinho, é o que o professor não sabia. Linha de apoio
   que repete parte do título é o mesmo defeito do selo, em outro lugar.

O que **não** foi cortado: o `h1` "Batalha encerrada!" (é o momento da aula — o
mesmo texto que a tela do aluno usa nesse estado), o cartão do campeão (é quem
venceu) e os quatro ajustes do Arena (são configuração de partida, não enfeite). A
cópia `arena.js` desceu 5 palavras nesta fase, e a frase que a dobra usa no lugar do
aviso antigo é rótulo com valor, não prosa: por isso ela não aparece como candidata
em `node scripts/varredura-copia.mjs`.

As regras 1, 3 e 4 não ficaram só escritas: viraram asserção do portão 2. O teste
da nova sala abre o diálogo, conta as ocorrências da frase (tem de ser 1), confere
que a dobra começa fechada com o valor no resumo, muda o campo, **fecha a dobra**,
cria a sala e lê `settings.arenaRounds` de volta do servidor. O da TV exige
`seloTv` vazio no resultado da rodada e no fim, e presente na rodada em andamento —
é a única forma de a regra "o selo fica só onde carrega o número" não virar
folclore.

## O endereço que aparecia duas vezes, e a única subida de teto (2026-09-16, plano visual)

No diálogo de projeção, a mesma URL aparecia **duas vezes**: como texto dentro da
instrução ("ou abra `…/tv.php`") e como rótulo embaixo do QR code. Duas regras desta
skill resolvem o caso sem inventar nada:

1. **Eco do próprio artefato.** O rótulo do QR já é o endereço; repeti-lo na
   instrução é a mesma frase duas vezes. O endereço fica no rótulo, e a instrução
   passa a apontar para ele ("abra o endereço").
2. **O fallback não pode custar prosa.** A primeira tentativa foi escrever uma
   frase nova para quando o QR falha ("Abra `<endereço>` no aparelho da TV e digite
   o código acima.") — **+10 palavras** no cliente, e a régua pegou antes do commit.
   A versão que ficou não tem frase nova: quando o QR falha, o endereço volta **no
   mesmo lugar** em que o rótulo estava. Zero palavra, mesma informação.

O verbo da instrução também encolheu sem perder o fato: "Aponte a câmera para o QR
code" → "Escaneie o QR code". O saldo da fase no cliente foi **-1 palavra** (`arena.js`
1326 → 1325, com o teto descendo junto) — cortar o eco pagou o resto.

**A única subida de teto desta fase foi deliberada e não é copy de tela:** a página
não encontrada deixou de ser texto puro (sem marca, sem fundo, sem caminho de volta)
e passou a usar a casca do portal com "Voltar ao início": **3 → 11 palavras**, teto
regravado em `test/copia/orcamento.json`. Ela nunca teve equivalente no site base, e o
que entrou é o acabamento que o plano visual pede — não texto novo para preencher
espaço.
