---
name: copia-de-interface
description: Decidir e cortar o texto visível das telas deste produto (pt-BR) — rótulos, botões, dicas, mensagens de erro, estados vazios, títulos de painel, o texto gerado pelo cliente e o que o servidor manda por API (mode_hint, cannot_reason, teach e irmãos). Use quando o pedido for "tem texto demais", "isso explica demais", revisar a cópia de uma tela, enxugar o painel do professor ou o cliente, encurtar uma dica que a tela lê do servidor, ou quando a guarda de orçamento (test/copia/orcamento.test.mjs) reprovar. Aplica os quatro padrões (propósito, concisão, conversa, clareza), a regra de cortar filler e não fato, e metas de palavras por tipo de string. Não use para escrever texto novo além do que substitui o cortado, para marketing ou documentação, nem para reescrever a língua do produto em geral — e nunca para cortar fato em nome da brevidade.
---

# Cópia de interface (pt-BR)

Faixa independente, como as outras skills deste repositório: mede e propõe corte de
texto, e para aí. Ela **não** substitui a guarda — a guarda é memória, esta skill é
julgamento. A guarda conta palavras e reprova o crescimento; ela não sabe dizer se a
frase deveria existir. É este o trabalho daqui.

## Fronteira

- Corte é a entrega, invenção não é: o texto novo existe só para substituir o que
  saiu, e nunca é maior que o que estava lá.
- **Fato nunca cai.** Filler cai. A seção "A armadilha da brevidade" define a
  diferença; na dúvida, o texto fica e a dúvida é registrada.
- Não conserte o controle por conta própria nesta faixa. Se a frase existe para
  compensar um controle ambíguo, o conserto é o controle — mas mexer no controle é
  outra frente. Aqui: nomeie o defeito, mantenha o texto, registre a dívida.
- Não mexa em layout, CSS, classe ou `data-*`. A cópia é o alvo; a guarda de classes
  (`test/css/classes-vivas.test.mjs`) reprova se um elemento que produz uma classe
  desaparecer. Corte texto **dentro** dos elementos existentes.
- Não julgue a língua portuguesa do produto inteiro. Acentuação e gramática entram
  só quando a própria string está sendo reescrita.
- Nunca declare "texto cortado" sem o número: antes, depois e onde.

## Os quatro padrões, na ordem em que se aplica

A ordem é o método. Aplicar concisão antes de propósito produz corte bonito e inútil.

1. **Propósito** — a string ajuda a pessoa a fazer o que veio fazer ali? Se ela só
   descreve o que já está na tela ao lado, não tem propósito: sai.
2. **Concisão** — cada palavra tem função? Vale para o que sobrou do passo 1.
3. **Conversa** — soa como alguém falando, e não como sistema? Em pt-BR: verbo no
   imperativo ("Salvar", "Encerrar rodada"), tratamento por "você", sem gerúndio
   encadeado ("estamos processando" → "processando…").
4. **Clareza** — sem ambiguidade, com o termo certo. Uma coisa, um nome: se o painel
   chama de "missão", a tela do aluno não chama de "rodada".

## A armadilha da brevidade: cortar filler, não fato

Brevidade não é melhoria. Antes de cortar uma oração, pergunte: **isto diz algo que a
pessoa precisa saber para usar a tela com segurança?** Se diz, é fato e fica — aperte
o resto. A regra existe por um motivo: ela foi escrita depois de uma auditoria real em
que a brevidade cortou a informação de confiança que o usuário precisava, e é o risco
direto de trabalhar com teto de palavras.

| Filler (cai) | Fato (fica) |
|---|---|
| "Agora você pode…", "Nada é aplicado sozinho", "Fique de olho na tela!" | O que foi ou não gravado: "A conexão falhou e nada foi gravado." |
| "successfully", "com sucesso", "Por favor", "Atenção:", "Importante:" | O que se perde: "Recomeçar a partida? O Juiz volta cheio e a energia zera." |
| "estamos tentando reconectar com o servidor" | O que foi preservado: "Os tempos que você digitou continuam aqui." |
| Consequência do óbvio: "Clique no botão para enviar" | Prerequisito e limite: "de 15 s a 1 h", "até ~1,4 MB" |
| "Note que", "Lembre-se de que" | Garantia de reversibilidade e o próximo passo |

Frases longas de erro **não** são gordura: erro perdeu o direito de ser curto no
momento em que a pessoa ficou sem saber o que aconteceu. As duas frases longas que
sobreviveram ao corte de set/2026 são exatamente as que dizem que nada foi gravado e
que o trabalho do professor continua na tela.

## Metas por tipo de string

Contagem no mesmo critério do inventário (`palavras()`: só token com 2+ caracteres
alfanuméricos). São tetos, não médias — passar deles é o sinal.

| Tipo | Meta | Teto duro |
|---|---|---|
| Botão e CTA | 2–4 | 6 |
| Título de painel, `h1`–`h3` | 3–6 | 8 |
| Rótulo de campo, coluna, chip | 1–3 | 3 |
| Instrução e dica (`<p>` de apoio) | até 14 | 20 |
| Mensagem de erro ou de estado | 12–18 | 25 |
| Confirmação destrutiva | 10–18 | 25 |
| Notificação, toast, aviso de rodapé | 5–10 | 15 |

Duas regras que pegam mais que a contagem:

- **Parêntese explicando rótulo é rótulo errado.** `Missão (o que o aluno deve
  produzir)`, `Tempo (vazio = sem cronômetro)`, `Imagem que o aluno vê (arquivo,
  ~1,5 MB)`: o rótulo fica nú e o limite ou vira dica própria, ou vira mensagem de
  erro quando for de fato violado. O campo ser obrigatório é do HTML, não do rótulo.
- **Réplica conta como duas.** "Ctrl + Enter" aparecendo na dica e dentro do botão da
  mesma tela é a mesma instrução duas vezes. O inventário conta as duas; o olho não.

## Onde a cópia mora neste produto — e onde a guarda olha

| Onde | O que é | Entra no orçamento? |
|---|---|---|
| `src/web/pages/index.mjs` | HTML que o servidor devolve (as telas, por superfície) | sim, por tela |
| `public/assets/js/arena.js` | o cliente de todas as telas da arena: aluno e sua prévia, painel e login do professor, TV e sua prévia (6 superfícies, 1 bundle) | sim, por bundle |
| `public/assets/js/app.js` | portal e relatório | sim, por bundle |
| `drawView` (`src/domain/arena-draw.mjs`); `ARENA_DYNAMICS`, `ARENA_POWERS` (`src/domain/arena-mode.mjs`) | texto que vai **por API** e a tela mostra depois — `mode_hint`, `cannot_reason`, `label`, `question`, `teach`, `hint` | **sim, campo por campo** (família `api`) |
| `src/server/arena-api.mjs` (erro e estado), `src/server/validation.mjs`, `src/server/http.mjs` | mensagens de erro que a API devolve e a tela mostra | **não** — é o pedaço que continua aberto |

A família `api` existe desde 2026-09-15 e mede **o produtor, por chamada real**
(`drawView` e os dois catálogos são puros: nenhum lê disco, grava ou conhece HTTP).
Ela não é varredura de literal justamente porque no bundle não há o que varrer — o
cliente só interpola (`${esc(draw.mode_hint)}`). Medição de então, para calibrar:
`sorteio.mode_hint` 12 palavras · `sorteio.cannot_reason` 36 · `dinamica.label` 19 ·
`dinamica.question` 46 · `dinamica.teach` 67 (8 dinâmicas, não 12 como já se disse
por aqui) · `poder.label` 8 · `poder.hint` 34 — **222 no total**, cada campo com teto
próprio, catraca e `nota`.

O que isso muda no corte: a frase que o aluno lê nesses pontos da tela vem do
**servidor**. Enxugar o cliente ali não encurta nada do que ele lê — aparece no
orçamento como `cliente −N` com `api` intacto —, e a pista longa que sobreviveu no
sorteio é exatamente esse caso. Quando o alvo for uma dessas frases, o corte que
conta é no produtor, e o número que cai é o do campo.

A guarda morde por quatro lados aqui, e vale saber o que cada reprovação significa:

- **campo acima do teto** — a frase cresceu; nomeia campo, contagem e onde ele
  aparece (`api dinamica.teach: 78 palavras, teto 67 (+11)`);
- **campo morto** — o produtor deixou de mandar o campo (renomearam `mode_hint`, por
  exemplo) e a régua ficou medindo o vazio: ajuste a declaração, não a frase;
- **campo que o cliente deixou de mostrar** — o texto continua vivo no servidor sem
  aparecer na tela; ou volta a renderização, ou o campo sai da declaração;
- **cobertura do payload** — campo de texto novo num produtor reprova até ser
  declarado como frase (medido) ou como rótulo. Mesmo espírito da cobertura de rotas:
  frase de tela não nasce sem orçamento.

O que a guarda mede e o que ela não mede: palavras visíveis por tela, por bundle e por
campo de API, e nada mais. `test/css/render.json` retrata propriedades computadas de
estilo e **nenhum texto** — corte de texto não move o retrato, então o portão 2 não
precisa ser regravado por causa de cópia. E ela não julga qualidade: uma tela pode
estar abaixo do teto e ainda explicar o que não precisa.

## Workflow

1. **Medir antes de opinar.** Dois comandos, e os dois são leitura:
   - `node scripts/inventario-copia.mjs` — a tabela (hoje / site base / teto), o
     perfil **frase × rótulo** de cada bundle e o **texto de API com a frase
     inteira** (esta última é o que a tela mostra de verdade quando o alvo é uma
     dica). `--trechos` lista cada trecho do cliente com `arquivo:linha`.
   - `node scripts/varredura-copia.mjs` — a FILA, **tela por tela**: as frases
     candidatas de cada superfície com `arquivo:linha`, as **réplicas** (a mesma
     string em dois elementos da mesma tela) e as **divergências servidor ×
     cliente**. É por aqui que se responde "o que ainda sobra na tela X" sem abrir o
     navegador.

   Sobre a divergência, porque ela não é texto demais e é o achado mais caro: o
   servidor serve o esqueleto e o cliente sobrescreve o mesmo elemento — quando os
   dois dizem frases diferentes, o aluno lê a do servidor ANTES de o script rodar.
   Foi assim que "Fique de olho na tela!" sobreviveu ao corte de set/2026: saiu do
   cliente, ficou no HTML do servidor. Nenhum teto pega isso, porque nada cresceu.
   A linha `igual no cliente` da varredura é o outro lado da mesma moeda: a lista
   dos elementos que os dois arquivos escrevem iguais — todo corte ali tem de
   acertar os DOIS, e é isso que a guarda de teto não cobra.
2. **Montar a fila com o perfil, não com a tabela.** Rótulo é o preço da tela existir
   ("Rodadas", "Corações do Juiz"); frase é candidata. Persiga frase antes de encostar
   em rótulo: cortar rótulo apaga tela, cortar frase apaga ruído.
3. **Classificar cada candidata** em: filler (sai), fato (fica), ou explicação que
   compensa controle ambíguo. No terceiro caso: o texto fica **e** o defeito do
   controle vira item declarado no relatório — não conserte o controle nesta faixa.
4. **Medir o efeito por string, não só por tela.** A meta por tipo da seção anterior é
   o que decide se a substituição ficou boa; a tela pode continuar abaixo do teto com
   uma string ainda acima do dela.
5. **Editar na ordem dos quatro padrões.** Reescreva, releia em voz alta, confira que o
   termo casa com o resto do produto.
6. **Provar.** `npm test` (a guarda de cópia e a suíte) e, se o corte tocou tela viva,
   `npm run test:browser` — o portão 2 confirma que nada de estilo se moveu.
7. **Registrar.** Corte que baixa a contagem **aperta** a régua: regravar o cartório
   (`UPDATE_COPY_BASELINE=1 node --test test/copia/orcamento.test.mjs`) baixa o teto de
   cada tela, bundle e **campo de API** para o medido, e é isso que faz o corte valer
   para sempre. Folga
   deliberada exige `nota` escrita no cartório; o campo `contexto` registra o que a
   régua não vê (por que o residual acima do site base é rótulo estrutural) e não sobe
   nem segura teto nenhum.
8. **Declarar o que não foi cortado** e por quê. Um relatório de corte sem a lista do
   que ficou é indistinguível de um corte que passou por cima de fato.

## Contrato de saída

Uma linha por achado, no mesmo formato do erro da guarda — quem lê o relatório e quem
lê a reprovação do teste têm de ver a mesma frase:

```
**[TELA ou BUNDLE] arquivo:linha — categoria**
Atual:        "o texto que está lá"     (N palavras, meta M)
Recomendado:  "o texto proposto"        (K palavras)
Por que:      uma frase, no vocabulário dos quatro padrões
```

Depois dos achados, o resumo:

- medido × teto × site base, por tela e por bundle, com a data da medição;
- perfil frase × rótulo de cada bundle que foi tocado;
- **o que não foi cortado** e por quê (fato, erro, controle ambíguo, réplica pendente);
- todo teto que ficou acima do medido, com a `nota` escrita que o justifica;
- se algum texto veio do servidor (**família `api`**), se o corte foi feito também
  lá — e qual campo caiu, senão a frase longa segue na tela.

Não afirme melhoria sem o número. Números escritos em relatório envelhecem — os que
aparecem nesta skill são o retrato de set/2026 e servem de calibração, não de meta:
meça de novo antes de citar.

## Referências

- [references/cortes-feitos.md](references/cortes-feitos.md) — o corpus real do corte de
  set/2026: cada antes/depois com a regra aplicada e as palavras economizadas, mais os
  que **não** foram cortados e por quê. É a calibração de voz deste produto; leia antes
  de propor substituição.
