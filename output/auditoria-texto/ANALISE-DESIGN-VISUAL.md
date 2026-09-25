# Análise de design visual — Live Arena

## Veredito

O projeto tem uma boa base de marca: o azul comunica confiança e ação, o verde/teal dá energia, o símbolo é reconhecível e a projeção escura funciona bem em sala. O problema central é de direção, não de acabamento: a interface tenta ser ao mesmo tempo landing page, jogo, painel administrativo, material didático e relatório. Cada parte tem bons componentes, mas juntas criam uma sensação de produto que fala demais.

Minha leitura visual é: **o produto está bem-intencionado, mas ainda parece uma coleção de telas projetadas por componentes, e não um sistema com uma hierarquia única**.

## O que está funcionando

- Marca simples e legível, com boa lembrança visual.
- Azul forte usado para ações importantes.
- TV escura com contraste alto, adequada para projeção.
- Estados do jogo são visíveis: Juiz, corações, energia, rodada e ranking.
- Formulários têm estrutura clara de label acima do campo.
- A visualização do aluno tem uma linguagem mais próxima de produto real do que de site institucional.

## Os problemas que mais afetam a percepção de qualidade

### 1. Abertura com linguagem de campanha, não de entrada

O portal usa selo, título, parágrafo, instrução, quatro benefícios e botão. A composição é centralizada e simétrica, com muito conteúdo pequeno ao redor da ação. Em um produto de uso recorrente, isso parece uma apresentação promocional permanente.

O título “Descubra o PROMPT” é forte o suficiente para carregar a entrada. O resto compete com ele. A tela precisa parecer um portal de acesso rápido, não um anúncio.

### 2. Excesso de pílulas, selos e micro-rótulos

Há pílulas para estado, modalidade, prévia, cronômetro, ranking, conexão, exemplo, código e categorias. Cada uma é defensável isoladamente; em conjunto, todas têm o mesmo peso visual. Isso tira valor dos estados realmente importantes.

Regra recomendada: pílula apenas para estado ou categoria que muda uma decisão. Título e texto curto devem cuidar do resto.

### 3. Cartões demais com a mesma forma

O painel usa muitos retângulos claros, bordas suaves, sombras leves e botões arredondados. A consistência é boa, mas a repetição cria uma “parede de cartões”. O olhar não sabe qual bloco é principal.

Use três níveis visuais: superfície principal, agrupamento sem cartão e detalhe recolhido. Nem toda seção precisa de contorno próprio.

### 4. O painel do professor não tem um foco operacional claro

No topo aparecem código, QR, participantes, status, início, prévias, edição, bloqueio, adicionar missão e exclusão. Abaixo vêm sorteio, indicadores, participantes e missões. Parece um cockpit completo, mas as ações não estão ordenadas pela sequência real da aula.

A hierarquia deveria ser: estado atual → próxima ação → informação para acompanhar → ferramentas secundárias. Hoje muitas dessas camadas aparecem simultaneamente.

### 5. Formulários longos parecem páginas inteiras dentro de diálogos

“Novo desafio”, “Tempo das missões” e “Nova sala Arena” têm boa organização interna, mas o volume excede o conforto de um diálogo. O usuário precisa ler e rolar dentro de uma janela sobre outra tela, com o pano de fundo ainda cheio de informação.

O caminho atual é aceitável para uma ferramenta interna, mas não parece leve nem atual. Grupos opcionais devem nascer recolhidos; campos ligados à modalidade devem aparecer progressivamente.

### 6. O aluno recebe informação futura cedo demais

Durante a missão aparecem resultados, classificação e destaques vazios. Isso transforma a tela de execução em uma página de relatório. O aluno precisa escrever; o produto continua mostrando o que ainda não pode ser usado.

Esse é um problema de composição e de timing, mais do que de texto.

### 7. A prévia do aluno tem duas interfaces empilhadas

No celular, a barra de prévia do professor fica acima da tela que está sendo avaliada. Isso é útil para teste, mas visualmente parece uma tela quebrada ou uma página dentro de outra. O conteúdo real começa tarde demais.

A prévia precisa parecer um modo de inspeção: barra compacta e fixa, ou controle recolhido; abaixo dela, a tela do aluno deve começar imediatamente.

### 8. O relatório é competente, mas visualmente indiscriminado

A grade de métricas, gráficos, tabelas e estados vazios usa o mesmo peso visual. O relatório parece amplo, porém não orienta qual descoberta fazer primeiro. No celular, a rolagem vira uma sequência longa de caixas.

O relatório precisa de uma leitura executiva curta e de uma segunda camada analítica. Hoje as duas estão abertas ao mesmo tempo.

### 9. TV e aluno têm linguagens diferentes demais

A TV é escura, teatral e esportiva. O aluno é claro, editorial e administrativo. A diferença é compreensível, mas falta um elo forte: mesma tipografia de destaque, mesmos nomes de estados e mesma gramática de informação.

A TV pode continuar escura; a conexão deve vir de componentes compartilhados, não de tornar todas as telas escuras.

### 10. Emojis funcionam no jogo, mas estão espalhados demais

Na TV, corações e troféus têm função cênica. No painel e em formulários, emojis aparecem junto de ações e rótulos onde ícones simples seriam mais consistentes. Isso aumenta a sensação de mistura entre protótipo lúdico e ferramenta de gestão.

Preservar emojis no placar e nos momentos de celebração. Reduzir nos controles administrativos.

## Avaliação tela por tela

| Tela | Sensação atual | Nota | Direção |
|---|---|---:|---|
| Portal | Apresentação promocional carregada | 5/10 | Entrada direta, um foco |
| Entrada do aluno | Clara, um pouco rotulada demais | 7/10 | Simplificar cabeçalho |
| Espera do aluno | Simpática, mas com mensagem duplicada | 7/10 | Uma orientação principal |
| Missão do aluno | Boa base, excesso abaixo do formulário | 7/10 | Foco na tarefa |
| Avaliação do aluno | Rica, mas longa no celular | 7/10 | Nota primeiro, detalhes sob demanda |
| Votação | Boa estrutura, espera competindo com a pergunta | 6/10 | Um estado por vez |
| Final do aluno | Visualmente forte, texto de confirmação redundante | 8/10 | Ranking como protagonista |
| Login professor | Limpo, com explicação técnica indevida | 8/10 | Remover detalhe de configuração |
| Painel vazio | Estrutura consistente, muitas seções simultâneas | 7/10 | Priorizar a próxima tarefa |
| Painel populado | Completo, mas com hierarquia baixa | 5/10 | Resumo + detalhes recolhidos |
| Detalhe da sala | Cockpit útil, visualmente sobrecarregado | 5/10 | Sequência operacional |
| Novo desafio | Campos claros, diálogo alto e denso | 6/10 | Grupos e progressão |
| Nova sala Arena | Configuração aparece inteira de uma vez | 6/10 | Resumo e opções avançadas |
| Tempo das missões | Repetição forte por missão | 5/10 | Linhas compactas |
| Prévia do aluno | Conteúdo real começa tarde | 6/10 | Barra de inspeção compacta |
| TV espera | Boa presença e contraste | 8/10 | Preservar |
| TV rodada | Foco correto em missão e tempo | 8/10 | Preservar |
| TV resultado/final | Dramática e legível, alguns títulos repetem intenção | 8/10 | Pequeno refinamento |
| Projeção | Funcional, texto técnico demais ao redor do QR | 7/10 | Código/QR primeiro |
| Relatório desktop | Rico, mas sem camada executiva | 6/10 | Resumo antes da análise |
| Relatório celular | Longo e baseado em rolagem | 5/10 | Agrupar e recolher |

## Direção visual recomendada

### Sistema de foco

Cada tela deve ter uma pergunta dominante:

- Portal: “Como entro?”
- Aluno: “O que faço agora?”
- Professor: “Qual é a próxima ação da aula?”
- TV: “O que a turma precisa ver neste momento?”
- Relatório: “Qual conclusão devo tirar?”

Tudo que não responde à pergunta deve ser secundário, recolhido ou removido daquele estado.

### Tipografia

Manter a sans-serif atual e a boa diferença entre títulos e texto, mas reduzir a quantidade de estilos concorrentes. O produto usa muitos títulos, labels em caixa alta, selos e textos pequenos. A sensação atual melhora mais removendo níveis tipográficos do que aumentando tamanhos.

Recomendação: título principal, título de seção, texto de apoio e metadado. O label minúsculo em caixa alta deve ficar reservado para estado de jogo, não para cada bloco.

### Cor

A paleta azul/teal é adequada. O problema é a quantidade de acentos simultâneos: azul, teal, verde, amarelo, vermelho e emojis. Manter azul como ação, verde como estado positivo, vermelho apenas para destruição/erro e amarelo apenas para atenção/energia. O restante deve ser neutro.

### Forma e profundidade

Manter botões em pílula se isso é parte da marca, mas reduzir a quantidade de cartões arredondados. Use separadores, espaço e agrupamentos simples para criar ritmo. Sombras devem marcar ação ou camada, não decorar cada bloco.

### Espaçamento

O portal possui espaço, mas o espaço é preenchido com texto. O painel possui muita informação, mas nem sempre possui um agrupamento claro. O ajuste não é simplesmente “mais espaço”: é mais espaço onde há decisão e menos bordas onde há apenas continuidade.

## Plano de implantação visual

1. Corrigir o portal e remover a lógica de landing page permanente.
2. Corrigir estados do aluno para mostrar uma tarefa por vez.
3. Reorganizar detalhe da sala pela sequência da aula.
4. Transformar missões, participantes e configurações em resumos expansíveis.
5. Enxugar formulários e mover opções avançadas para grupos recolhidos.
6. Reduzir a barra de prévia e dar protagonismo à tela simulada.
7. Dar ao relatório uma camada executiva antes dos dados completos.
8. Fazer refinamento final de pílulas, labels, emojis, sombras e estados vazios.

## Critério de qualidade

O produto deve parecer uma arena de aprendizagem com um bom painel de controle, e não um painel administrativo tentando contar tudo em todas as telas. O visual ideal mantém a energia do jogo, mas dá silêncio suficiente para que cada pessoa saiba onde olhar.

## Evidências visuais

As capturas usadas nesta análise estão em `output/auditoria-texto/`, incluindo portal, aluno, professor, TV, prévias, formulários e relatório. A captura `34-tv-votacao.png` foi marcada como estado inconsistente durante a coleta e não deve ser usada para validar a votação da TV.
