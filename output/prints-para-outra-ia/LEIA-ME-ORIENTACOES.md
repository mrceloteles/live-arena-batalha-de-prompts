# Pacote para adaptar visualmente o Live Arena / Batalha de Prompts

## Conteúdo
- `prints/`: 14 capturas das telas atuais em execução, desktop e celular.
- `prototipo-visual-ajustado.zip`: referência visual ajustada para se alinhar às funções existentes.

## Contexto e fidelidade
As capturas foram feitas de uma execução local do projeto atual, com a interface, rotas e servidor do próprio projeto. Foi usado um banco SQLite temporário e isolado com dados fictícios; nenhum dado de produção foi incluído.

O PIN `CFUV33`, nomes, sala, desafio e respostas visíveis são dados de demonstração. O resultado do aluno foi produzido pelo modo local de fallback, não pelo Gemini nem por um serviço externo. A captura da TV mostra o estado aguardando o código de conexão.

As capturas documentam o produto atual; não são um alvo para copiar pixel a pixel. A identidade visual desejada está no protótipo incluído e na referência visual que o solicitante fornecer.

## Instruções para a IA implementadora
Use as capturas como documentação do produto atual e o protótipo como referência visual.

1. Inspecione o código e associe cada captura às rotas, componentes, ações e estados existentes antes de editar.
2. Aplique a identidade visual às telas e fluxos que existem hoje, preservando seus comportamentos e contratos do backend.
3. Não crie telas, ações, estados, integrações ou funções que o backend atual não suporta. Uma melhoria estrutural visual pode ser adotada apenas se não inventar capacidade do produto.
4. Preserve funções existentes mesmo se não aparecerem nas capturas; confirme pelo código.
5. Não altere o portal inicial nem a estrutura funcional dos fluxos apenas porque o protótipo difere. Use o protótipo para identidade visual e aproveite mudanças estruturais somente quando compatíveis com as funções existentes.
6. Não use logos, nomes ou marcas do Google ou de outros fornecedores externos. Use a identidade própria Live Arena / Batalha de Prompts.
7. Não mude regras de negócio, APIs, autenticação, persistência nem lógica do jogo para acomodar o desenho. Adapte o visual à informação e capacidade reais.
8. Ao concluir, teste fluxos existentes em desktop e celular e liste telas atualizadas, funções preservadas e limitações encontradas.

## Índice
1. Portal inicial — desktop
2. Entrada do aluno — desktop
3. Login do professor
4. Painel do professor — sala de demonstração
5. Controle da sala
6. Professor com missão ativa
7. Missão do aluno — celular
8. Prompt preenchido — celular
9. Resultado do aluno — celular, resultado local de demonstração
10. Banco de desafios
11. Aulas e trilhas
12. Relatório com uma submissão fictícia
13. TV/projeção aguardando código
14. Portal inicial — celular
