# Plano fechado — Tela “Sala em destaque” (LA-06)

## Objetivo

Fazer a tela da sala em destaque parecer um cockpit de aula ao vivo: o professor entende em poucos segundos qual sala está selecionada, se a turma pode entrar, qual é a próxima ação e como a batalha está evoluindo. A tela deve aproveitar bem o espaço, manter as ações importantes à vista e eliminar texto corrido que não ajuda na decisão.

## Limite da tela

Este plano cobre somente a área da sala selecionada dentro do painel do professor. A navegação lateral, a página inicial, a tela do aluno e o telão só devem ser alterados quando uma mudança de estado desta sala exigir atualização sincronizada.

## Ordem final da composição

### 1. Cabeçalho da sala — uma única faixa

O cabeçalho é o primeiro bloco visual e ocupa toda a largura do conteúdo.

Colunas em desktop:

1. **Código da sala**: cartão navy com PIN grande, estado do acesso e botão “Copiar código”.
2. **Identidade da aula**: título da sala, selo de estado e uma linha curta de contexto (disciplina/turma/modo).
3. **Acesso rápido**: QR code, “Copiar acesso” e “Abrir telão”.

Na base da coluna de acesso ficam três ações sempre reconhecíveis e agrupadas:

- **Editar** — abre o diálogo da sala selecionada.
- **Bloquear/Liberar** — alterna a entrada e atualiza o selo do PIN.
- **Excluir** — disponível em rascunho, aguardando ou arquivada; visível e desabilitado durante uma batalha em andamento, com explicação ao passar o mouse.

Não repetir essas ações no cabeçalho e em outro bloco. O menu `•••` fica reservado para ações raras de ciclo de vida, como “Encerrar sala” e “Arquivar”.

### 2. Indicadores — quatro cartões compactos

Logo abaixo do cabeçalho, sempre na mesma ordem:

- **Conectados**: conectados / vagas e, em texto menor, inscritos.
- **Rodada**: número da rodada, cronômetro e estado (aguardando, em andamento, pausada ou resultados).
- **Envios de prompts**: enviados / participantes e progresso.
- **Média do juiz**: média, quantidade avaliada e estado da fila.

Cada cartão deve ter um número dominante, um rótulo curto e no máximo uma linha auxiliar. Não usar parágrafos explicativos dentro dos cartões.

### 3. Comandos de batalha — uma bancada, não uma lista

O título da seção é “Comandos de batalha em tempo real”, com o selo de conexão à direita.

- Uma única ação recebe destaque visual: a **próxima ação**.
- Ações da aula ficam na mesma linha: pausar/retomar, encerrar rodada, fechar resultados ou iniciar a missão.
- Ações administrativas não entram nessa linha.
- O bloco deve continuar compacto quando existir somente uma ação.

### 4. Sorteio — faixa interativa

Quando o modo Arena estiver ativo, o sorteio aparece como uma faixa horizontal:

- título “Sorteio da vez”;
- quantidade de alunos na sala e no sorteio;
- seletor do modelo;
- quantidade por vez;
- botão “Sortear”;
- resultado atual e histórico somente quando houver resultado.

Evitar transformar cada informação em um cartão independente.

### 5. Conteúdo operacional

Em desktop, participantes e missão ficam em duas colunas:

- **Participantes conectados**: filtros curtos, lista/tabela com nome, estado, tempo, nota e ações.
- **Rodada ativa / fila de desafios**: missão atual, imagem ou referência, limite de caracteres, critérios do juiz e fila seguinte.

Em telas menores, as colunas empilham. A lista de participantes vira uma lista de linhas empilhadas, sem rolagem horizontal.

## Regras de texto

- Trocar frases corridas por rótulo + valor.
- Não repetir o estado da sala em três lugares.
- Não repetir preset, vagas e modo no cartão da missão se já estiverem no cabeçalho.
- Usar verbos nos botões: “Iniciar missão”, “Pausar missão”, “Retomar missão”, “Editar”, “Bloquear”, “Excluir”.
- O botão principal e o campo “Próxima ação” precisam usar exatamente o mesmo rótulo.
- Mensagens auxiliares devem explicar uma decisão ou um bloqueio; se não mudam a ação do professor, devem sair da tela.

## Estados obrigatórios

Implementar e revisar visualmente estes estados:

1. Rascunho: editar e excluir ativos; iniciar bloqueado ou ausente conforme a regra de missões.
2. Aguardando participantes: código ativo; iniciar missão como ação principal; bloquear disponível.
3. Sala aberta: código ativo; iniciar missão ou aguardar turma cheia.
4. Em jogo: rodada, cronômetro e envios visíveis; excluir desabilitado; pausar e encerrar à vista.
5. Pausada: botão principal “Retomar missão”; cronômetro congelado e estado explícito.
6. Resultados: notas e média visíveis; “Fechar resultados” como próxima ação.
7. Encerrada: código fechado; arquivar disponível; ações de entrada mortas não aparecem.
8. Sem conexão: manter último estado válido e mostrar apenas o selo “Reconectando”.
9. Sala sem missão: explicar uma única próxima ação, sem painel vazio de informações.

## Responsividade

- **1440 px ou mais**: cabeçalho em três colunas; quatro indicadores em uma linha; participantes e rodada lado a lado.
- **1024–1179 px**: cabeçalho mantém três blocos com largura flexível; indicadores em duas linhas; conteúdo operacional empilhado se a coluna ficar estreita.
- **640–1023 px**: cabeçalho em duas linhas; comandos quebram sem criar overflow; participantes viram lista.
- **390 px**: nenhuma rolagem horizontal; código, título, acesso e gestão em ordem de leitura; cada botão com área mínima de toque de 44 px.

## Acessibilidade e comportamento

- Todos os botões devem ter nome textual ou `aria-label` claro.
- O estado de bloquear deve ser anunciado como “Entrada bloqueada” ou “Entrada aberta”.
- Botões desabilitados precisam ter `title` e texto de apoio explicando como liberá-los.
- Foco de teclado deve ser visível.
- Confirmação obrigatória antes de excluir, encerrar ou arquivar.
- Enquanto uma ação estiver em andamento, desabilitar o botão e mostrar estado de processamento.

## Critérios de aceite

1. Ao selecionar uma sala, o cabeçalho mostra código, título, estado, QR, telão e as três ações de gestão sem abrir menu.
2. Editar abre o diálogo da sala selecionada, nunca o de outra sala.
3. Bloquear altera o selo do código e impede novas entradas sem recarregar a página.
4. Excluir só fica acionável nos estados permitidos e sempre pede confirmação.
5. O professor identifica a próxima ação em menos de um olhar: há apenas um botão dominante.
6. A tela não apresenta texto duplicado nem parágrafos técnicos na área de decisão.
7. O layout cabe em 390 px sem rolagem lateral.
8. Os números exibidos vêm do mesmo estado usado pela API e pelo SSE/polling.
9. Em perda de conexão, o último estado continua legível e a tela informa reconexão.
10. Testes de navegador cobrem os nove estados acima, os três botões de gestão, confirmação de exclusão e os quatro breakpoints.

## Sequência de implementação

1. Congelar a marcação e os nomes dos estados descritos acima.
2. Implementar primeiro o cabeçalho e validar a hierarquia em 1440, 1024 e 390 px.
3. Implementar os quatro indicadores usando uma única fonte de estado.
4. Implementar a bancada de comandos e a regra de uma única ação dominante.
5. Implementar a faixa de sorteio e o conteúdo operacional.
6. Conectar cada botão à API existente e aos eventos de atualização.
7. Executar os testes de comportamento e capturar uma tela de cada estado.
8. Só depois ajustar detalhes de cor, espaçamento e tipografia.

## Limitação desta auditoria

Na captura desta rodada, o servidor local voltou para a tela “Entrar no painel”; portanto a sala em destaque não pôde ser recapturada como evidência visual nesta execução. O plano acima é a especificação de implementação e deve ser validado com uma nova captura autenticada antes de qualquer nova rodada de ajustes visuais.
