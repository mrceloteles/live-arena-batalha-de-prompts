// Catalogo de progressao pedagogica: conjuntos de desafios prontos por aula.
export const LESSONS = Object.freeze([
  {
    id: 'aula2-fundacao',
    title: 'Aula 2 — Fundação',
    focus: 'Objetivo, contexto, público, formato e restrições; melhorar prompts genéricos.',
    icon: '🧱',
    challenges: [
      { title: 'Resgate: apresentação de IA', modality: 'resgate', mission: 'Faça uma apresentação sobre inteligência artificial.', context: 'Este é o ponto de partida. Defina o público, o objetivo, o formato e o nível de detalhe para melhorar o resultado.', expected_result: 'Um prompt capaz de gerar uma apresentação realmente utilizável.', duration_seconds: 180, speed_weight: 'none', category: 'Fundamentos' },
      { title: 'Precisão: cartaz da feira', modality: 'precisao', mission: 'Crie um cartaz para a feira de tecnologia da escola.', context: 'Feira anual de projetos do ensino médio, aberta à comunidade.', expected_result: 'Cartaz A3 chamativo para adolescentes, com horários, estandes e contato.', duration_seconds: 180, speed_weight: 'none', category: 'Fundamentos' },
      { title: 'Essencial: resumo de IA', modality: 'essencial', mission: 'Explique o que é inteligência artificial em poucas palavras.', context: 'Objetividade máxima: o melhor prompt em até 250 caracteres.', expected_result: 'Um prompt curto e completo, sem palavras desperdiçadas.', duration_seconds: 150, speed_weight: 'none', category: 'Fundamentos' },
      { title: 'Diagnóstico: falta algo', modality: 'diagnostico', mission: 'Explique inteligência artificial.', context: 'Este prompt está incompleto: faltam público, nível, objetivo, formato e profundidade.', expected_result: 'A versão completa do prompt, identificando tudo o que faltava.', duration_seconds: 180, speed_weight: 'none', category: 'Fundamentos' },
    ],
  },
  {
    id: 'aula3-controle',
    title: 'Aula 3 — Controle do resultado',
    focus: 'Especificidade, formatos, estrutura, documentos e respostas controladas.',
    icon: '🎯',
    challenges: [
      { title: 'Documento: relatório técnico', modality: 'completo', mission: 'Gere um relatório técnico sobre o projeto de robótica.', context: 'O relatório será lido pela banca avaliadora da feira.', expected_result: 'Prompt que especifica estrutura, seções, público, finalidade, nível de detalhe e formato.', duration_seconds: 200, speed_weight: 'none', category: 'Documentos' },
      { title: 'Tabela comparativa', modality: 'precisao', mission: 'Crie uma tabela comparando três linguagens de programação.', context: 'Para iniciantes escolherem a primeira linguagem.', expected_result: 'Prompt que define colunas, linhas, critérios de comparação e público.', duration_seconds: 180, speed_weight: 'none', category: 'Documentos' },
      { title: 'Instruções estruturadas', modality: 'completo', mission: 'Escreva um passo a passo para configurar um repositório Git.', context: 'Alunos do 1º ano, sem experiência com terminal.', expected_result: 'Prompt com passos numerados, pré-requisitos, erros comuns e formato claro.', duration_seconds: 200, speed_weight: 'none', category: 'Documentos' },
      { title: 'Briefing: o cliente confuso', modality: 'briefing', mission: 'Quero uma postagem para minha empresa. Tem que parecer profissional, mas não muito formal. Meu público é jovem. Não quero muito texto. Quero algo bonito.', context: 'O cliente falou exatamente assim. Transforme o pedido em um prompt profissional.', expected_result: 'Prompt com público, tom, formato, restrições e objetivo claros.', duration_seconds: 200, speed_weight: 'none', category: 'Briefing' },
    ],
  },
  {
    id: 'aula4-visual',
    title: 'Aula 4 — Multimodal e visual',
    focus: 'Imagens, referência visual, descrição e engenharia reversa.',
    icon: '🎨',
    challenges: [
      { title: 'Reversa: cartaz publicitário', modality: 'reversa', mission: 'Uma peça publicitária sofisticada de um festival de música, com tipografia grande, paleta neon sobre fundo escuro e destaque para a data.', context: 'Descreva a referência visual com enquadramento, cores, composição e atmosfera.', expected_result: 'Prompt que recriaria uma peça com essas características.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
      { title: 'Reversa: fotografia', modality: 'reversa', mission: 'Uma fotografia de retrato com luz lateral suave, fundo desfocado urbano à noite, tons quentes e atmosfera cinematográfica.', context: 'Identifique enquadramento, iluminação, estilo, ambiente, composição e atmosfera.', expected_result: 'Prompt de descrição fotográfica completa.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
      { title: 'Reversa: infográfico', modality: 'reversa', mission: 'Um infográfico educativo sobre energia solar: 5 seções numeradas, ícones simples, cores amarelo e azul, para alunos do 6º ano.', context: 'Traduza a referência em instruções visuais e de conteúdo.', expected_result: 'Prompt que gera um infográfico com aquela estrutura e estilo.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
      { title: 'Reversa: interface de app', modality: 'reversa', mission: 'Uma tela de aplicativo de estudos: cabeçalho com saudação, barra de progresso semanal, grade de disciplinas em cartões e botão flutuante de nova tarefa.', context: 'Descreva a estrutura da interface em instruções precisas.', expected_result: 'Prompt que orienta a construção de uma interface com essa referência.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
    ],
  },
  {
    id: 'aula5-final',
    title: 'Aula 5 — Arena final',
    focus: 'Sequência completa da batalha final: 7 missões misturando tudo.',
    icon: '🏆',
    challenges: [
      { title: 'M1 Precisão: e-mail profissional', modality: 'precisao', mission: 'Escreva um e-mail pedindo participação em um evento de tecnologia.', context: 'E-mail para a coordenação da escola.', expected_result: 'Prompt claro com tom, estrutura e objetivo.', duration_seconds: 120, speed_weight: 'none', category: 'Arena Final' },
      { title: 'M2 Sprint: slogan', modality: 'sprint', mission: 'Crie um slogan para um app de estudos.', context: 'Sprint de 90 segundos: vá direto ao ponto.', expected_result: 'Prompt rápido e eficaz.', duration_seconds: 90, speed_weight: 'low', category: 'Arena Final' },
      { title: 'M3 Essencial: definição', modality: 'essencial', mission: 'Defina machine learning em poucas palavras.', context: 'Até 250 caracteres.', expected_result: 'Prompt curto e completo.', duration_seconds: 120, speed_weight: 'none', category: 'Arena Final' },
      { title: 'M4 Resgate: site de carros', modality: 'resgate', mission: 'Faça um site bonito sobre carros.', context: 'Um pedido inicial que você pode tornar mais claro e específico.', expected_result: 'Prompt de site utilizável.', duration_seconds: 150, speed_weight: 'none', category: 'Arena Final' },
      { title: 'M5 Reversa: anúncio', modality: 'reversa', mission: 'Um anúncio de redes sociais para uma cafeteria, com produto central, fundo quente desfocado e texto curto em destaque.', context: 'Descreva a referência em instruções.', expected_result: 'Prompt que recria o anúncio.', duration_seconds: 150, speed_weight: 'none', category: 'Arena Final' },
      { title: 'M6 Briefing: startup', modality: 'briefing', mission: 'Preciso de um texto pro site da minha startup. Tem que ser moderno, mas sério. É pra investidores e clientes. Não pode ser longo. Precisa passar confiança.', context: 'Transforme o pedido do cliente em um prompt profissional.', expected_result: 'Prompt com público, tom e estrutura claros.', duration_seconds: 150, speed_weight: 'none', category: 'Arena Final' },
      { title: 'M7 BOSS: lançamento', modality: 'boss', mission: 'Planeje o lançamento de um aplicativo de estudos para alunos do ensino médio.', context: 'Missão final: combine necessidade, público, restrições, formato e problema em um prompt completo.', expected_result: 'Prompt completo com contexto, público, formato, critérios e restrições.', duration_seconds: 300, speed_weight: 'none', category: 'Arena Final' },
    ],
  },
]);

export function getLesson(lessonId) {
  return LESSONS.find((lesson) => lesson.id === lessonId) || undefined;
}

