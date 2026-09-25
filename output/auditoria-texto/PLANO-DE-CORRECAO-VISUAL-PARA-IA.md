# Plano de correção visual da Live Arena — para implementação por outra IA

Data: 16/09/2026. Escopo: interface e apresentação. Este documento orienta a implementação futura; nenhuma alteração de produto foi feita para produzi-lo.

## 1. Decisão de design revisada

Melhorar a hierarquia, a composição e a consistência visual de uma arena educacional usada por aluno, professor e público de uma projeção. Preservar marca, personalidade lúdica e funcionalidades.

Concordo com o diagnóstico anterior de excesso de elementos competindo por atenção. Entretanto, estas ressalvas prevalecem sobre a análise anterior:

- As notas de 0 a 10 eram impressões subjetivas. Não usá-las como requisitos nem como medida de sucesso.
- A entrada centralizada é adequada para uma ação simples. Preservar essa composição; corrigir os elementos concorrentes e suas proporções.
- TV escura e aluno/painel claros são escolhas coerentes com seus contextos. Unificar componentes e significados, mantendo os temas apropriados a cada superfície.
- Cards, cores e emojis têm função neste produto. Reduzir repetição e inconsistência, sem bani-los por preferência estética.
- Recolher tudo também prejudica o uso. Informação necessária para agir e acompanhar a turma permanece visível.
- As capturas não comprovam acessibilidade, legibilidade à distância ou tendências atuais. Medir contraste e validar a projeção antes de afirmar esses resultados. Não houve pesquisa comparativa de mercado.

O plano usa os prints já produzidos em 15/09/2026. Antes de implementar, confirmar a versão atual no navegador: o projeto pode ter mudado desde as capturas. O plano complementa `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\output\auditoria-texto\PLANO-DE-CORRECAO.md`, que detalha os cortes de texto. Não executar duas reformas independentes na mesma tela. Em caso de conflito, aplicar as ressalvas deste documento.

## 2. Resultado visual desejado

O aluno encontra uma tarefa por momento; o professor vê o estado e os controles da aula; a TV destaca o acontecimento atual; o relatório começa pelos resultados relevantes. Cada superfície mantém uma área principal reconhecível e detalhes acessíveis.

Preservar logo, família tipográfica atual e identidade azul/teal. Refinar proporções, espaços, superfícies, ícones, estados e distribuição das informações. Não migrar framework, instalar um novo kit visual nem alterar regras do jogo para realizar esta revisão.

## 3. Regras visuais compartilhadas

Estes valores são pontos de partida para implementação e comparação visual, não uma receita para aplicar indiscriminadamente à TV.

| Elemento | Regra de implementação |
|---|---|
| Tipografia | Concentrar em quatro papéis: título da página, título de seção, texto de leitura e metadado. Começar com 28–32 px, 20–24 px, 16 px e 13–14 px, respectivamente, nas telas de operação. Portal e projeção têm escala própria. |
| Textos longos | Alinhamento à esquerda, entrelinha confortável próxima de 1,5 e largura controlada. Não diminuir texto para caber no cartão. |
| Números | Usar algarismos de largura constante onde houver tempo, pontuação e contagens, se a fonte suportar. Evitar deslocamentos a cada atualização. |
| Espaçamento | Usar escala curta e recorrente, por exemplo 4, 8, 12, 16, 24 e 32 px. Agrupar conteúdo relacionado com distância menor que a separação entre grupos. |
| Superfícies | Fundo discreto; uma superfície principal; grupos internos preferencialmente separados por espaço ou linha. Evitar cartão com sombra dentro de outro cartão com sombra. |
| Bordas | Padronizar uma família, começando com 16 px em cartões, 10 px em campos e pílula nos botões principais. Não mudar formas arbitrariamente entre telas. |
| Ações | Uma ação com maior destaque por área de tarefa. Botões secundários neutros, links auxiliares discretos, ação destrutiva identificada sem competir com a operação normal. |
| Cor | Azul para ação; teal como acento de marca; verde, vermelho e âmbar com significado de estado. Preservar cores de times e indicadores quando fizerem parte do jogo. Cor não pode ser a única informação. |
| Selos | Reservar preenchimento e contorno para estado ou classificação útil. Metadados comuns podem ser texto simples. Não dar aparência de botão a informação sem interação. |
| Ícones | Usar a família já existente para controles administrativos. Preservar corações, troféus e outros símbolos lúdicos que explicam o jogo; alinhar tamanho e posição. |
| Fundos | Atenuar a textura granulada do portal e o padrão de pontos atrás da atividade do aluno. Decorar áreas de ambientação; manter leitura e preenchimento em superfícies estáveis. |
| Sombras | Baixas e consistentes. Reservar maior separação visual para diálogo aberto e elementos sobrepostos. Reduzir o brilho do botão para que forma e contraste sustentem sua importância. |
| Interação | Preservar foco visível, hover, pressionado, desabilitado, carregamento e erro. Evitar movimento contínuo nas áreas de leitura; respeitar preferência por movimento reduzido. |

## 4. Trabalho por tela, na ordem de prioridade

### Etapa A — Portal e acessos

Referências: `01-portal-desktop.png`, `02-portal-celular.png`, `03-entrada-aluno.png`, `04-login-professor.png`.

1. Portal: manter a composição centralizada com marca, “Descubra o PROMPT” e entrada. Aplicar os cortes de apoio do plano de texto.
2. Recalcular o tamanho do painel após os cortes: não deixar uma moldura enorme em torno de três elementos. Começar com largura máxima de 720 px no desktop e margens de 16–24 px no celular; ajustar pelo título real.
3. Manter o título como elemento mais forte, seguido do botão. Diminuir textura de fundo, sombras e contornos que competem com eles.
4. Entradas de aluno e professor: usar a mesma família de painel, campos e botões, com largura máxima próxima de 440 px. Identificação e campos suficientes, sem selos redundantes.
5. Campos com rótulos persistentes. Mensagens de erro surgem junto do campo e não deslocam inesperadamente o foco.

Aceite: marca, título e ação cabem na primeira tela em 390 × 844 e 1440 × 900; botão não quebra o texto; o portal continua visualmente equilibrado após retirar conteúdo.

### Etapa B — Experiência do aluno

Referências: `16-aluno-espera.png`, `17-aluno-missao.png`, `18-aluno-feedback.png`, `19-aluno-resultado.png`, `20-aluno-final.png`, `33-aluno-votacao.png`.

1. Cabeçalho: reunir marca, identificação da sala e saída em uma faixa compacta. Manter o estado do jogo logo abaixo, com proporção secundária à tarefa.
2. Espera: uma mensagem principal e a ilustração existente em proporção menor. Remover as várias formas de dizer “aguarde”.
3. Missão: uma área contínua com título, conteúdo necessário e resposta. Evitar dividir cada parte em cartão, selo e numeração próprios.
4. Campo de resposta: começar com 4–6 linhas e crescer com o conteúdo. Contador e tentativas ficam próximos do campo; envio vem logo depois. Preservar a missão completa e a imagem com acesso a ampliação.
5. Remover cartões sem dados durante a tarefa. Conteúdo de rodadas anteriores pode ser consultado em um grupo de histórico, sem dominar a atividade atual.
6. Avaliação: nota, feedback e possibilidade de nova tentativa primeiro. Detalhamento de critérios acessível em uma abertura; enunciado continua disponível para consulta e revisão.
7. Votação: pergunta e opções formam a área principal. Retirar o grande cartão de espera enquanto votar é possível. Manter confirmação e possibilidade de trocar voto quando previstas nas regras.
8. Final: título curto, colocação e ranking em destaque; resultados por missão e detalhes dos destaques acessíveis abaixo, inicialmente recolhidos.

Aceite: um estado principal por vez; nenhum cartão vazio na missão inicial; textos de opções permanecem completos; envio e feedback são fáceis de localizar; teclado virtual não cobre permanentemente campos ou controles.

### Etapa C — Painel do professor e sala

Referências: `06-painel-populado.png`, `09-detalhes-sala.png`, `27-arena-painel.png`, `28-arena-painel-meio.png`, `29-arena-painel-fundo.png`, `36-aulas-banco.png`.

1. Dar foco às seções da navegação existente: salas, banco, aulas e relatório. Evitar despejar todo o catálogo abaixo da sala que está em operação. Preservar navegação por teclado, indicação da seção e retorno à sala.
2. No detalhe da sala, criar uma área de operação compacta com nome, estado, participantes e ação correspondente à fase.
3. Antes da partida, dar destaque ao código/QR. Durante a missão, reduzir essa área e manter “Convidar participantes” acessível para quem chega depois.
4. Controles de pausar, retomar, encerrar e avançar ficam junto da missão atual conforme o estado. Não escondê-los em menu genérico.
5. Edição, organização e exclusão ficam em “Gerenciar sala”. A diferença entre prévia da TV e projeção real precisa continuar explícita.
6. Missões: lista compacta com título, situação, tempo e pendências. Abrir detalhes da missão para consultar enunciado e gabarito. Não usar um grande retângulo vazio para uma imagem que não existe e não é exigida.
7. Participantes: manter contagem e progresso de envios visíveis. Lista nominal recolhível quando não for necessária; ao usá-la para acompanhar quem falta, mantê-la aberta. Renomear/remover não precisam ter o mesmo peso do nome.
8. Sorteio: regra selecionada, quantidade, ação e resultado próximo. Retirar a repetição da mesma regra fora e dentro do botão. Manter motivo de indisponibilidade.
9. Banco e aulas: alinhar títulos, metadados e ações entre cartões. Consolidar categorias repetidas e abrir lista de missões sob demanda. Não esticar cartões apenas para preencher altura.

Aceite: com três missões e oito participantes, a próxima ação da aula está na primeira área visível do desktop; atualizar a sala não fecha detalhes abertos, rouba foco ou apaga campos; reduzir largura não produz uma coluna interminável de ferramentas abertas.

### Etapa D — Formulários e prévias

Referências: `07-novo-desafio.png`, `37-desafio-campos-finais.png`, `10-tempos.png`, `11-editar-sala.png`, `12-adicionar-missao.png`, `39-nova-sala-arena-final.png`, `13-previa-aluno.png`, `41-previa-resultado.png`.

1. Desktop: diálogo com largura e altura limitadas à janela; cabeçalho reconhecível e apenas uma região interna de rolagem. Celular: painel ocupando a largura disponível, com margens pequenas e fechamento claro.
2. Se o rodapé de salvar for fixo, reservar espaço para que ele não cubra o último campo, as mensagens ou o foco do teclado.
3. Novo desafio: agrupar conteúdo do aluno, avaliação e ajustes. Mostrar o necessário à modalidade; opcionais com resumo e expansão. Não converter em um assistente de muitas etapas.
4. Critérios e pesos podem ser recolhidos depois de apresentados em resumo fiel. Mostrar pendências; abrir automaticamente o grupo com erro.
5. Nova sala: básicos e seleção de missões em primeiro plano; ajustes extras da Arena em seção recolhível. Edição simples da sala recebe somente padronização visual.
6. Tempos: linhas com título, duração e sugestão. Enunciado e justificativa acessíveis por missão, sem parágrafos repetidos em todas as linhas.
7. Prévia do aluno: faixa compacta com identificação de prévia, estado selecionado e voltar. Controles adicionais em “Opções da prévia”. Aviso de dados de exemplo permanece explícito.
8. Recolher a ferramenta de inspeção sem alterar a renderização do aluno. Não criar uma segunda implementação visual da mesma tela.

Aceite: salvar/fechar são alcançáveis em tela baixa; valores sobrevivem a recolher seções; erros ficam expostos; a prévia mostra o início da atividade na primeira tela do celular.

### Etapa E — TV e projeção

Referências: `14-tv-espera.png`, `15-tv-round.png`, `15-tv-results.png`, `15-tv-final.png`, `30-arena-tv-espera.png`, `40-projecao-dialogo.png`.

1. Preservar tema escuro e composição própria de projeção. Compartilhar família tipográfica, ícones e significados dos estados com as demais telas.
2. Espera: código/QR e entrada da turma. Rodada: missão e tempo. Votação: pergunta, alternativas e prazo. Resultado: placar e destaque do vencedor.
3. Aumentar o contraste e a escala das informações essenciais quando os testes indicarem necessidade. Cortar metadados administrativos em vez de reduzir todo o conteúdo para caber.
4. Usar apenas um título principal para o resultado final. Manter a celebração breve e sem obstruir o ranking.
5. Conexão da projeção: QR, código e ação de abrir em hierarquia clara; alternativa por endereço acessível. Não confundir código da sala com código de projeção.

Aceite: capturas em 1920 × 1080 e 1280 × 720 sem corte de missão, opções ou controles; dados de exemplo identificados somente na prévia; testar legibilidade no equipamento real antes de afirmar que funciona a distância.

### Etapa F — Relatório e estados auxiliares

Referências: `21-relatorio.png`, `22-relatorio-celular.png`, `42-relatorio-meio.png`, `43-relatorio-fundo.png`, `26-nao-encontrada.png`.

1. Começar com título, filtro de período e quatro indicadores: participantes, envios, acerto médio e tempo médio, preservando a definição atual de cada métrica.
2. Organizar a consulta em resumo, participantes e respostas, com detalhes operacionais acessíveis em grupo secundário. Exportar e imprimir permanecem visíveis, com destaque inferior à leitura dos resultados.
3. Usar menos cartões e mais agrupamentos por assunto. Gráficos devem ter uma função de leitura identificável, títulos curtos e legenda quando necessária.
4. Consolidar estados vazios sem perder a indicação do período filtrado. Não inventar dados nem esconder a ausência deles.
5. No celular, indicadores em grade de duas colunas quando legíveis. Tabelas largas com rolagem própria identificável, sem alargar toda a página. Não converter cada célula em um cartão.
6. Na página não encontrada, há uma oportunidade pequena de consistência: aplicar tipografia e fundo do produto, mensagem curta e retorno ao portal. Isso é acabamento de baixa prioridade, não uma nova página promocional.

Aceite: o resumo antecede gráficos e tabelas; dados completos continuam consultáveis; exportação e impressão conservam conteúdo e significado.

## 5. Sequência técnica e proteção do comportamento

1. Ler instruções aplicáveis do repositório e registrar o estado de trabalho existente. Preservar alterações de terceiros.
2. Capturar a versão atual com dados de demonstração isolados, nos mesmos tamanhos das referências. Verificar que cada captura corresponde ao estado pretendido.
3. Identificar as regras efetivas nas folhas de estilo carregadas. Consolidar propriedades dos componentes tocados, evitando acrescentar mais uma camada de sobrescritas sem necessidade.
4. Implementar as etapas A a F em blocos revisáveis. Aplicar o pequeno conjunto de regras visuais nas superfícies tocadas, sem refazer toda a arquitetura.
5. Preservar identificadores de eventos, atualizações em tempo real, dados, autenticação, validações, pontuação e regras de acesso ao gabarito.
6. Usar elementos nativos de botão e abertura de detalhes quando adequados. Conteúdo recolhido deve manter nome acessível, estado aberto/fechado e acesso por teclado.
7. Consultar `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\src\web\pages\index.mjs`, `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\public\assets\js\arena.js`, `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\public\assets\js\app.js` e folhas carregadas em `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\public\assets\css\`. Confirmar os arquivos atuais antes de editar. Algumas mensagens também vêm dos produtores de API.
8. Rodar os testes do projeto e a verificação em navegador após as alterações pertinentes. Rever conscientemente os contratos de CSS e cópia quando houver mudança visual intencional; não apagar testes ou atualizar referências só para eliminar falhas.

## 6. Verificação e entrega obrigatórias

- Prints antes/depois com os mesmos dados, estado, largura e posição de rolagem. Conferir também as regiões internas que uma captura de página inteira pode não revelar.
- Dimensões: 390 × 844 e 1440 × 900 para fluxos principais; 1280 × 720 para formulários em tela baixa; 1920 × 1080 e 1280 × 720 para TV.
- Cobertura: entrada, espera, missão com texto e imagem, avaliação, nova tentativa, votação, Wild Card, resultado, encerramento, painel, sala, banco, aulas, formulários, prévias e relatório vazio/populado.
- Estados complementares: carregamento, erro de formulário, conexão instável, pausado e ação indisponível. Não remover explicações que permitem recuperar um erro.
- Contraste medido, foco visível, zoom de 200%, rótulos acessíveis e alvos de toque confortáveis. Texto menor ou cor mais clara não são soluções para excesso de informação.
- Confirmar que atualizações automáticas preservam abertura de detalhes, rolagem e foco. Não pode haver perda de rascunho nem gabarito exposto ao aluno.
- Registrar o que mudou, quais comportamentos foram testados e quais estados ainda não puderam ser verificados. Não declarar cobertura integral quando faltarem variações.

As referências visuais estão em `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\output\auditoria-texto\`. As referências existentes não cobrem todas as dinâmicas ou erros. `34-tv-votacao.png` mostrou um estado anterior e não prova a votação da TV. O Wild Card não foi capturado na auditoria anterior. Criar evidências válidas para esses estados antes de concluir a implementação.

## 7. Instrução para a outra IA

Implemente este plano de correção visual da Live Arena, começando pelo portal e pelos estados do aluno, depois painel, formulários, prévias, TV e relatório. Confirme primeiro a interface atual e use os prints desta pasta como referência histórica. Aplique também os cortes de texto pertinentes de `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\output\auditoria-texto\PLANO-DE-CORRECAO.md`, respeitando as ressalvas deste documento. Preserve a marca e o funcionamento do produto. Entregue composição mais clara, componentes consistentes, detalhes acessíveis sob demanda, comparação visual antes/depois e verificação funcional proporcional às mudanças. Não invente telas, regras de jogo ou dados para preencher espaço. Não publique o projeto sem instrução específica para publicação.

