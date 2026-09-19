# Imagens das aulas visuais (Aula 4 e Aula 5)

As 4 aulas do catálogo (`src/domain/arena-lessons.mjs`) já funcionam de ponta a ponta:
adicionar Aula 2 + 3 + 4 + 5 numa sala Personalizado coloca **19 rodadas** (4 + 4 + 4 + 7).
O que falta — e é só isso — são as **imagens de referência** das 5 missões `reversa`:

| Aula | Missão | Título no catálogo |
| --- | --- | --- |
| Aula 4 | 1 | `Reversa: cartaz publicitario` |
| Aula 4 | 2 | `Reversa: fotografia` |
| Aula 4 | 3 | `Reversa: infografico` |
| Aula 4 | 4 | `Reversa: interface de app` |
| Aula 5 | M5 | `M5 Reversa: anuncio` |

## Como o juiz avalia uma imagem que você sobe

Isso importa antes de gerar as artes, porque decide **quanto texto você precisa escrever**.

- **Sala Clássico / Turma** (`judgeKind: classic`): o juiz **nunca olha a imagem**. Ele compara
  o texto do aluno com o prompt-original que você configura. Imagem = só o que o aluno vê.
- **Sala Personalizado** (`judgeKind: criteria`): o juiz pontua por critérios + missão, contexto,
  resultado esperado e gabarito em texto. A imagem **não** entra no prompt do modelo, e isso não
  é configurável — é projeto.

Motivo: a imagem de referência é **uma só por missão**, mas o juiz é chamado **uma vez por
submissão**. Mandar a mesma imagem em cada chamada significaria pagar a mesma arte dezenas de
vezes por missão (alunos × tentativas) sem mudar a nota. Medido com uma imagem real de 35 KB:
a chamada cai de 36.761 para 1.499 bytes por submissão. O aluno, aliás, nunca envia imagem —
só texto.

Consequência prática: **preencha sempre o campo "Gabarito do juiz (texto de referência)"** —
nas missões de imagem, com o prompt que gerou a imagem, que é exatamente o que a base do evento
fazia (`base_prompt`). É esse texto que sustenta a nota. Sem ele, o aluno é avaliado apenas
contra as palavras da missão — e uma resposta vazia de conteúdo pode pontuar alto por acidente.

### O gabarito é só do juiz (o aluno nunca o vê)

O campo de referência é a **régua do juiz** e não entra na tela do aluno em nenhuma modalidade:
o servidor monta a missão do jogador sem esse campo (`missionView`, em `src/server/arena-api.mjs`).
Antes, o texto era mostrado como "MATERIAL DE REFERÊNCIA" nas missões que não eram `reversa` —
ou seja, a resposta impressa na tela de quem deveria escrevê-la.

Quem confere o gabarito é você: **detalhe da sala** (card de cada missão) e, na
**prévia** (`/aluno-preview.php?room=…`), no botão **👁 Ver gabarito (só você vê)**. A prévia
mostra exatamente o que o aluno recebe; o gabarito fica atrás desse botão.

### A prévia tem três estados

Na barra da prévia, **Missão · Depois de responder · Fim da sala**:

- **Missão** — a missão aberta, como o aluno a recebe (e onde o aviso de pendência aparece);
- **Depois de responder** — a mesma missão no estado *rodada encerrada*: nota, barras por critério,
  feedback e evolução, com o acumulado das missões anteriores na lateral;
- **Fim da sala** — *"Batalha encerrada!"*, resultado por missão, classificação final (o pódio,
  com medalhas e campeão) e destaques.

Os dois últimos dependem de pontuação que uma sala em rascunho ainda não tem: nesse caso a prévia
usa **números de exemplo** e a barra mostra o selo âmbar *"NÚMEROS DE EXEMPLO — esta sala ainda não
respondeu"*. Assim que a sala tiver qualquer resposta de verdade, tudo passa a vir dela
(o selo vira verde, com o nome do aluno cujo ponto de vista está sendo mostrado). Revisar não
escreve nada: nenhuma submissão, nota ou participante é criado.

### E a prévia da projeção (TV)

No detalhe da sala, **📺 Ver na TV** abre `/tv-preview.php?room=…`: a **mesma tela da TV da turma**
(`renderTV`), com quatro estados na barra do topo — **Espera · Rodada · Resultado · Fim / Campeão** —,
o botão **↻ Atualizar** (relê a sala, para acompanhar a aula sem fechar a tela) e o atalho
**⛶ Abrir a TV de verdade**, que cria a sessão de projeção de 8h e abre `/tv.php` numa aba.

O estado **Fim / Campeão** é a classificação final com o painel de campeão. Cada estado diz o que
ali é real ou de exemplo (selo verde ou âmbar com o motivo: *"nenhuma missão está aberta"*,
*"ninguém entrou na sala ainda"*, *"a sala ainda não tem respostas"*). O PIN e o QR de entrada são
sempre os reais — é o mesmo QR que a turma vai escanear. A prévia **não** abre sessão de projeção,
não entra no lugar da TV e não avança a sala.

### Tempo da sala: quanto a aula vai durar

O tempo de cada missão vem do campo **Tempo** do desafio (vazio = sem cronômetro) e agora aparece
nos dois lugares onde a decisão é tomada:

- **detalhe da sala** — um chip ao lado do status soma os cronômetros (*"⏱ 3 min 30 s de aula ·
  1 missão sem cronômetro"*) e cada card de missão mostra o seu (`⏱ 2:00` ou `⏱ sem cronômetro`,
  em cinza tracejado);
- **prévia** — a barra repete o total, a meta da missão aberta diz `tempo 2:00` ou
  `sem cronômetro`, e na navegação numerada as missões **sem cronômetro ficam tracejadas** (com a
  legenda *"tracejado = sem cronômetro (você encerra a rodada)"*).

Missão sem cronômetro não expira sozinha: ela só termina quando você clicar em **Encerrar rodada** —
por isso o número de missões sem cronômetro importa mais que o total. O mesmo total aparece na
projeção, que mostra **"Sem limite de tempo"** em vez de um relógio zerado.

#### Tempo sugerido: aceitar ou ajustar

O chip do tempo **é um botão** ("⏱ 2 min de aula · 2 missões sem cronômetro · *ajustar*"): ele
abre **Tempo das missões**, com uma linha por missão e o campo em `mm:ss` (
`2:00`, `2:30`… vazio deixa a missão sem cronômetro). Cada linha sem tempo mostra a **sugestão** e o
botão **usar sugestão**; **Aceitar as sugestões das N missões sem cronômetro** preenche de uma vez
**só o que está em branco** (o que você já digitou não é sobrescrito). O total embaixo acompanha o
que você digita — *"Se salvar assim: 8 min de aula · 2 missões sem cronômetro"* — e um campo fora
da faixa trava o envio em vez de gravar metade.

A regra da sugestão vive em `src/domain/mission-timing.mjs` e é curta de propósito, para você
conseguir prever o número: a **modalidade** dá a base (Prompt Essencial 60 s, Precisão e
Refinamento 120 s, Contexto e Briefing 150 s, Reversa e Prompt Completo 180 s, Boss 240 s) e o
**tamanho** do que o aluno lê ajusta em passos de 15 s (−15 s em missão de uma linha, +15/+30/+45 s
em briefing longo). O resultado é arredondado em 15 s e fica entre 30 s e 5 min. O painel diz de onde
veio o número (*"missão curta (5 palavras)"*).

Dois avisos honestos antes de aceitar:

- o tempo pertence ao **desafio**, não à sala: se o mesmo desafio é usado em outra turma, a linha
  avisa (*"⚠ Este desafio é usado em 1 outra sala — o tempo novo vale lá também"*).
- o ajuste só é aceito **antes de abrir** a sala (e nunca no Clássico, cujas 3 rodadas têm tempo
  fixo): no meio da aula o tempo de uma missão em jogo não muda por baixo dos alunos.

## Como colocar em produção (fluxo verificado)

1. **Banco de Desafios → Novo desafio**, uma vez por missão, com os campos abaixo.
   O formulário já aceita upload de arquivo PNG/JPG/WebP (~1,5 MB) ou URL.
2. Concluir com **Salvar desafio** (o desafio fica no banco e pode ser reusado depois).
3. Criar uma sala **Personalizado**: ela já abre com o **seletor de missões**, onde você marca
   os desafios da aula na ordem — a sala nasce com eles. (Também dá para criar a sala vazia e
   usar **Adicionar missão**, que agora mostra a prévia do desafio antes de confirmar.)
   A quantidade de rodadas é exatamente a quantidade que você marcar.
4. Conferir a lista **Missões** no detalhe da sala: cada card mostra **a imagem que o aluno vai
   ver**, a missão e o **gabarito do juiz**.   Card em amarelo ("SEM GABARITO") avisa que aquele
   desafio pontua só pela missão. A ordem (↑ ↓) e **Remover da sala** ficam no próprio card.
   O chip de tempo no topo do detalhe fecha a conta da aula antes de abrir a sala.
5. Publicar. Pronto: o aluno abre a missão e vê a imagem ("REFERÊNCIA VISUAL").

Para repetir a mesma sequência em outra turma, os desafios continuam no banco — basta criar
uma sala nova e adicionar as mesmas rodadas. (O Clássico mantém as 3 rodadas oficiais
travadas de propósito; para montar a sua própria sequência use Personalizado.)

## A sala não abre com missão incompleta

O servidor recusa abrir (e iniciar) uma sala quando alguma missão ainda não pode ser mostrada
ao aluno. A regra é uma só, em `src/domain/room-readiness.mjs`:

- **sem gabarito** — nenhum dos textos que o juiz compara (`reference_text`, `expected_result`
  ou, no juiz clássico, o `reference_prompt` do pacote-base) está preenchido;
- **sem imagem** — só para missão visual: engenharia reversa (`reversa`), categoria de imagem
  ou o juiz clássico, que compara a resposta com a imagem. Missão de texto não precisa de imagem.

O painel mostra isso antes de você tentar: chip vermelho na lista de salas, botão “Abrir sala”
em âmbar, banner no detalhe e a marca `⚠ sem imagem` / `⚠ sem gabarito` em cada missão. Ao
clicar em abrir, o diálogo lista **uma por uma** o que falta. Para destravar: preencha o gabarito
no desafio (Banco de Desafios → Editar), suba a imagem que falta, ou use **Remover da sala** na
missão que não vai ser usada.

É por isso que as 5 missões reversa da Aula 4/Aula 5 precisam das imagens **antes** de a sala
abrir: sem referência visual o aluno não tem o que descrever.

## Prompts de geração das 5 imagens

Gere cada uma em qualquer IA de imagem e suba no desafio correspondente. Os campos
"Material de referência" e "Resultado esperado" são o gabarito da nota — mantidos
coerentes com o que a imagem mostra.

---

### Aula 4 · Reversa: cartaz publicitário

**Prompt de geração**

```
Cartaz publicitário de um festival de música eletrônica, composição vertical 3:4.
Tipografia grande e ousada ocupando o terço superior com o nome do festival, e a
data em destaque no rodapé. Paleta neon (ciano, magenta, amarelo) sobre fundo
escuro quase preto, com um letreiro luminoso ao fundo e silhuetas de público.
Estilo gráfico impresso, alto contraste, sem marca d'água.
```

| Campo do desafio | Valor |
| --- | --- |
| Título | `Reversa: cartaz publicitario` |
| Modalidade | Reversa |
| Categoria | Imagem |
| Missão | `Observe a imagem e escreva o prompt que a recriaria, chegando o mais perto possível do texto de referência.` |
| Contexto | `Peça publicitária de um festival de música; descreva enquadramento, tipografia, paleta e atmosfera.` |
| Resultado esperado | `Prompt que cite peça vertical, tipografia grande, data em destaque, paleta neon sobre fundo escuro e clima de festival.` |
| Gabarito do juiz (texto) | `Cartaz vertical de festival de música eletrônica, tipografia grande no topo, data em destaque no rodapé, paleta neon ciano/magenta/amarelo sobre fundo escuro, letreiro luminoso e silhuetas de público ao fundo.` |

---

### Aula 4 · Reversa: fotografia

**Prompt de geração**

```
Retrato fotográfico em plano médio de uma pessoa jovem, luz lateral suave
vinda da esquerda, fundo urbano noturno desfocado com pontos de luz bokeh,
tons quentes (âmbar e laranja), atmosfera cinematográfica, profundidade de
campo curta, grão sutil de filme, sem texto e sem marca d'água.
```

| Campo do desafio | Valor |
| --- | --- |
| Título | `Reversa: fotografia` |
| Modalidade | Reversa |
| Categoria | Imagem |
| Missão | `Observe a imagem e escreva o prompt que a recriaria, chegando o mais perto possível do texto de referência.` |
| Contexto | `Retrato fotográfico; identifique enquadramento, direção da luz, fundo, paleta e atmosfera.` |
| Resultado esperado | `Prompt que cite retrato em plano médio, luz lateral suave, fundo urbano noturno desfocado, tons quentes e clima cinematográfico.` |
| Gabarito do juiz (texto) | `Fotografia de retrato em plano médio, luz lateral suave vinda da esquerda, fundo urbano noturno desfocado com bokeh, tons quentes âmbar, profundidade de campo curta e atmosfera cinematográfica.` |

---

### Aula 4 · Reversa: infográfico

**Prompt de geração**

```
Infográfico educativo em orientação vertical sobre energia solar, organizado
em 5 seções numeradas de 1 a 5, cada uma com um ícone simples de linha (sol,
placa solar, bateria, casa, economia). Paleta amarelo e azul sobre fundo
branco, títulos curtos e legíveis, muito espaço em branco, estilo limpo para
público escolar. Sem marca d'água.
```

| Campo do desafio | Valor |
| --- | --- |
| Título | `Reversa: infografico` |
| Modalidade | Reversa |
| Categoria | Imagem |
| Missão | `Observe a imagem e escreva o prompt que a recriaria, chegando o mais perto possível do texto de referência.` |
| Contexto | `Infográfico educativo; traduza a referência em instruções visuais e de conteúdo.` |
| Resultado esperado | `Prompt que cite infográfico vertical sobre energia solar, 5 seções numeradas, ícones simples, paleta amarelo e azul e público escolar.` |
| Gabarito do juiz (texto) | `Infográfico educativo vertical sobre energia solar com 5 seções numeradas, ícones simples de linha, paleta amarelo e azul sobre fundo branco, títulos curtos e layout limpo para alunos do 6º ano.` |

---

### Aula 4 · Reversa: interface de app

**Prompt de geração**

```
Mockup de tela de aplicativo de estudos, formato de celular, interface clara.
Cabeçalho com saudação e nome do usuário, abaixo uma barra de progresso da
semana, depois uma grade de cartões de disciplinas (3 colunas) com ícones, e
um botão flutuante circular de "nova tarefa" no canto inferior direito.
Paleta azul e branco, tipografia legível, estilo flat moderno, sem marca d'água.
```

| Campo do desafio | Valor |
| --- | --- |
| Título | `Reversa: interface de app` |
| Modalidade | Reversa |
| Categoria | Imagem |
| Missão | `Observe a imagem e escreva o prompt que a recriaria, chegando o mais perto possível do texto de referência.` |
| Contexto | `Interface de aplicativo; descreva a estrutura da tela em instruções precisas.` |
| Resultado esperado | `Prompt que cite mockup de celular, cabeçalho com saudação, barra de progresso semanal, grade de disciplinas em cartões e botão flutuante de nova tarefa.` |
| Gabarito do juiz (texto) | `Mockup de tela de app de estudos em formato de celular: cabeçalho com saudação, barra de progresso da semana, grade de cartões de disciplinas em 3 colunas e botão flutuante circular de nova tarefa, paleta azul e branco, estilo flat.` |

---

### Aula 5 · M5 Reversa: anúncio

**Prompt de geração**

```
Anúncio para redes sociais em formato quadrado de uma cafeteria: uma xícara de
café com latte art bem no centro, vapor sutil, fundo quente desfocado com grãos
e madeira, luz dourada lateral, e um texto curto de chamada em destaque no
rodapé. Estilo publicitário apetitoso, sem marca d'água.
```

| Campo do desafio | Valor |
| --- | --- |
| Título | `M5 Reversa: anuncio` |
| Modalidade | Reversa |
| Categoria | Imagem |
| Missão | `Observe a imagem e escreva o prompt que a recriaria, chegando o mais perto possível do texto de referência.` |
| Contexto | `Anúncio de redes sociais; descreva produto, enquadramento, fundo, luz e texto.` |
| Resultado esperado | `Prompt que cite anúncio quadrado de cafeteria, produto central, fundo quente desfocado e texto curto em destaque.` |
| Gabarito do juiz (texto) | `Anúncio quadrado de cafeteria para redes sociais: xícara de café com latte art ao centro e vapor sutil, fundo quente desfocado com grãos e madeira, luz dourada lateral e texto curto de chamada no rodapé.` |

---

## Se preferir versionar as imagens no repositório

Coloque os arquivos em `public/assets/figma/` (ex.: `aula4-cartaz-festival.png`) e, em vez
de subir arquivo no formulário, cole a URL no campo **"Ou URL da imagem"**:
`/public/assets/figma/aula4-cartaz-festival.png`. Assim a imagem viaja com o deploy e não
depende do banco.
